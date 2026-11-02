"use strict";

/// The search engines, as in the iOS app.
const ENGINES = {
  google: { name: "Google", home: "https://www.google.com", search: "https://www.google.com/search?q=" },
  duckduckgo: { name: "DuckDuckGo", home: "https://duckduckgo.com", search: "https://duckduckgo.com/?q=" },
  bing: { name: "Bing", home: "https://www.bing.com", search: "https://www.bing.com/search?q=" },
};

/// The app's own pages, served from the renderer folder.
const APP_ORIGIN = "noor://app";
const START_URL = `${APP_ORIGIN}/start.html`;
const SETTINGS_URL = `${APP_ORIGIN}/settings.html`;
const LIBRARY_URL = `${APP_ORIGIN}/library.html`;
const COOKIES_URL = `${APP_ORIGIN}/cookies.html`;
const ERROR_URL = `${APP_ORIGIN}/error.html`;

const search = (query, engine = "google") => (ENGINES[engine] || ENGINES.google).search + encodeURIComponent(query);

/// The page to open for what was typed in the address bar: an address as
/// typed, a host with http:// (upgraded to https:// on the way), or a
/// search with the chosen engine.
const resolve = (text, engine = "google") => {
  const typed = String(text || "").trim();
  if (!typed) {
    return null;
  }
  if (/^(https?|noor):/i.test(typed)) {
    return typed;
  }
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]|$)/i.test(typed)) {
    return "http://" + typed;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(typed)) {
    // Another scheme (javascript:, data:, file:) is searched for, not run.
    return search(typed, engine);
  }
  if (/^[^\s/?#@]+\.[^\s]*$/.test(typed)) {
    return "http://" + typed;
  }
  return search(typed, engine);
};

const isStartPage = (url) => typeof url === "string" && url.startsWith(START_URL);
const isAppPage = (url) => typeof url === "string" && url.startsWith(APP_ORIGIN + "/");
const isErrorPage = (url) => typeof url === "string" && url.startsWith(ERROR_URL);
const isWebPage = (url) => /^https?:/i.test(url || "");

/// What the address bar shows: nothing for the start page, the page that
/// failed for the error page, otherwise the address itself.
const displayURL = (url) => {
  if (!url || isStartPage(url)) {
    return "";
  }
  if (isErrorPage(url)) {
    try {
      return new URL(url).searchParams.get("url") || "";
    } catch (error) {
      return "";
    }
  }
  return url;
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch (error) {
    return null;
  }
};

/// Whether `url` is of this computer or its own network: localhost, a
/// loopback, private or link-local address.
const isLocalAddress = (url) => {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (error) {
    return false;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") {
    return true;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
  }
  if (host.startsWith("[") && host.endsWith("]")) {
    const v6 = host.slice(1, -1);
    return v6 === "::1" || v6 === "::" || /^f[cd][0-9a-f]{0,2}:/.test(v6) || /^fe[89ab][0-9a-f]?:/.test(v6) || /^::ffff:(127|10|192\.168)\./.test(v6);
  }
  return false;
};

/// Whether `address` (an IP address, as a resolver gives it) is of this
/// computer or its own network: loopback, private, link-local, unspecified;
/// an IPv6 address standing for an IPv4 one (::ffff:…) as that one is.
const isLocalIP = (address) => {
  let text = String(address || "").toLowerCase().trim().replace(/^\[|\]$/g, "").split("%")[0];
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(text);
  if (hexMapped) {
    const high = parseInt(hexMapped[1], 16);
    const low = parseInt(hexMapped[2], 16);
    text = [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (mapped) {
    text = mapped[1];
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(text);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
  }
  return text === "::1" || text === "::" || /^f[cd][0-9a-f]{0,2}:/.test(text) || /^fe[89ab][0-9a-f]?:/.test(text);
};

/// Whether `url`'s host is a name (not an address written out), which only
/// resolving it tells the place of.
const hostIsName = (url) => {
  try {
    const host = new URL(url).hostname;
    return Boolean(host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.startsWith("[");
  } catch (error) {
    return false;
  }
};

module.exports = {
  ENGINES, APP_ORIGIN, START_URL, SETTINGS_URL, LIBRARY_URL, COOKIES_URL, ERROR_URL,
  search, resolve, isStartPage, isAppPage, isErrorPage, isWebPage, displayURL, hostOf,
  isLocalAddress, isLocalIP, hostIsName,
};
