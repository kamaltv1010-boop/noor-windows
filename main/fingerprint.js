"use strict";
const crypto = require("crypto");
const { IPHONES } = require("./iphone");

/// The protections, each with a seed per profile that decides the values
/// pages see. The noise ones give canvas, WebGL and audio values and
/// ClientRects that differ from this PC's but stay the same on a site;
/// "screen" and "hardware" show another common PC's screen size, core
/// count and memory.
const KINDS = ["canvas", "webGL", "audio", "clientRects", "screen", "hardware"];
const NOISE_KINDS = ["canvas", "webGL", "audio", "clientRects"];
/// Noor iPhone's: the noise ones, and "device", the iPhone a profile is
/// (its screen, Safari's user agent and the rest, see main/iphone.js),
/// always on.
const IPHONE_KINDS = ["canvas", "webGL", "audio", "clientRects", "device"];

/// Common PC screens, in CSS pixels, as on a screen shown at 100%.
const SCREENS = [
  [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1680, 1050], [1920, 1080],
  [1920, 1200], [2560, 1080], [2560, 1440], [2560, 1600], [3440, 1440], [3840, 2160],
].map(([width, height]) => ({ width, height }));

/// Common PC displays, in their own pixels, and the scales Windows shows
/// them at (100%, 125%…). A page sees a screen's size in CSS pixels, its
/// own divided by that scale (the devicePixelRatio, which stays this PC's):
/// 1920×1080 at 125% is 1536×864. A screen picked at a scale no one shows
/// it at would make a display no one has (3440×1440 at 225% is 7740×3240).
const PANELS = [
  [1366, 768, [1]], [1600, 900, [1, 1.25]], [1920, 1080, [1, 1.25, 1.5]], [1920, 1200, [1, 1.25, 1.5]],
  [2256, 1504, [1.25, 1.5, 1.75]], [2560, 1080, [1]], [2560, 1440, [1, 1.25, 1.5]], [2560, 1600, [1.25, 1.5, 1.75, 2]],
  [2736, 1824, [1.75, 2]], [2880, 1800, [1.75, 2]], [2880, 1920, [1.75, 2, 2.25]], [3000, 2000, [2, 2.25]],
  [3200, 2000, [2, 2.25]], [3440, 1440, [1, 1.25]], [3840, 2160, [1.5, 1.75, 2, 2.25, 2.5]], [3840, 2400, [2, 2.25, 2.5]],
].map(([width, height, scales]) => ({ width, height, scales }));

/// The screens of the displays shown at `scale`, in CSS pixels, as Chrome
/// rounds them (2560×1440 at 150% is 1707×960).
const screensAt = (scale) => {
  const s = Math.round((Number(scale) > 0 ? Number(scale) : 1) * 100) / 100;
  const list = [];
  for (const panel of PANELS) {
    if (!panel.scales.includes(s)) {
      continue;
    }
    const width = Math.round(panel.width / s);
    const height = Math.round(panel.height / s);
    if (!list.some((screen) => screen.width === width && screen.height === height)) {
      list.push({ width, height });
    }
  }
  return list;
};

/// Core counts common on PCs. Chrome reports memory as 8 GB at most, so
/// that is what every choice shows.
const HARDWARE = [4, 6, 8, 12, 16].map((cores) => ({ cores, memory: 8 }));

class Fingerprint {
  constructor(store, profiles, { iphone = false } = {}) {
    this.store = store;
    this.profiles = profiles;
    this.iphoneMode = Boolean(iphone);
    /// The kinds this build has (Noor iPhone's, or Noor's).
    this.kinds = this.iphoneMode ? IPHONE_KINDS : KINDS;
    /// This PC's screen in CSS pixels, and the scale Windows shows it at
    /// (devicePixelRatio), set at launch.
    this.realScreen = { width: 0, height: 0 };
    this.realScale = 1;
  }

  enabledKey(kind) {
    return `protection.${kind}`;
  }

  /// The key of a kind's seed, in the profile in use (or the one this is
  /// for, see forProfile).
  seedKey(kind) {
    return this.profiles.key(`seed.${kind}`, this.boundProfile || undefined);
  }

  /// The same fingerprints, for `profile` whichever profile is in use: its
  /// seeds, with the switches and this PC's values everyone shares (a tab
  /// that collects a profile's cookies in the background, see
  /// main/warmup.js, shows that profile's).
  forProfile(profile) {
    const bound = Object.create(this);
    bound.boundProfile = profile;
    return bound;
  }

  /// Every protection is on at first but audio and ClientRects: on a PC
  /// the audio fingerprint is nearly the same for everyone with the same
  /// Chrome, and the measured sizes of elements the same for everyone with
  /// the same Windows and fonts, so noise there would single this browser
  /// out rather than hide it.
  ///
  /// In Noor iPhone every one is on at first, as in the iPhone app: what this
  /// PC renders is no iPhone's anyway, so the noise keeps a site from
  /// following a profile to another; and the iPhone itself can't be off.
  isEnabled(kind) {
    if (kind === "device") {
      return true;
    }
    const value = this.store.get(this.enabledKey(kind));
    if (typeof value === "boolean") {
      return value;
    }
    return this.iphoneMode || (kind !== "audio" && kind !== "clientRects");
  }

  setEnabled(kind, isOn) {
    this.store.set(this.enabledKey(kind), Boolean(isOn));
  }

  seed(kind) {
    const saved = this.store.get(this.seedKey(kind));
    return Number.isInteger(saved) ? saved >>> 0 : this.newSeed(kind);
  }

  /// A new seed for a kind. A new screen size or hardware must actually
  /// differ, when there is another one to pick.
  newSeed(kind) {
    const old = this.store.get(this.seedKey(kind));
    const canChange = this.choices(kind) > 1;
    let seed;
    do {
      seed = crypto.randomInt(0, 2 ** 32);
    } while (canChange && Number.isInteger(old) && this.visibleValue(old >>> 0, kind) === this.visibleValue(seed, kind));
    this.store.set(this.seedKey(kind), seed);
    return seed;
  }

  newSeeds(kinds) {
    for (const kind of kinds) {
      if (this.kinds.includes(kind)) {
        this.newSeed(kind);
      }
    }
  }

  /// The iPhone the profile in use is, in Noor iPhone.
  iphone() {
    return this.pick(this.seed("device"), IPHONES);
  }

  /// The screens pages may see: displays shown at this PC's scale (see
  /// PANELS), at least as big as this PC's screen, since a window bigger
  /// than the screen happens on no real PC; this PC's own if none is.
  screens() {
    const real = { width: this.realScreen.width, height: this.realScreen.height };
    const fitting = screensAt(this.realScale).filter((s) => s.width >= real.width && s.height >= real.height);
    if (fitting.length) {
      return fitting;
    }
    return real.width > 0 && real.height > 0 ? [real] : [SCREENS[SCREENS.length - 1]];
  }

  pick(seed, list) {
    return list[seed % list.length];
  }

  /// The screen size pages see.
  screen() {
    return this.pick(this.seed("screen"), this.screens());
  }

  /// The core count and memory pages see.
  hardware() {
    return this.pick(this.seed("hardware"), HARDWARE);
  }

  /// What a seed shows for a kind; a new seed must change it.
  visibleValue(seed, kind) {
    if (kind === "device") {
      return this.pick(seed, IPHONES).name;
    }
    if (kind === "screen") {
      const s = this.pick(seed, this.screens());
      return `${s.width}x${s.height}`;
    }
    if (kind === "hardware") {
      return String(this.pick(seed, HARDWARE).cores);
    }
    return String(seed);
  }

  /// How many different values a new seed can pick from.
  choices(kind) {
    if (kind === "device") {
      return new Set(IPHONES.map((iphone) => iphone.name)).size;
    }
    if (kind === "screen") {
      return new Set(this.screens().map((s) => `${s.width}x${s.height}`)).size;
    }
    if (kind === "hardware") {
      return HARDWARE.length;
    }
    return Infinity;
  }

  /// What a page's script gets: the seeds of the protections that are on
  /// (none without `protections`, shields down for the site), and the
  /// screen and hardware unless `realDevice` (a sign-in site, which checks
  /// them against the device).
  ///
  /// In Noor iPhone the iPhone stays one everywhere, sign-in sites and sites
  /// with their shields down too (a site that saw another device there would
  /// see two): its screen and the rest come with it (see main.js), not here.
  config({ protections = true, realDevice = false } = {}) {
    const seeds = {};
    for (const kind of NOISE_KINDS) {
      seeds[kind] = protections && this.isEnabled(kind) ? this.seed(kind) : null;
    }
    if (this.iphoneMode) {
      return { seeds, screen: null, hardware: null };
    }
    return {
      seeds,
      screen: protections && !realDevice && this.isEnabled("screen") ? this.screen() : null,
      hardware: protections && !realDevice && this.isEnabled("hardware") ? this.hardware() : null,
    };
  }

  /// Changes whenever a switch or a seed changes.
  signature() {
    return this.kinds.map((kind) => `${this.isEnabled(kind)}:${this.seed(kind)}`).join(",");
  }
}

module.exports = { Fingerprint, KINDS, IPHONE_KINDS, NOISE_KINDS, SCREENS, PANELS, screensAt, HARDWARE };
