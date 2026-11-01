"use strict";
const { net } = require("electron");

/// The time zone pages see: the one of the connection's public address (a
/// VPN's, when one is on), as a visitor from there has, so a site that
/// compares the two finds them agreeing. The address is watched (every 30
/// seconds, a few bytes from Cloudflare's trace page), and when it changes
/// (a VPN goes on, off, or to another country) its zone is asked of
/// services that answer without a key, tried in turn, and pages see it
/// within the minute. When none answers, pages see the system's. The last
/// zone found is kept, to show from the next launch on while it is asked
/// again.
const SERVICES = [
  { url: "https://ipwho.is/", zone: (data) => data && data.timezone && data.timezone.id, ip: (data) => data && data.ip, country: (data) => data && data.country_code },
  { url: "https://ipapi.co/json/", zone: (data) => data && data.timezone, ip: (data) => data && data.ip, country: (data) => data && data.country_code },
  { url: "https://ipinfo.io/json", zone: (data) => data && data.timezone, ip: (data) => data && data.ip, country: (data) => data && data.country },
  { url: "https://freeipapi.com/api/json", zone: (data) => data && Array.isArray(data.timeZones) ? data.timeZones[0] : null, ip: (data) => data && data.ipAddress, country: (data) => data && data.countryCode },
];
/// The address and its country, in a few bytes.
const TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";
const WATCH_MS = 30 * 1000;
/// When the trace page can't be read, the services are asked this often.
const REFRESH_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 6000;

/// Whether `id` names a time zone the browser knows ("Europe/Paris").
const isZone = (id) => {
  if (typeof id !== "string" || !/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(id)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: id });
    return true;
  } catch (error) {
    return false;
  }
};

class Timezone {
  /// `fetch` stands in for the network in tests; `forced` is a zone to
  /// show without asking (tests).
  constructor(store, { fetch = (url, options) => net.fetch(url, options), forced = null } = {}) {
    this.store = store;
    this.fetch = fetch;
    this.forced = isZone(forced) ? forced : null;
    const last = store.get("timezone.last", null);
    this.zone = isZone(last) ? last : null;
    /// The public address the zone is of, its country (a code, "MA"), and
    /// when the address was last read.
    this.ip = store.get("timezone.ip", null);
    this.country = store.get("timezone.country", null);
    this.checkedAt = null;
    this.askedAt = 0;
    this.listeners = [];
    this.timer = null;
    this.first = null;
    this.checking = null;
  }

  /// What the settings show: the zone, the address and its country.
  get info() {
    return { zone: this.current, found: this.zone, ip: this.ip, country: this.country, checkedAt: this.checkedAt, forced: Boolean(this.forced) };
  }

  enabled() {
    return Boolean(this.store.get("timezoneFromIP", true));
  }

  setEnabled(isOn) {
    this.store.set("timezoneFromIP", Boolean(isOn));
    this.notify();
  }

  /// The zone pages see, or null for the system's.
  get current() {
    return this.enabled() ? this.forced || this.zone : null;
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.current);
      } catch (error) {
        // A listener's failure is its own.
      }
    }
  }

  /// The address's zone from the first service that answers (with the
  /// address and country it tells), or null.
  async lookup() {
    for (const service of SERVICES) {
      try {
        const response = await this.fetch(service.url, {
          cache: "no-store",
          credentials: "omit",
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
          continue;
        }
        const data = await response.json();
        const zone = service.zone(data);
        if (isZone(zone)) {
          const ip = service.ip(data);
          const country = service.country(data);
          return { zone, ip: typeof ip === "string" ? ip : null, country: /^[A-Za-z]{2}$/.test(country || "") ? country.toUpperCase() : null };
        }
      } catch (error) {
        // The next service may answer.
      }
    }
    return null;
  }

  /// The public address and its country from the trace page, or null.
  async address() {
    try {
      const response = await this.fetch(TRACE_URL, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok || typeof response.text !== "function") {
        return null;
      }
      const fields = {};
      for (const line of String(await response.text()).split("\n")) {
        const at = line.indexOf("=");
        if (at > 0) {
          fields[line.slice(0, at)] = line.slice(at + 1).trim();
        }
      }
      if (!fields.ip) {
        return null;
      }
      const country = /^[A-Z]{2}$/.test(fields.loc || "") && fields.loc !== "XX" && fields.loc !== "T1" ? fields.loc : null;
      return { ip: fields.ip, country };
    } catch (error) {
      return null;
    }
  }

  /// Looks again: the address first, and the zone when the address changed
  /// (a VPN went on or off), when none is known yet, when the address can't
  /// be read and the zone wasn't asked for a while, or with `force`.
  async check(force = false) {
    if (this.forced) {
      return;
    }
    if (this.checking) {
      return this.checking;
    }
    this.checking = (async () => {
      const seen = await this.address();
      this.checkedAt = Date.now();
      const moved = seen && seen.ip !== this.ip;
      const due = !seen && Date.now() - this.askedAt > REFRESH_MS;
      if (seen) {
        this.remember(seen.ip, seen.country || this.country);
      }
      if (!force && !moved && !due && this.zone) {
        return;
      }
      this.askedAt = Date.now();
      const found = await this.lookup();
      if (!found) {
        return;
      }
      if (!seen) {
        this.remember(found.ip || this.ip, found.country || this.country);
      } else if (!seen.country && found.country) {
        this.remember(this.ip, found.country);
      }
      if (found.zone !== this.zone) {
        this.zone = found.zone;
        this.store.set("timezone.last", found.zone);
        this.notify();
      }
    })();
    try {
      await this.checking;
    } finally {
      this.checking = null;
    }
  }

  remember(ip, country) {
    if (ip !== this.ip) {
      this.ip = ip || null;
      this.store.set("timezone.ip", this.ip);
    }
    if (country !== this.country) {
      this.country = country || null;
      this.store.set("timezone.country", this.country);
    }
  }

  /// Asks for the zone now, whatever the address.
  refresh() {
    return this.check(true);
  }

  /// Asks now, and watches the address from then on (it changes when a
  /// VPN goes on or off).
  start() {
    if (this.timer) {
      return;
    }
    this.first = this.check(true);
    this.timer = setInterval(() => {
      if (this.enabled()) {
        this.check();
      }
    }, WATCH_MS);
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  /// Resolves once the first lookup is done, or after `ms` at most.
  ready(ms = 2500) {
    return Promise.race([this.first || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, ms))]);
  }
}

module.exports = { Timezone, isZone, SERVICES, TRACE_URL };
