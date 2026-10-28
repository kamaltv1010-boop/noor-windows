"use strict";

/// Brave-style shields: tracker blocking, HTTPS upgrades and the
/// fingerprint protections are on everywhere, and can be turned off for a
/// single site that doesn't work with them.
class Shields {
  constructor(store, trackerRules = []) {
    this.store = store;
    this.rules = trackerRules;
    /// Sites that don't support https://, so they aren't upgraded again.
    this.httpOnlyHosts = new Set();
  }

  /// What shields are set for: the host without "www.", or null.
  static site(url) {
    const host = hostOf(url);
    if (!host) {
      return null;
    }
    return host.startsWith("www.") ? host.slice(4) : host;
  }

  /// The sites shields are down for, sorted.
  downSites() {
    const sites = this.store.get("shieldsDownSites", []);
    return Array.isArray(sites) ? sites.filter((s) => typeof s === "string").sort() : [];
  }

  areUp(url) {
    const site = Shields.site(url);
    return site ? !this.downSites().includes(site) : true;
  }

  setUp(isUp, site) {
    const sites = this.downSites().filter((s) => s !== site);
    if (!isUp) {
      sites.push(site);
    }
    this.store.set("shieldsDownSites", sites.sort());
  }

  /// Sites that check the browser closely when you sign in or create an
  /// account: Meta's, and Google, Apple and Microsoft accounts. They see
  /// this PC's real screen and hardware, but still get the canvas, WebGL,
  /// audio and ClientRects noise.
  static isSignInSite(url) {
    const host = hostOf(url);
    return Boolean(host) && SIGN_IN_SITES.some((site) => host === site || host.endsWith("." + site));
  }

  trackersEnabled() {
    return this.flag("blockTrackers");
  }

  httpsEnabled() {
    return this.flag("httpsUpgrade");
  }

  cleanLinksEnabled() {
    return this.flag("cleanLinks");
  }

  flag(key) {
    const value = this.store.get(key);
    return typeof value === "boolean" ? value : true;
  }

  /// Whether a request is for a tracker: a third party's file from one of
  /// the tracker domains, unless the page is a site the rule allows.
  isTracker(requestURL, pageURL) {
    const host = hostOf(requestURL);
    if (!host) {
      return false;
    }
    const page = hostOf(pageURL) || "";
    return this.rules.some((rule) =>
      within(host, rule.domain) && !within(page, rule.domain) && !rule.allowedOn.some((site) => within(page, site)));
  }

  /// The https:// version of `url`, or null if it should be left alone:
  /// it isn't http://, names a port, is a local address, or the site has
  /// already shown it doesn't support https://.
  upgraded(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "http:" || parsed.port || !host.includes(".") || host.endsWith(".local")
        || host.includes(":") || /^[\d.]+$/.test(host) || this.httpOnlyHosts.has(host)) {
      return null;
    }
    parsed.protocol = "https:";
    return parsed.toString();
  }

  /// `url` without its tracking parameters (fbclid, gclid, utm_*…), or null
  /// if it has none.
  clean(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return null;
    }
    if (!parsed.search) {
      return null;
    }
    const kept = [];
    let removed = 0;
    for (const pair of parsed.search.slice(1).split("&")) {
      const name = decodeURIComponent(pair.split("=")[0]).toLowerCase();
      if (name.startsWith("utm_") || TRACKING_PARAMETERS.has(name)) {
        removed += 1;
      } else {
        kept.push(pair);
      }
    }
    if (!removed) {
      return null;
    }
    parsed.search = kept.length ? "?" + kept.join("&") : "";
    return parsed.toString();
  }
}

const SIGN_IN_SITES = [
  "instagram.com", "facebook.com", "messenger.com", "threads.net", "threads.com", "whatsapp.com",
  "meta.com", "fb.com", "accounts.google.com", "appleid.apple.com", "idmsa.apple.com",
  "login.live.com", "login.microsoftonline.com",
];

const TRACKING_PARAMETERS = new Set([
  "fbclid", "igshid", "igsh", "gclid", "dclid", "gbraid", "wbraid", "msclkid",
  "ttclid", "twclid", "li_fat_id", "yclid", "srsltid", "mc_cid", "mc_eid",
  "_hsenc", "_hsmi", "mkt_tok", "oly_anon_id", "oly_enc_id", "vero_id",
]);

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch (error) {
    return null;
  }
};

const within = (host, domain) => host === domain || host.endsWith("." + domain);

/// Totals for the start page, like Brave's.
class Stats {
  constructor(store) {
    this.store = store;
  }

  get trackersBlocked() {
    return this.store.get("stats.trackersBlocked", 0) || 0;
  }

  get httpsUpgrades() {
    return this.store.get("stats.httpsUpgrades", 0) || 0;
  }

  /// A rough guess, in milliseconds: 50 ms per tracker not loaded.
  get timeSaved() {
    return this.trackersBlocked * 50;
  }

  trackerBlocked() {
    this.store.set("stats.trackersBlocked", this.trackersBlocked + 1);
  }

  connectionUpgraded() {
    this.store.set("stats.httpsUpgrades", this.httpsUpgrades + 1);
  }

  reset() {
    this.store.set("stats.trackersBlocked", 0);
    this.store.set("stats.httpsUpgrades", 0);
  }

  toJSON() {
    return { trackersBlocked: this.trackersBlocked, httpsUpgrades: this.httpsUpgrades, timeSaved: this.timeSaved };
  }
}

module.exports = { Shields, Stats, SIGN_IN_SITES };
