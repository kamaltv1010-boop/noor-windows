"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { diskQuota, quotaFor, shownQuota, LOW_DISK } = require("../main/quota");

// A disk Chromium was asked about: 252 GiB, 24.4 GiB of it free. A page of a
// profile on that disk read 26245251072 as its quota (Electron 45), what
// is free, which is less than 60% of the disk.
const DISK = { bsize: 4096, blocks: 66053021, bavail: 6407532 };

test("a profile on disk: what is free, up to 60% of the disk", () => {
  const quota = diskQuota(DISK);
  assert.deepStrictEqual(quota, { max: 162331904409, free: 26245251072 });
  assert.strictEqual(quotaFor(quota, 0), 26245251072);
  // What the site keeps already counts beside what is free.
  assert.strictEqual(quotaFor(quota, 121), 26245251193);
});

test("a disk with more free than 60% of it: 60% of it", () => {
  const quota = diskQuota({ bsize: 4096, blocks: 1000000, bavail: 900000 });
  assert.strictEqual(quotaFor(quota, 0), Math.floor(Math.floor(4096000000 * 0.8) * 0.75));
});

test("what a profile's pages are shown: Chromium's own on disk, the disk's in memory", () => {
  const quota = diskQuota(DISK);
  // On disk with room: Chromium's own, which is the same.
  assert.strictEqual(shownQuota(quota, false), null);
  // Kept in memory: the disk's (Chromium's would be the memory's).
  assert.deepStrictEqual(shownQuota(quota, true), quota);
  assert.strictEqual(shownQuota(null, true), null);
});

test("a nearly full disk: 60% of it, so the quota doesn't read as incognito", () => {
  const nearlyFull = diskQuota({ bsize: 4096, blocks: 62500000, bavail: 1000000 });
  assert.ok(nearlyFull.free < LOW_DISK);
  for (const inMemory of [false, true]) {
    const shown = shownQuota(nearlyFull, inMemory);
    assert.strictEqual(quotaFor(shown, 0), nearlyFull.max);
    assert.strictEqual(quotaFor(shown, 5000), nearlyFull.max);
  }
  // Under twice a 4 GiB heap limit is what detectIncognito calls incognito.
  assert.ok(quotaFor(shownQuota(nearlyFull, false), 0) > 2 * 4 * 1024 ** 3);
});

test("nothing usable from the disk: none", () => {
  assert.strictEqual(diskQuota(null), null);
  assert.strictEqual(diskQuota({ bsize: 0, blocks: 10, bavail: 1 }), null);
  assert.strictEqual(diskQuota({ bsize: 4096, blocks: 10, bavail: -1 }), null);
});
