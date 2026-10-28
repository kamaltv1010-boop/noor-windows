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

module.exports = {
  ENGINES, APP_ORIGIN, START_URL, SETTINGS_URL, LIBRARY_URL, ERROR_URL,
  search, resolve, isStartPage, isAppPage, isErrorPage, isWebPage, displayURL, hostOf,
};
