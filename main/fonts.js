"use strict";

const fs = require("fs");
const WINDOWS = require("../rules/windows-fonts.json");

/// Font fingerprint protection: pages find only the fonts Windows comes
/// with (rules/windows-fonts.json). A font some other program put on this
/// computer (Office's, Adobe's, a game's…) is one a site can measure to
/// tell this computer, and so every profile on it, from others: pages find
/// none of them (see scripts/parts/fonts.js). No font file comes with the
/// app: Windows' own are on every Windows already.

const lower = (name) => String(name).toLowerCase().replace(/\s+/g, " ").trim();
const FAMILIES = new Set(WINDOWS.families.concat(WINDOWS.supplemental).map(lower));
const PREFIXES = WINDOWS.prefixes.map(lower);
const STYLES = new Set(WINDOWS.styles.map(lower));

/// Whether `name` (a family, or a face's full name) is one of Windows'
/// own: one of its families, alone or followed by style words only
/// ("Segoe UI Semibold", "Bahnschrift Light Condensed"), or a name that
/// starts with a family only Microsoft makes ("Segoe UI Variable Display
/// Semib", as Windows cuts its older names to 31 letters).
const isWindowsFont = (name) => {
  const text = lower(name);
  if (!text) {
    return false;
  }
  if (PREFIXES.some((prefix) => text === prefix || text.startsWith(prefix + " "))) {
    return true;
  }
  const words = text.split(" ");
  // The longest family the name starts with: "Arial Nova Light" is Arial
  // Nova's, and "Arial Narrow" isn't Arial's ("narrow" is no style word).
  for (let count = words.length; count > 0; count--) {
    if (FAMILIES.has(words.slice(0, count).join(" "))) {
      return words.slice(count).every((word) => STYLES.has(word));
    }
  }
  return false;
};

/// The ends Chromium takes off a family it doesn't find, to find the rest
/// at that weight or width ("Gill Sans MT Light": Gill Sans MT at 300).
const SUFFIXES = new Set(["thin", "extralight", "ultralight", "light", "regular", "medium", "demibold", "semibold",
  "extrabold", "ultrabold", "black", "heavy", "ultracondensed", "extracondensed", "condensed", "semicondensed",
  "semiexpanded", "expanded", "extraexpanded", "ultraexpanded"]);

/// What pages are kept from finding, from this computer's font faces
/// (`faces`: [family, full name, PostScript name, style] each, as the
/// browser's queryLocalFonts gives them): `families`, the fonts that
/// aren't Windows' own; `shadow`, the names a page can ask for one of them
/// by in CSS (its family, and its faces' full names but the bold and
/// italic ones, which no family is asked by); `local`, every name
/// FontFace's local() looks a face up by (family, full and PostScript
/// names), in lower case. Each sorted, without repeats.
const hiddenFonts = (faces) => {
  const families = new Map();
  const shadow = new Map();
  const local = new Set();
  for (const face of Array.isArray(faces) ? faces : []) {
    if (!Array.isArray(face)) {
      continue;
    }
    const [family, fullName, postscriptName] = face.map((value) => (typeof value === "string" ? value.trim() : ""));
    const familyHidden = Boolean(family) && !isWindowsFont(family);
    // A face of a Windows family that isn't Windows' (Office's Arial
    // Narrow, among Arial's faces): its own names alone.
    const faceHidden = familyHidden || (Boolean(fullName) && !isWindowsFont(fullName));
    if (!faceHidden) {
      continue;
    }
    if (familyHidden) {
      families.set(lower(family), family);
      shadow.set(lower(family), family);
      local.add(lower(family));
    }
    if (fullName) {
      local.add(lower(fullName));
      const words = lower(fullName).split(" ");
      const plain = !words.some((word) => word === "italic" || word === "oblique") && !/ (bold|regular)$/.test(lower(fullName));
      const rest = familyHidden && lower(fullName).startsWith(lower(family) + " ") ? lower(fullName).slice(lower(family).length + 1).split(" ") : null;
      if (plain && (!rest || rest.every((word) => SUFFIXES.has(word)))) {
        shadow.set(lower(fullName), fullName);
      }
    }
    if (postscriptName) {
      local.add(lower(postscriptName));
    }
  }
  const sorted = (map) => [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((entry) => entry[1]);
  return { families: sorted(families), shadow: sorted(shadow), local: [...local].sort() };
};

/// What a page of the app's own asks the browser for this computer's
/// fonts with, once it is shown (the browser answers a visible page only).
const QUERY = `(async () => {
  if (document.visibilityState !== "visible") {
    await new Promise((resolve) => document.addEventListener("visibilitychange", resolve, { once: true }));
  }
  const fonts = await queryLocalFonts();
  return fonts.map((font) => [font.family, font.fullName, font.postscriptName, font.style]);
})()`;

/// This computer's fonts, as the browser lists them: kept in the app's
/// data (`file`) for the next run, asked again each run from one of the
/// app's own pages (see refresh). `faces` given (tests) stands for them.
class FontList {
  constructor(file, { faces = null } = {}) {
    this.file = file;
    this.faces = null;
    this.hiddenMemo = null;
    /// The asking under way, whether one has answered this run, and how
    /// many times it was tried (a window that didn't show in time).
    this.asking = null;
    this.answered = false;
    this.tries = 0;
    if (Array.isArray(faces)) {
      this.faces = faces;
      this.answered = true;
    } else {
      this.read();
    }
  }

  read() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (saved && Array.isArray(saved.faces)) {
        this.faces = saved.faces;
      }
    } catch (error) {
      // None kept yet.
    }
  }

  get known() {
    return Array.isArray(this.faces);
  }

  /// Asks the page of `webContents` (one of the app's own, which the
  /// browser lets list the fonts) for them, until one answers this run (a
  /// few tries at most: another window shown tries again); settles when
  /// they are known, or the asking failed, or after `waitMs`.
  refresh(webContents, waitMs = 3000) {
    if (this.answered || this.tries >= 3) {
      return Promise.resolve();
    }
    if (!this.asking) {
      this.tries++;
      const answer = Promise.resolve().then(() => webContents.executeJavaScript(QUERY)).then((faces) => {
        if (!Array.isArray(faces)) {
          return;
        }
        this.faces = faces.filter((face) => Array.isArray(face) && typeof face[0] === "string");
        this.hiddenMemo = null;
        this.answered = true;
        try {
          fs.writeFileSync(this.file, JSON.stringify({ at: new Date().toISOString(), faces: this.faces }));
        } catch (error) {
          // Asked again next run.
        }
      }, () => {});
      this.asking = Promise.race([answer, new Promise((resolve) => setTimeout(resolve, waitMs))]).then(() => {
        this.asking = null;
      });
    }
    return this.asking;
  }

  /// Settles once the fonts are known to pages: at once if a list was kept
  /// from an earlier run (a new one is asked for meanwhile), else when the
  /// asking settles.
  whenKnown(webContents) {
    const known = this.known;
    const asking = webContents ? this.refresh(webContents) : this.asking;
    return known ? Promise.resolve() : Promise.resolve(asking);
  }

  /// What pages are kept from finding (see hiddenFonts), or null while
  /// this computer's fonts aren't known.
  hidden() {
    if (!this.known) {
      return null;
    }
    if (!this.hiddenMemo) {
      this.hiddenMemo = hiddenFonts(this.faces);
    }
    return this.hiddenMemo;
  }
}

module.exports = { isWindowsFont, hiddenFonts, FontList, QUERY, SUFFIXES };
