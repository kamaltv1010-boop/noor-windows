"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Timezone, isZone } = require("../main/timezone");
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
