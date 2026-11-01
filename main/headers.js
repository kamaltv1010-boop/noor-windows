"use strict";

/// The order Chrome sends a request's headers in. Electron's network layer
/// keeps another: it adds Accept-Language last, and puts the user agent
/// right after the platform hint, where Chrome has both elsewhere, so a
/// site that reads the order (as the JA4H fingerprint and bot filters do)
/// would tell the two apart. What Chrome does, read from its requests:
///
/// - a page, or a frame's page: the hints (sec-ch-ua, sec-ch-ua-mobile,
///   sec-ch-ua-platform…), then Accept-Language, then
///   Upgrade-Insecure-Requests and the rest; with no hints (an http://
///   site), Accept-Language just before Upgrade-Insecure-Requests;
/// - what a page asks for (a script, a style sheet, an image, fetch,
///   XMLHttpRequest, a beacon): sec-ch-ua-platform, Accept-Language,
///   sec-ch-ua, User-Agent, sec-ch-ua-mobile, Accept…, and with a body
///   (Content-Type) sec-ch-ua, Content-Type, sec-ch-ua-mobile, User-Agent;
///   with no hints, Accept-Language just before User-Agent;
/// - a video's or a sound's part (Range): sec-ch-ua-platform,
///   Accept-Encoding ("identity;q=1, *;q=0"), Accept-Language, sec-ch-ua,
///   User-Agent, sec-ch-ua-mobile…;
/// - a worker's script: Accept, the Sec-Fetch ones, Referer, User-Agent,
///   Accept-Encoding, Accept-Language.
///
/// Host, Connection, Content-Length and Cookie the network layer adds after
/// this, in the same places as Chrome's.
const MEDIA_ACCEPT_ENCODING = "identity;q=1, *;q=0";

const chromeOrder = (headers, resourceType) => {
  if (!headers || typeof headers !== "object") {
    return headers;
  }
  const entries = Object.entries(headers);
  const find = (name) => entries.findIndex(([key]) => key.toLowerCase() === name);
  const has = (name) => find(name) >= 0;
  const value = (name) => (has(name) ? String(entries[find(name)][1]) : "");
  const take = (name) => {
    const index = find(name);
    return index < 0 ? null : entries.splice(index, 1)[0];
  };
  const after = (anchor, entry) => {
    const index = find(anchor);
    if (!entry || index < 0) {
      return false;
    }
    entries.splice(index + 1, 0, entry);
    return true;
  };
  const before = (anchor, entry) => {
    const index = find(anchor);
    if (!entry || index < 0) {
      return false;
    }
    entries.splice(index, 0, entry);
    return true;
  };
  // An entry with no place found goes back where it was.
  const putBack = (entry, index) => {
    if (entry) {
      entries.splice(Math.min(index, entries.length), 0, entry);
    }
  };

  const destination = value("sec-fetch-dest").toLowerCase();
  const isNavigation = resourceType === "mainFrame" || resourceType === "subFrame";
  const hasHints = has("sec-ch-ua-platform");
  // A worker's script, which the browser asks for itself: its
  // destination says so, and on an http:// site (no Sec-Fetch headers) its
  // user agent after Accept, where a page's requests have it before.
  const isWorker = destination === "worker" || destination === "sharedworker" || destination === "serviceworker" ||
    (!destination && !hasHints && !isNavigation && has("accept") && find("user-agent") > find("accept"));

  if (isWorker) {
    const agentIndex = find("user-agent");
    const agent = take("user-agent");
    if (!before("accept-encoding", agent) && !before("accept-language", agent)) {
      putBack(agent, agentIndex);
    }
  } else if (isNavigation) {
    const languageIndex = find("accept-language");
    const language = take("accept-language");
    if (language) {
      // After the last of the hints that lead the request, else before
      // Upgrade-Insecure-Requests or the user agent.
      let lastHint = -1;
      entries.forEach(([key], index) => {
        if (key.toLowerCase().startsWith("sec-ch-")) {
          lastHint = index;
        }
      });
      if (lastHint >= 0) {
        entries.splice(lastHint + 1, 0, language);
      } else if (!before("upgrade-insecure-requests", language) && !before("user-agent", language)) {
        putBack(language, languageIndex);
      }
    }
  } else if (hasHints) {
    const languageIndex = find("accept-language");
    const language = take("accept-language");
    const agentIndex = find("user-agent");
    const agent = take("user-agent");
    const isMedia = has("range") && (destination === "video" || destination === "audio" || resourceType === "media");
    let anchor = "sec-ch-ua-platform";
    if (isMedia) {
      const encoding = take("accept-encoding");
      if (encoding) {
        encoding[1] = MEDIA_ACCEPT_ENCODING;
        after(anchor, encoding);
        anchor = encoding[0].toLowerCase();
      }
    }
    if (!after(anchor, language)) {
      putBack(language, languageIndex);
    }
    const agentAnchor = has("content-type") ? "sec-ch-ua-mobile" : "sec-ch-ua";
    if (!after(agentAnchor, agent)) {
      putBack(agent, agentIndex);
    }
  } else {
    const languageIndex = find("accept-language");
    const language = take("accept-language");
    if (!before("user-agent", language)) {
      putBack(language, languageIndex);
    }
  }
  return Object.fromEntries(entries);
};

module.exports = { chromeOrder, MEDIA_ACCEPT_ENCODING };
