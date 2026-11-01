"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Timezone, isZone, TRACE_URL } = require("../main/timezone");
const { tempStore } = require("./helpers");

const answering = (answers) => async (url) => {
  const answer = answers[url];
  if (answer === undefined) {
    throw new Error("no route");
  }
  if (answer === null) {
    return { ok: false, json: async () => ({}) };
  }
  return { ok: true, json: async () => answer };
};

test("zone names are checked", () => {
  assert.equal(isZone("Europe/Paris"), true);
  assert.equal(isZone("America/Argentina/Buenos_Aires"), true);
  assert.equal(isZone("UTC"), true);
  assert.equal(isZone("Etc/GMT+3"), true);
  assert.equal(isZone("Mars/Olympus"), false);
  assert.equal(isZone("+01:00"), false);
  assert.equal(isZone(""), false);
  assert.equal(isZone(null), false);
});

test("the first service that answers with a known zone wins", async () => {
  const timezone = new Timezone(tempStore(), {
    fetch: answering({
      "https://ipwho.is/": null,
      "https://ipapi.co/json/": { timezone: "Nowhere/Nothing" },
      "https://ipinfo.io/json": { timezone: "Africa/Casablanca" },
    }),
  });
  assert.equal(timezone.current, null);
  const changes = [];
  timezone.onChange((zone) => changes.push(zone));
  await timezone.refresh();
  assert.equal(timezone.current, "Africa/Casablanca");
  assert.deepEqual(changes, ["Africa/Casablanca"]);
  await timezone.refresh();
  assert.deepEqual(changes, ["Africa/Casablanca"], "no change, no notice");
});

test("the services' shapes are read", async () => {
  for (const [url, answer] of [
    ["https://ipwho.is/", { timezone: { id: "Europe/Madrid" } }],
    ["https://ipapi.co/json/", { timezone: "Europe/Madrid" }],
    ["https://ipinfo.io/json", { timezone: "Europe/Madrid" }],
    ["https://freeipapi.com/api/json", { timeZones: ["Europe/Madrid"] }],
  ]) {
    const timezone = new Timezone(tempStore(), { fetch: answering({ [url]: answer }) });
    await timezone.refresh();
    assert.equal(timezone.current, "Europe/Madrid", url);
  }
});

test("the last zone is kept for the next launch, and the setting turns it off", async () => {
  const store = tempStore();
  const first = new Timezone(store, { fetch: answering({ "https://ipwho.is/": { timezone: { id: "Asia/Tokyo" } } }) });
  await first.refresh();
  const second = new Timezone(store, { fetch: answering({}) });
  assert.equal(second.current, "Asia/Tokyo");
  second.setEnabled(false);
  assert.equal(second.current, null);
  second.setEnabled(true);
  assert.equal(second.current, "Asia/Tokyo");
});

test("a forced zone shows without asking", async () => {
  let asked = 0;
  const timezone = new Timezone(tempStore(), { fetch: async () => { asked++; throw new Error("no"); }, forced: "America/New_York" });
  await timezone.refresh();
  assert.equal(timezone.current, "America/New_York");
  assert.equal(asked, 0);
});

test("the address is watched: a new one (a VPN on) brings its zone, the same one asks nothing more", async () => {
  let trace = "fl=1\nip=105.66.1.2\nloc=MA\nwarp=off\n";
  let zoneAnswer = { timezone: { id: "Africa/Casablanca" }, ip: "105.66.1.2", country_code: "MA" };
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    if (url === TRACE_URL) {
      return { ok: true, text: async () => trace };
    }
    if (url === "https://ipwho.is/") {
      return { ok: true, json: async () => zoneAnswer };
    }
    throw new Error("no route");
  };
  const timezone = new Timezone(tempStore(), { fetch });
  const changes = [];
  timezone.onChange((zone) => changes.push(zone));
  await timezone.check(true);
  assert.equal(timezone.current, "Africa/Casablanca");
  assert.deepEqual([timezone.info.ip, timezone.info.country], ["105.66.1.2", "MA"]);
  // The same address: only the trace page is read.
  asked.length = 0;
  await timezone.check();
  assert.deepEqual(asked, [TRACE_URL]);
  // A VPN in London: its zone, at the next look.
  trace = "ip=81.2.69.160\nloc=GB\n";
  zoneAnswer = { timezone: { id: "Europe/London" }, ip: "81.2.69.160", country_code: "GB" };
  await timezone.check();
  assert.equal(timezone.current, "Europe/London");
  assert.deepEqual(changes, ["Africa/Casablanca", "Europe/London"]);
  assert.deepEqual([timezone.info.ip, timezone.info.country], ["81.2.69.160", "GB"]);
});

test("without the trace page, the services tell the address too", async () => {
  const fetch = async (url) => {
    if (url === "https://ipwho.is/") {
      return { ok: true, json: async () => ({ timezone: { id: "America/New_York" }, ip: "3.4.5.6", country_code: "us" }) };
    }
    throw new Error("no route");
  };
  const timezone = new Timezone(tempStore(), { fetch });
  await timezone.check();
  assert.equal(timezone.current, "America/New_York");
  assert.deepEqual([timezone.info.ip, timezone.info.country], ["3.4.5.6", "US"]);
});
