"use strict";
const crypto = require("crypto");

/// The protections, each with a seed per profile that decides the values
/// pages see. The noise ones give canvas, WebGL and audio values and
/// ClientRects that differ from this PC's but stay the same on a site;
/// "screen" and "hardware" show another common PC's screen size, core
/// count and memory.
const KINDS = ["canvas", "webGL", "audio", "clientRects", "screen", "hardware"];
const NOISE_KINDS = ["canvas", "webGL", "audio", "clientRects"];

/// Common PC screens, in CSS pixels.
const SCREENS = [
  [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1680, 1050], [1920, 1080],
  [1920, 1200], [2560, 1080], [2560, 1440], [2560, 1600], [3440, 1440], [3840, 2160],
].map(([width, height]) => ({ width, height }));

/// Core counts common on PCs. Chrome reports memory as 8 GB at most, so
/// that is what every choice shows.
const HARDWARE = [4, 6, 8, 12, 16].map((cores) => ({ cores, memory: 8 }));

class Fingerprint {
  constructor(store, profiles) {
    this.store = store;
    this.profiles = profiles;
    /// This PC's screen in CSS pixels, set at launch.
    this.realScreen = { width: 0, height: 0 };
  }

  enabledKey(kind) {
    return `protection.${kind}`;
  }

  /// The key of a kind's seed, in the profile in use.
  seedKey(kind) {
    return this.profiles.key(`seed.${kind}`);
  }

  /// Every protection is on at first but audio and ClientRects: on a PC
  /// the audio fingerprint is nearly the same for everyone with the same
  /// Chrome, and the measured sizes of elements the same for everyone with
  /// the same Windows and fonts, so noise there would single this browser
  /// out rather than hide it.
  isEnabled(kind) {
    const value = this.store.get(this.enabledKey(kind));
    return typeof value === "boolean" ? value : kind !== "audio" && kind !== "clientRects";
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
      this.newSeed(kind);
    }
  }

  /// The screens pages may see: those at least as big as this PC's, since
  /// a window bigger than the screen happens on no real PC.
  screens() {
    const fitting = SCREENS.filter((s) => s.width >= this.realScreen.width && s.height >= this.realScreen.height);
    return fitting.length ? fitting : [SCREENS[SCREENS.length - 1]];
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
  config({ protections = true, realDevice = false } = {}) {
    const seeds = {};
    for (const kind of NOISE_KINDS) {
      seeds[kind] = protections && this.isEnabled(kind) ? this.seed(kind) : null;
    }
    return {
      seeds,
      screen: protections && !realDevice && this.isEnabled("screen") ? this.screen() : null,
      hardware: protections && !realDevice && this.isEnabled("hardware") ? this.hardware() : null,
    };
  }

  /// Changes whenever a switch or a seed changes.
  signature() {
    return KINDS.map((kind) => `${this.isEnabled(kind)}:${this.seed(kind)}`).join(",");
  }
}

module.exports = { Fingerprint, KINDS, NOISE_KINDS, SCREENS, HARDWARE };
