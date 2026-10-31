"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");
const warmup = require("../main/warmup");

const { SITES, REGION_NAMES, regionsFor, siteKey, pickSites, pickLink } = warmup;

/// The same numbers for the same seed (mulberry32).
const seeded = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

test("the sites are home pages over https, each site once in its list, every region named", () => {
  for (const [region, list] of Object.entries(SITES)) {
    const keys = list.map((url) => siteKey(new URL(url).hostname));
    assert.equal(new Set(keys).size, list.length, `${region} names a site twice`);
    for (const url of list) {
      const parsed = new URL(url);
      assert.equal(parsed.protocol, "https:", url);
      assert.ok(!parsed.search && !parsed.hash, url);
    }
    if (region !== "global") {
      assert.ok(REGION_NAMES[region], region);
    }
  }
  assert.ok(SITES.global.length >= 40 && SITES.MA.length >= 15);
});

test("a time zone's regions: Morocco's, France's, the Arab world's, none for the rest", () => {
  assert.deepEqual(regionsFor("Africa/Casablanca"), ["MA", "FR", "AR"]);
  assert.deepEqual(regionsFor("Europe/Paris"), ["FR"]);
  assert.deepEqual(regionsFor("Asia/Riyadh"), ["AR"]);
  assert.deepEqual(regionsFor("America/New_York"), ["US"]);
  assert.deepEqual(regionsFor("America/Indiana/Indianapolis"), ["US"]);
  assert.deepEqual(regionsFor("Asia/Tokyo"), []);
  assert.deepEqual(regionsFor(""), []);
  assert.deepEqual(regionsFor(null), []);
});

test("a site is its registered name, with its subdomains", () => {
  assert.equal(siteKey("www.bbc.co.uk"), "bbc.co.uk");
  assert.equal(siteKey("fr.hespress.com"), "hespress.com");
  assert.equal(siteKey("WWW.Avito.MA."), "avito.ma");
  assert.equal(siteKey("www.hurriyet.com.tr"), "hurriyet.com.tr");
  assert.equal(siteKey("a.warm.test"), "warm.test");
  assert.equal(siteKey("127.0.0.1"), "127.0.0.1");
  assert.equal(siteKey("localhost"), "localhost");
});

test("the sites picked: as many as asked, one per site, half the world's and half the region's", () => {
  const picked = pickSites(20, "Africa/Casablanca", seeded(1));
  assert.equal(picked.length, 20);
  const keys = picked.map((url) => siteKey(new URL(url).hostname));
  assert.equal(new Set(keys).size, 20);
  const from = (region) => picked.filter((url) => SITES[region].includes(url)).length;
  assert.ok(from("MA") >= 5, `Morocco's: ${from("MA")}`);
  assert.ok(from("global") >= 9, `the world's: ${from("global")}`);
  assert.ok(from("MA") > from("AR") && from("MA") > from("FR"));
  // Where the zone names no region: the world's alone.
  const world = pickSites(10, "Asia/Tokyo", seeded(2));
  assert.equal(world.length, 10);
  assert.ok(world.every((url) => SITES.global.includes(url)));
  // A new mix each time.
  assert.notDeepEqual(pickSites(20, "Africa/Casablanca", seeded(3)), picked);
  // More than a region has: the rest from everywhere, still one per site.
  const many = pickSites(150, "Europe/Paris", seeded(4));
  assert.equal(new Set(many.map((url) => siteKey(new URL(url).hostname))).size, many.length);
  assert.ok(many.length >= 120);
  assert.equal(pickSites(0, "Europe/Paris", seeded(5)).length, 1);
});

test("a link followed is another page of the same site a reader opens, never one that signs out, buys or downloads", () => {
  const page = "https://www.example.ma/";
  const links = [
    { href: "https://www.example.ma/logout", text: "Log out" },
    { href: "https://www.example.ma/user/login?next=/", text: "Your space" },
    { href: "https://www.example.ma/account/settings", text: "Settings" },
    { href: "https://www.example.ma/cart", text: "Basket" },
    { href: "https://www.example.ma/checkout/step-1", text: "Pay now" },
    { href: "https://www.example.ma/reports/annual-2026.pdf", text: "Annual report for the whole year" },
    { href: "https://www.example.ma/" + encodeURIComponent("تسجيل-الخروج"), text: "Leave" },
    { href: "https://www.example.ma/x", text: "Se déconnecter" },
    { href: "https://www.example.ma/y", text: "تسجيل الدخول" },
    { href: "https://www.example.ma/#top", text: "Back to the top of the page" },
    { href: "https://www.other.com/news/a-long-story-about-something", text: "A long story about something" },
    { href: "mailto:hello@example.ma", text: "Write to us at this address" },
    { href: "javascript:void(0)", text: "Open the menu of the site" },
    { href: "https://www.example.ma/files/guide", text: "The full guide to the city", download: true },
    { href: "https://user:pw@www.example.ma/news/secret", text: "A link with a password in it" },
  ];
  assert.equal(pickLink(links, page, seeded(6)), null);
  const good = [
    "https://www.example.ma/news/2026/10/a-long-article-about-the-weather",
    "https://sport.example.ma/football/raja-wydad-derby-preview",
  ];
  const all = links.concat([
    { href: good[0], text: "A long article about the weather" },
    { href: good[1], text: "Raja – Wydad: the derby preview" },
    { href: "https://www.example.ma/tag", text: "Tags" },
  ]);
  const random = seeded(7);
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const link = pickLink(all, page, random);
    assert.ok(good.includes(link), link);
    seen.add(link);
  }
  assert.equal(seen.size, 2, "either headline");
  // Short-titled links when nothing has a headline.
  assert.equal(pickLink([{ href: "https://www.example.ma/tag", text: "Tags" }], page, seeded(8)), "https://www.example.ma/tag");
  assert.equal(pickLink(null, page), null);
  assert.equal(pickLink(all, "not a url"), null);
});

test("what runs in the page is a script of its own, and knows the usual banners", () => {
  new vm.Script(warmup.consentScript());
  new vm.Script(warmup.LINKS_SCRIPT);
  for (const selector of ["#onetrust-accept-btn-handler", "#didomi-notice-agree-button", "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", ".fc-cta-consent", "#L2AGLb"]) {
    assert.ok(warmup.CONSENT_SELECTORS.includes(selector), selector);
  }
  for (const words of ["Accept all", "Tout accepter", "J'accepte", "Aceptar todo", "Alle akzeptieren", "قبول الكل", "موافق"]) {
    assert.ok(warmup.CONSENT_WORDS.test(words), words);
  }
  for (const words of ["Reject all", "Manage options", "Subscribe", "Continue without accepting"]) {
    assert.ok(!warmup.CONSENT_WORDS.test(words), words);
  }
  assert.ok(warmup.CONSENT_ABOUT.test("Nous utilisons des cookies") && warmup.CONSENT_ABOUT.test("نستعمل ملفات تعريف الارتباط"));
});

test("visits are quicker for the tests only, and as a person's otherwise", () => {
  assert.ok(warmup.TIMING.load >= 20000 && warmup.TIMING.settle[0] >= 1000);
  assert.ok(warmup.FAST.settle[1] < warmup.TIMING.settle[0]);
  assert.ok(warmup.TIMING.follow > 0 && warmup.TIMING.follow < 1);
});

test("sites as a person writes them: addresses or pages, each once, https:// where none is said", () => {
  assert.deepEqual(warmup.normalizeSites("hespress.com\n  avito.ma  \nhttps://www.youtube.com/watch?v=1#t\nhttp://example.com/a\nhespress.com\nhello\nlocalhost\nftp://files.example.com\nuser:pw@x.com"), [
    "https://hespress.com/", "https://avito.ma/", "https://www.youtube.com/watch?v=1", "http://example.com/a",
  ]);
  assert.deepEqual(warmup.normalizeSites(["jumia.ma", "", null, "https://jumia.ma"]), ["https://jumia.ma/"]);
  assert.deepEqual(warmup.normalizeSites(""), []);
  const many = Array.from({ length: 300 }, (_, i) => `site${i}.com`).join("\n");
  assert.equal(warmup.normalizeSites(many).length, warmup.MAX_SITES);
});

test("the settings kept: popular sites or the user's, how many, and new profiles, each checked", () => {
  const store = { data: {}, get(key, fallback) { return key in this.data ? this.data[key] : fallback; }, set(key, value) { this.data[key] = value; } };
  assert.deepEqual(warmup.readSettings(store), { mode: "popular", count: 20, sites: [], auto: false });
  store.set("warmup", { mode: "mine", count: "7", sites: ["avito.ma", "nonsense", "https://le360.ma/"], auto: true });
  assert.deepEqual(warmup.readSettings(store), { mode: "mine", count: 7, sites: ["https://avito.ma/", "https://le360.ma/"], auto: true });
  store.set("warmup", { mode: "other", count: 1000, sites: "hespress.com", auto: "yes" });
  assert.deepEqual(warmup.readSettings(store), { mode: "popular", count: 200, sites: [], auto: true });
  store.set("warmup", { count: 0 });
  assert.equal(warmup.readSettings(store).count, 20);
  store.set("warmup", { count: -5 });
  assert.equal(warmup.readSettings(store).count, 1);
  // Saving keeps what isn't changed.
  const saver = new warmup.Warmup({ store });
  store.set("warmup", { mode: "mine", count: 30, sites: ["a.ma"], auto: false });
  assert.deepEqual(saver.saveSettings({ auto: true }), { mode: "mine", count: 30, sites: ["https://a.ma/"], auto: true });
  assert.deepEqual(saver.saveSettings({ mode: "popular", count: 55, sites: "b.ma\nc.ma" }), { mode: "popular", count: 55, sites: ["https://b.ma/", "https://c.ma/"], auto: true });
  assert.deepEqual(store.data.warmup, { mode: "popular", count: 55, sites: ["https://b.ma/", "https://c.ma/"], auto: true });
});
