"use strict";

const fs = require("fs");

/// Windows marks a file that came from the internet with a Zone.Identifier
/// stream beside it (the "Mark of the Web"): SmartScreen then checks a
/// program before it runs, and Office opens a document in Protected View,
/// its macros off. Chrome writes it on every download; Chromium in
/// Electron writes none, so a file a site had downloaded opened as one of
/// this computer's own. Noor writes it as Chrome does once a download is
/// done: the internet's zone (3), the page the download came from and its
/// own address (from a private tab, neither: "about:internet", as Chrome's
/// incognito windows write). A mark already there is left as it is.

/// What the stream holds for a file from `url`, downloaded on `referrer`.
const zoneIdentifier = (url, referrer, isPrivate) => {
  const web = (address) => /^https?:\/\//i.test(String(address || ""));
  const lines = ["[ZoneTransfer]", "ZoneId=3"];
  if (!isPrivate && web(referrer)) {
    lines.push(`ReferrerUrl=${referrer}`);
  }
  lines.push(`HostUrl=${!isPrivate && web(url) ? url : "about:internet"}`);
  return lines.join("\r\n") + "\r\n";
};

/// Whether `file` has a mark already.
const marked = (file) => {
  try {
    fs.accessSync(`${file}:Zone.Identifier`);
    return true;
  } catch (error) {
    return false;
  }
};

/// Marks what `ses` downloads, once each download is done (Windows only:
/// the stream is NTFS's). `isPrivate(ses)` tells a private tab's session.
/// NOOR_TEST_NO_MOTW (tests) leaves it to Chromium, to see what it does.
const markDownloads = (ses, isPrivate = () => false) => {
  if (process.platform !== "win32" || (process.env.NOOR_TEST && process.env.NOOR_TEST_NO_MOTW)) {
    return;
  }
  ses.on("will-download", (event, item, webContents) => {
    let referrer = "";
    try {
      referrer = webContents && !webContents.isDestroyed() ? webContents.getURL() : "";
    } catch (error) {
      referrer = "";
    }
    item.once("done", (doneEvent, state) => {
      if (state !== "completed") {
        return;
      }
      try {
        const file = item.getSavePath();
        if (!file || !fs.existsSync(file) || marked(file)) {
          return;
        }
        fs.writeFileSync(`${file}:Zone.Identifier`, zoneIdentifier(item.getURL(), referrer, isPrivate(ses)));
      } catch (error) {
        // A disk without streams (FAT32, a network share): nothing to mark.
      }
    });
  });
};

module.exports = { markDownloads, zoneIdentifier };
