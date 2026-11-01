"use strict";

/// The storage quota a window of Chrome's shows a site, as Chromium reckons
/// it for a profile kept on disk: the browser may use 80% of the disk, and a
/// site three quarters of that (60% of the disk), but no more than is free
/// beside what the site already keeps. `disk`: what fs.statfs says of the
/// disk the profile is on. { max, free } in bytes, or null if it says
/// nothing usable. (A profile kept in memory gets an incognito window's
/// quota instead, a part of the computer's memory: see main.js.)
const diskQuota = (disk) => {
  if (!disk) {
    return null;
  }
  const total = Number(disk.blocks) * Number(disk.bsize);
  const free = Number(disk.bavail) * Number(disk.bsize);
  if (!(total > 0) || !(free >= 0)) {
    return null;
  }
  return { max: Math.floor(Math.floor(total * 0.8) * 0.75), free };
};

/// The quota a site that keeps `usage` bytes reads, from `quota` (see
/// diskQuota). scripts/parts/chrome.js reckons it the same way in a page.
const quotaFor = (quota, usage) => Math.min(quota.max, (Number(usage) || 0) + quota.free);

/// Below this much free disk, the quota reads as an incognito window's to
/// a site that compares it with the memory (the detectIncognito library
/// calls a quota under twice the JS heap limit, 4 GiB, incognito), as
/// Chrome's own does on a nearly full disk. A site can't tell how full the
/// disk is, so it is shown 60% of the disk then, as on one with room.
const LOW_DISK = 16 * 1024 * 1024 * 1024;

/// The quota a profile's pages read in place of Chromium's, or null to
/// leave Chromium's own: `disk` from diskQuota; `inMemory` for a profile
/// kept in memory only (Clear Everything on Quit), whose pages Chromium
/// gives an incognito window's quota, a part of the memory.
const shownQuota = (disk, inMemory) => {
  if (!disk) {
    return null;
  }
  if (disk.free < LOW_DISK) {
    return { max: disk.max, free: disk.max };
  }
  return inMemory ? disk : null;
};

module.exports = { diskQuota, quotaFor, shownQuota, LOW_DISK };
