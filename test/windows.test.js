"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Windows, profileArgument } = require("../main/windows");
const { Profiles, DEFAULT_ID } = require("../main/profiles");
const { tempStore } = require("./helpers");

/// A window as the windows see it: its profile, its tabs nobody sees, and
/// what was done to it.
class FakeWindow {
  constructor(windows, profile, bounds) {
    this.windows = windows;
    this.profile = profile;
    this.bounds = bounds;
    this.backgroundTabs = [];
    this.allTabs = [];
    this.closing = false;
    this.deleting = false;
    this.fronted = 0;
    this.states = 0;
    this.title = "";
    this.win = {
      isDestroyed: () => this.closed === true,
      getNormalBounds: () => ({ x: 100, y: 80, width: 1200, height: 800 }),
      setTitle: (title) => { this.title = title; },
      setIcon: () => {},
      close: () => this.close(),
    };
  }

  bringToFront() { this.fronted += 1; }
  pushState() { this.states += 1; }
  tabFor() { return null; }
  backgroundTab(profile) {
    const tab = { profile, closed: false, close() { this.closed = true; } };
    this.backgroundTabs.push(tab);
    return tab;
  }
  closeBackgroundTab(tab) {
    this.backgroundTabs = this.backgroundTabs.filter((t) => t !== tab);
    tab.close();
  }
  adopt(tab, from) {
    from.backgroundTabs = from.backgroundTabs.filter((t) => t !== tab);
    this.backgroundTabs.push(tab);
  }
  switchProfile(id) { this.profile = this.windows.profiles.find(id); }
  /// As a window closing does (see Browser.makeWindow).
  close() {
    this.closing = true;
    this.windows.closing(this);
    this.closed = true;
    this.windows.closed(this);
  }
}

const made = () => {
  const store = tempStore();
  const profiles = new Profiles(store);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-windows-"));
  const windows = new Windows({ store, profiles, userData, stats: { trackerBlocked() {} } }, {
    makeBrowser: (profile, bounds) => new FakeWindow(windows, profile, bounds),
    appId: "ma.noor.browser",
    executable: "C:\\Noor\\Noor.exe",
  });
  const cleared = [];
  windows.clearData = async (profile) => { cleared.push(profile.id); };
  const started = [];
  const stopped = [];
  windows.warmup = {
    auto: false,
    settings() { return { auto: this.auto }; },
    startMany: async (list) => { started.push(...list.map((p) => p.id)); },
    stop: (id) => { stopped.push(id); },
  };
  return { store, profiles, windows, cleared, started, stopped, userData };
};

test("a profile opens in a window of its own, once: opened again, its window comes to the front", () => {
  const { profiles, windows, store } = made();
  const first = windows.open(profiles.find(DEFAULT_ID));
  assert.equal(windows.list.length, 1);
  assert.equal(first.title, "Noor");
  assert.equal(first.bounds, null);
  assert.deepEqual(first.taskbar, { appId: "ma.noor.browser" });
  const shop = profiles.add("Shop 7");
  const second = windows.open(shop);
  assert.equal(windows.list.length, 2);
  assert.equal(windows.current, second);
  assert.equal(second.title, "Shop 7 - Noor");
  // A little below and right of the one in front, as big.
  assert.deepEqual(second.bounds, { x: 132, y: 112, width: 1200, height: 800 });
  // A taskbar button of its own, which once pinned opens this profile.
  assert.equal(second.taskbar.appId, `ma.noor.browser.profile.${shop.id.replace(/-/g, "")}`);
  assert.equal(second.taskbar.relaunchCommand, `"C:\\Noor\\Noor.exe" --profile=${shop.id}`);
  assert.equal(second.taskbar.relaunchDisplayName, "Shop 7 - Noor");
  // Opened again: no new window.
  assert.equal(windows.open(profiles.find(DEFAULT_ID)), first);
  assert.equal(first.fronted, 1);
  assert.equal(windows.list.length, 2);
  assert.equal(windows.current, first);
  assert.equal(profiles.current().id, DEFAULT_ID);
  assert.deepEqual(store.get("openWindows"), [DEFAULT_ID, shop.id]);
  assert.equal(windows.forProfile(shop.id), second);
});

test("the windows of the last run open again, the one used last in front; or the profile asked for", () => {
  const { profiles, windows, store } = made();
  const a = profiles.add("A");
  const b = profiles.add("B");
  store.set("openWindows", [b.id, "gone", DEFAULT_ID, b.id]);
  profiles.select(b.id);
  windows.restore();
  assert.deepEqual(windows.list.map((w) => w.profile.id), [DEFAULT_ID, b.id]);
  assert.equal(windows.current.profile.id, b.id);

  const again = made();
  const c = again.profiles.add("C");
  again.windows.restore(c.id);
  assert.deepEqual(again.windows.list.map((w) => w.profile.id), [c.id]);
  // Nothing remembered: the profile used last.
  const empty = made();
  empty.windows.restore();
  assert.deepEqual(empty.windows.list.map((w) => w.profile.id), [DEFAULT_ID]);
  assert.equal(profileArgument(["noor.exe", "--profile=abc-1"]), "abc-1");
  assert.equal(profileArgument(["noor.exe", "https://x.com/"]), null);
  void a;
});

test("closing a window: its hidden tabs go on in another, and the profile stays unless it is to be replaced", async () => {
  const { profiles, windows, store, cleared } = made();
  const home = windows.open(profiles.find(DEFAULT_ID));
  const shop = profiles.add("Shop");
  const shopWindow = windows.open(shop);
  const farm = profiles.add("Farm");
  const hidden = windows.backgroundTab(farm);
  assert.deepEqual(shopWindow.backgroundTabs, [hidden]);
  shopWindow.close();
  assert.deepEqual(home.backgroundTabs, [hidden]);
  assert.equal(hidden.closed, false);
  assert.deepEqual(windows.list, [home]);
  assert.equal(windows.current, home);
  assert.ok(profiles.find(shop.id));
  assert.deepEqual(store.get("openWindows"), [DEFAULT_ID]);
  assert.deepEqual(cleared, []);
  windows.closeBackgroundTab(hidden);
  assert.equal(hidden.closed, true);
  assert.deepEqual(home.backgroundTabs, []);
});

test("with \"Replace a profile when closed\": deleted as its window closes, a new one with the next number in its place", async () => {
  const { profiles, windows, store, cleared, started, stopped, userData } = made();
  store.set("freshOnClose", true);
  windows.open(profiles.find(DEFAULT_ID));
  const [one, two, three] = profiles.addMany(3, "Temp");
  fs.writeFileSync(path.join(userData, profiles.historyFile(two)), "[]");
  const window = windows.open(two);
  window.close();
  await new Promise((resolve) => setImmediate(resolve));
  const names = profiles.all().map((p) => p.name);
  assert.deepEqual(names, ["Personal", "Temp 1", "Temp 3", "Temp 4"]);
  const fresh = profiles.all()[3];
  assert.notEqual(fresh.id, two.id);
  // The same taskbar button as the old one, and opened by its pinned one.
  assert.equal(windows.open(fresh).taskbar.appId, window.taskbar.appId);
  assert.equal(windows.current.taskbar.relaunchCommand, `"C:\\Noor\\Noor.exe" --profile=${two.id}`);
  windows.current.deleting = true;
  windows.current.close();
  assert.equal(profiles.find(two.id), null);
  assert.deepEqual(cleared, [two.id]);
  assert.ok(stopped.includes(two.id));
  assert.equal(fs.existsSync(path.join(userData, profiles.historyFile(two))), false);
  assert.deepEqual(store.get("doomedPartitions"), [`noor-${two.id}`]);
  // Collecting cookies only where new profiles do.
  assert.deepEqual(started, []);
  // The first profile is never deleted.
  const other = windows.open(one);
  windows.forProfile(DEFAULT_ID).close();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(profiles.all()[0].id, DEFAULT_ID);
  assert.equal(windows.current, other);
  void three;
});

test("a profile made new collects its cookies where new profiles do: now, or at the next launch with no window", async () => {
  const { profiles, windows, store, started } = made();
  store.set("freshOnClose", true);
  windows.warmup.auto = true;
  windows.open(profiles.find(DEFAULT_ID));
  const shop = profiles.add("Shop 11");
  windows.open(shop).close();
  await new Promise((resolve) => setImmediate(resolve));
  const fresh = profiles.all().find((p) => p.name === "Shop 12");
  assert.ok(fresh);
  assert.deepEqual(started, [fresh.id]);
  // The app quitting: its windows close, and the new ones collect next time.
  windows.open(fresh);
  windows.quitting = true;
  store.set("openWindows", [DEFAULT_ID, fresh.id]);
  for (const window of windows.list.slice()) {
    window.close();
  }
  await new Promise((resolve) => setImmediate(resolve));
  const newer = profiles.all().find((p) => p.name === "Shop 13");
  assert.ok(newer);
  assert.equal(profiles.find(fresh.id), null);
  assert.deepEqual(started, [fresh.id]);
  assert.deepEqual(store.get("collectPending"), [newer.id]);
  // Its window's place at the next launch is the new one's.
  assert.deepEqual(store.get("openWindows"), [DEFAULT_ID, newer.id]);
  windows.quitting = false;
  windows.restore();
  windows.collectPending();
  assert.deepEqual(started, [fresh.id, newer.id]);
  assert.deepEqual(store.get("collectPending"), []);
  assert.deepEqual(windows.list.map((w) => w.profile.id), [DEFAULT_ID, newer.id]);
});

test("deleting a profile closes its window, with no new one in its place; the last window shows the first profile", async () => {
  const { profiles, windows, store } = made();
  store.set("freshOnClose", true);
  windows.open(profiles.find(DEFAULT_ID));
  const shop = profiles.add("Shop");
  const window = windows.open(shop);
  await windows.deleteProfile(shop.id);
  assert.equal(window.deleting, true);
  assert.equal(window.closed, true);
  assert.deepEqual(profiles.all().map((p) => p.name), ["Personal"]);
  assert.deepEqual(windows.list.map((w) => w.profile.id), [DEFAULT_ID]);
  // The only window: it shows the first profile instead.
  const other = profiles.add("Other");
  const only = windows.list[0];
  only.switchProfile(other.id);
  await windows.deleteProfile(other.id);
  assert.equal(only.profile.id, DEFAULT_ID);
  assert.equal(windows.list.length, 1);
  assert.deepEqual(profiles.all().map((p) => p.name), ["Personal"]);
});

test("new profiles open in a window of their own; many at once open none, and collect together", () => {
  const { windows, started } = made();
  windows.warmup.auto = true;
  windows.open(windows.profiles.find(DEFAULT_ID));
  const one = windows.createProfile("Solo");
  assert.equal(windows.current.profile.id, one.id);
  assert.deepEqual(started, [one.id]);
  const many = windows.createProfiles(3, "Farm");
  assert.equal(windows.list.length, 2);
  assert.deepEqual(started, [one.id, ...many.map((p) => p.id)]);
});

test("new profiles get the cookies of every new profile first, then collect theirs; made as the app closes, at the next launch", async () => {
  const { profiles, windows, store, started } = made();
  windows.warmup.auto = true;
  const seeded = [];
  let release = () => {};
  windows.newCookies = {
    on: true,
    active() { return this.on; },
    seed: (list) => {
      seeded.push(...list.map((p) => p.id));
      return new Promise((resolve) => { release = resolve; });
    },
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  windows.open(profiles.find(DEFAULT_ID));
  // One: its cookies, then its collection.
  const one = windows.createProfile("Solo");
  assert.deepEqual(seeded, [one.id]);
  assert.deepEqual(started, []);
  release();
  await settle();
  assert.deepEqual(started, [one.id]);
  // Many at once: together.
  const many = windows.createProfiles(2, "Farm");
  assert.deepEqual(seeded, [one.id, ...many.map((p) => p.id)]);
  assert.deepEqual(started, [one.id]);
  release();
  await settle();
  assert.deepEqual(started, [one.id, ...many.map((p) => p.id)]);
  // Off: no cookies, and it collects at once.
  windows.newCookies.on = false;
  const plain = windows.createProfile("Plain");
  assert.equal(seeded.length, 3);
  assert.equal(started[started.length - 1], plain.id);
  // Made in a closed one's place, another window open: now.
  windows.newCookies.on = true;
  store.set("freshOnClose", true);
  windows.forProfile(plain.id).close();
  await settle();
  const fresh = profiles.all().find((p) => p.name === "Plain 2");
  assert.ok(fresh);
  assert.equal(seeded[seeded.length - 1], fresh.id);
  release();
  await settle();
  assert.equal(started[started.length - 1], fresh.id);
  // As the app closes (its windows closing, "Solo"'s and "Plain 2"'s each
  // replaced): left for the next launch, the cookies first.
  windows.open(fresh);
  windows.quitting = true;
  for (const window of windows.list.slice()) {
    window.close();
  }
  await settle();
  const solo = profiles.all().find((p) => p.name === "Solo 2");
  const newer = profiles.all().find((p) => p.name === "Plain 3");
  assert.ok(solo && newer);
  assert.equal(seeded.includes(solo.id) || seeded.includes(newer.id), false);
  assert.deepEqual(store.get("seedPending"), [solo.id, newer.id]);
  assert.deepEqual(store.get("collectPending"), [solo.id, newer.id]);
  windows.quitting = false;
  windows.restore();
  const pending = windows.seedPending();
  assert.deepEqual(seeded.slice(-2), [solo.id, newer.id]);
  assert.deepEqual(store.get("seedPending"), []);
  release();
  await pending;
  windows.collectPending();
  assert.deepEqual(started.slice(-2), [solo.id, newer.id]);
  // Nothing left: nothing set.
  const count = seeded.length;
  await windows.seedPending();
  assert.equal(seeded.length, count);
});

test("Noor iPhone: new profiles are what the settings say, iPhones or iPads, those made in a closed one's place too", async () => {
  const { Fingerprint } = require("../main/fingerprint");
  const store = tempStore();
  const profiles = new Profiles(store);
  const fingerprint = new Fingerprint(store, profiles, { iphone: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-windows-"));
  const windows = new Windows({ store, profiles, fingerprint, userData, stats: { trackerBlocked() {} } }, {
    makeBrowser: (profile, bounds) => new FakeWindow(windows, profile, bounds),
  });
  windows.clearData = async () => {};
  windows.warmup = { settings: () => ({ auto: false }), startMany: async () => {}, stop: () => {} };
  const familyOf = (profile) => fingerprint.forProfile(profile).iphone().family;
  windows.open(profiles.find(DEFAULT_ID));
  assert.equal(familyOf(windows.createProfile("Phone")), "iphone");
  store.set("newProfileDevice", "ipad");
  const pad = windows.createProfile("Pad");
  assert.equal(familyOf(pad), "ipad");
  const many = windows.createProfiles(3, "Tablet");
  assert.deepEqual(many.map(familyOf), ["ipad", "ipad", "ipad"]);
  // The first profile stays what it was.
  assert.equal(familyOf(profiles.find(DEFAULT_ID)), "iphone");
  // A profile made in an iPhone's place is what new ones are: an iPad.
  store.set("freshOnClose", true);
  const phone = profiles.all().find((p) => p.name === "Phone");
  windows.open(phone).close();
  await new Promise((resolve) => setImmediate(resolve));
  const fresh = profiles.all()[profiles.all().length - 1];
  assert.equal(fresh.name, "Phone 2");
  assert.equal(profiles.find(phone.id), null);
  assert.equal(familyOf(fresh), "ipad");
});
