"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { zoneIdentifier } = require("../main/downloads");

test("the Mark of the Web a download gets, as Chrome writes it", () => {
  assert.equal(
    zoneIdentifier("https://files.example.com/report.docm", "https://example.com/mail", false),
    "[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://example.com/mail\r\nHostUrl=https://files.example.com/report.docm\r\n",
  );
  // From a private tab: where it came from isn't written (Chrome's incognito).
  assert.equal(
    zoneIdentifier("https://files.example.com/report.docm", "https://example.com/mail", true),
    "[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=about:internet\r\n",
  );
  // What isn't a web address (a blob:, data:, an app's own page) isn't written either; the zone stays.
  assert.equal(zoneIdentifier("blob:https://example.com/1234", "noor://app/start.html", false), "[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=about:internet\r\n");
  assert.equal(zoneIdentifier("data:text/plain,hi", "", false), "[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=about:internet\r\n");
});
