"use strict";

/// A profile's own icon, for its window's button in the taskbar (see
/// Windows.dress): its name in white on a color of its own, as Octo Browser
/// shows its profiles, so each profile's window is told apart at a glance.
/// The same name gets the same icon.

/// The colors an icon is painted in, top left to bottom right.
const PALETTE = [
  ["#5b3df5", "#2a1aa8"], ["#1e88e5", "#0d47a1"], ["#00a884", "#00695c"], ["#f4511e", "#b33010"],
  ["#e53935", "#8e1b1b"], ["#8e24aa", "#4a148c"], ["#00acc1", "#006064"], ["#7cb342", "#33691e"],
  ["#6d4c41", "#3e2723"], ["#d81b60", "#880e4f"], ["#3949ab", "#1a237e"], ["#fb8c00", "#a85400"],
];

/// The sizes drawn: the taskbar's and the window's at each scale, and the
/// big one Windows shrinks for the rest.
const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 256];

/// FNV-1a: the same number for the same text.
const hash = (text) => {
  let h = 0x811c9dc5;
  for (const char of String(text)) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

/// What a profile's icon shows: its name on two lines (a numbered name's
/// number below, big: "Profile" and "6"), a short form for the smallest
/// sizes (the number, or the initials), and its colors.
const iconLook = (name) => {
  const clean = String(name == null ? "" : name).trim().replace(/\s+/g, " ") || "Profile";
  const numbered = /^(.*?)[\s#_-]*(\d{1,6})$/u.exec(clean);
  let lines;
  let short;
  if (numbered && numbered[1]) {
    lines = [[...numbered[1]].slice(0, 8).join(""), numbered[2]];
    short = numbered[2];
  } else if (numbered) {
    lines = [numbered[2]];
    short = numbered[2];
  } else {
    const words = clean.split(" ");
    const letters = [...clean];
    lines = words.length > 1
      ? [[...words[0]].slice(0, 7).join(""), [...words.slice(1).join(" ")].slice(0, 7).join("")]
      : letters.length > 7 ? [letters.slice(0, 6).join(""), letters.slice(6, 12).join("")] : [clean];
    short = (words.length > 1 ? [...words[0]][0] + [...words[1]][0] : letters.slice(0, 2).join("")).toUpperCase();
  }
  return { lines, short, colors: PALETTE[hash(clean.toLowerCase()) % PALETTE.length] };
};

/// An .ico file holding `images` ({ size, png }), each as a PNG, which
/// Windows reads since Vista: the window's and the taskbar's icon.
const icoFile = (images) => {
  const sorted = images.slice().sort((a, b) => a.size - b.size);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sorted.length, 4);
  let offset = 6 + 16 * sorted.length;
  const entries = sorted.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...sorted.map((image) => image.png)]);
};

/// Draws `look` at each of `sizes`, in a page (the toolbar's, which has a
/// canvas): PNG data: addresses, by size. Sent to the page as its source.
/* istanbul ignore next: runs in the page */
function drawProfileIcons(look, sizes) {
  const font = (px) => `700 ${px}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  const drawn = {};
  for (const size of sizes) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext("2d");
    const radius = size * 0.22;
    const gradient = c.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, look.colors[0]);
    gradient.addColorStop(1, look.colors[1]);
    c.fillStyle = gradient;
    c.beginPath();
    c.moveTo(radius, 0);
    c.arcTo(size, 0, size, size, radius);
    c.arcTo(size, size, 0, size, radius);
    c.arcTo(0, size, 0, 0, radius);
    c.arcTo(0, 0, size, 0, radius);
    c.closePath();
    c.fill();
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    // As big as fits, `most` at most.
    const fit = (text, most) => {
      let px = Math.max(4, Math.floor(most));
      c.font = font(px);
      while (px > 4 && c.measureText(text).width > size * 0.86) {
        px -= 1;
        c.font = font(px);
      }
      return px;
    };
    const lines = size < 32 ? [look.short] : look.lines;
    if (lines.length === 1) {
      fit(lines[0], size * (size < 32 ? 0.62 : 0.5));
      c.fillText(lines[0], size / 2, size * 0.53);
    } else {
      const top = fit(lines[0], size * 0.27);
      c.fillText(lines[0], size / 2, size * 0.34);
      fit(lines[1], Math.max(top, size * (/^\d+$/.test(lines[1]) ? 0.42 : 0.27)));
      c.fillText(lines[1], size / 2, size * 0.7);
    }
    drawn[size] = canvas.toDataURL("image/png");
  }
  return drawn;
}

/// The App User Model ID of a profile's windows: their own taskbar button,
/// apart from Noor's and from the other profiles', the same for a profile
/// made new in its place (its slot, see Profiles.replace).
const profileAppId = (appId, profile) => `${appId}.profile.${String(profile.slot || profile.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;

module.exports = { PALETTE, ICON_SIZES, iconLook, icoFile, drawProfileIcons, profileAppId, hash };
