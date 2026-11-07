// The cookies every new profile starts with, through the app as a user
// reaches it: in Settings › Cookies, a site and its cookies as Ctrl+O copies
// them, JSON that tells its own sites, and a cookies.txt file (File…) are
// added, and a header's text with no site is asked its site; a profile made
// from the settings ("New Profile"), several made at once, and one made in
// a closed profile's place each start with them (kept a year, an HttpOnly
// one HttpOnly), and the site gets them with the first page; the first
// profile, made before, doesn't; turned off, a new profile starts with
// none; a site removed is put in no more; their values aren't in the file
// where the system can encrypt them (on Windows it must); and after a
// restart they are read back and put in still. Needs Playwright and a
// display: on Linux,
// `xvfb-run -a node tools/smoke-new-profile-cookies.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VALUES = ["one1", "two2", "son3", "net4"];

(async () => {
  // The site: notes the Cookie header of each page asked for (by ?who=…).
  const got = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://win.test");
    const who = url.searchParams.get("who");
    if (who) {
      got[who] = (got[who] || []).concat([req.headers.cookie || ""]);
    }
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>page</title><p>${url.pathname}</p>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://www.win.test:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-new-cookies-"));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "noor-new-cookies-files-"));

  let app = null;
  const main = (fn, arg) => app.evaluate(fn, arg);
  const launch = async () => {
    app = await electron.launch({
      executablePath: require(path.join(root, "node_modules", "electron")),
      args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"],
      env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
    });
    for (let i = 0; i < 200; i++) {
      if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(1200);
  };
  const steps = [];
  const step = (name, ok, detail) => {
    steps.push(Boolean(ok));
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ": " + JSON.stringify(detail)}`);
  };
  /// `read()` again until `done(value)`, for `ms` at most: the last value.
  const until = async (read, done, ms = 6000) => {
    let value = null;
    for (const end = Date.now() + ms; Date.now() < end;) {
      value = await read().catch(() => null);
      if (done(value)) break;
      await sleep(150);
    }
    return value;
  };
  /// Opens `url` in the window in front, and waits for it to be loaded.
  const visit = async (url) => {
    await main((electron, address) => { global.noorTest.browser.newTab({ url: address }); }, url);
    await until(() => main((electron, address) => {
      const contents = global.noorTest.browser.selected.webContents;
      return contents.getURL() === address ? contents.executeJavaScript("document.readyState") : null;
    }, url), (state) => state === "complete", 20000);
    await sleep(300);
  };
  /// The settings page (a tab of the first window), as a user has it.
  const page = (code) => main((electron, source) => global.__settings.executeJavaScript(source, true), code);
  const openSettings = async () => {
    await main(() => {
      const browser = global.noorTest.browser;
      browser.newTab({ url: "noor://app/settings.html#cookies" });
      global.__settings = browser.selected.webContents;
    });
    return until(() => page('document.readyState === "complete" && document.getElementById("newcookieshint").textContent'), Boolean, 15000);
  };
  const said = () => page('document.getElementById("newcookiessaid").textContent');
  const listed = () => page('[...document.querySelectorAll("#newcookieslist .row")].map((row) => ({ site: row.querySelector(".label").firstChild.textContent, hint: row.querySelector("small").textContent }))');
  /// The site and text written in the card, Add pressed: what it says then.
  const add = async (site, text) => {
    await page(`(() => {
      document.getElementById("newcookiessaid").textContent = "";
      document.getElementById("newcookiessite").value = ${JSON.stringify(site)};
      document.getElementById("newcookiestext").value = ${JSON.stringify(text)};
      document.getElementById("newcookiesadd").click();
    })()`);
    return until(said, Boolean);
  };
  /// A profile's cookies, by name (its normal session's).
  const cookiesOf = (name) => main(async ({ session }, profileName) => {
    const noor = global.noorTest;
    const profile = noor.context.profiles.all().find((p) => p.name === profileName);
    if (!profile) return null;
    const list = await session.fromPartition(noor.windows.partitionFor(false, profile)).cookies.get({});
    return list.map((c) => ({ name: c.name, value: c.value, domain: c.domain, httpOnly: c.httpOnly, session: Boolean(c.session), expires: c.expirationDate || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, name);
  const namesOf = (list) => (list || []).map((c) => `${c.name}=${c.value}`).join("; ");
  /// Waits for a profile to have the cookies named (what it has then).
  const seededWith = (name, wanted) => until(() => cookiesOf(name), (list) => wanted.every((pair) => namesOf(list).split("; ").includes(pair)));
  const profileNames = () => main(() => global.noorTest.context.profiles.all().map((p) => p.name));

  await launch();
  const hint = await openSettings();
  const empty = await listed();
  const box = await page('({ checked: document.getElementById("newcookieson").checked, disabled: document.getElementById("newcookieson").disabled })');
  step("Settings › Cookies: “Cookies of every new profile”, none yet, its switch on but idle", /starts with the cookies you add below/.test(hint || "") && empty.length === 0 && box.checked && box.disabled, { hint, empty, box });

  // 1. A site and its cookies, as Ctrl+O copies them.
  const header = await add(`${base}/`, "a=one1; b=two2");
  let list = await listed();
  step("a site and its cookies as Ctrl+O copies them: added, listed by site with their names", header === "2 cookies added for win.test." && list.length === 1 && list[0].site === "win.test" && list[0].hint === "2 cookies: a, b.", { header, list });

  // 2. JSON with a site of its own (the site left empty).
  const json = await add("", JSON.stringify([{ domain: ".other.test", name: "j", value: "son3", path: "/", httpOnly: true, hostOnly: false, sameSite: "lax" }]));
  step("JSON that tells its site: added with the site left empty", json === "1 cookie added for other.test.", json);

  // 3. A header's text with no site: its site is asked for, nothing added.
  const siteless = await add("", "x=1");
  const text = await page('document.getElementById("newcookiestext").value');
  step("a header's text with no site: “Write the site…”, the text left in its field", /^Write the site/.test(siteless || "") && text === "x=1", { siteless, text });

  // 4. File…: a cookies.txt file, added at once.
  const file = path.join(scratch, "cookies.txt");
  fs.writeFileSync(file, "# Netscape HTTP Cookie File\n#HttpOnly_.net.test\tTRUE\t/\tFALSE\t0\tn\tnet4\n");
  await main(({ dialog }, chosen) => {
    global.__showOpenDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, file);
  await page('document.getElementById("newcookiessaid").textContent = ""; document.getElementById("newcookiessite").value = ""; document.getElementById("newcookiesfile").click()');
  const fromFile = await until(said, Boolean);
  await main(({ dialog }) => { dialog.showOpenDialog = global.__showOpenDialog; });
  list = await listed();
  step("File…: a cookies.txt file's cookies, added at once", fromFile === "1 cookie added for net.test." && list.map((row) => row.site).join() === "net.test,other.test,win.test", { fromFile, sites: list.map((row) => row.site) });

  // 5. Kept encrypted where the system can (on Windows it must).
  const sealing = await main(({ safeStorage }) => { try { return safeStorage.isEncryptionAvailable(); } catch (error) { return false; } });
  const kept = fs.readFileSync(path.join(userData, "new-profile-cookies.json"), "utf8");
  const plain = VALUES.filter((value) => kept.includes(value));
  const stateNow = await main(() => global.noorTest.newCookies.state());
  const sealedOK = sealing ? plain.length === 0 && stateNow.sealed : process.platform !== "win32" && !stateNow.sealed;
  step(sealing ? "their values aren't in the file: encrypted by the system" : "no system encryption here (Linux with no keyring): kept as they are", sealedOK, { sealing, plain, sealed: stateNow.sealed, platform: process.platform });
  const hintOn = await page('document.getElementById("newcookieshint").textContent');
  step("the card says what new profiles get", /starts with these 4 cookies of 3 sites/.test(hintOn) && (!sealing || /encrypted/.test(hintOn)), hintOn);

  // 6. "New Profile" in the settings: its window, its cookies, the site gets them.
  await page('document.getElementById("newprofilename").value = "Seeded"; document.getElementById("newprofile").click()');
  await until(() => main(() => global.noorTest.browser.profile.name), (name) => name === "Seeded", 15000);
  const seeded = await seededWith("Seeded", ["a=one1", "b=two2", "j=son3", "n=net4"]);
  const year = Date.now() / 1000 + 300 * 24 * 60 * 60;
  const j = (seeded || []).find((c) => c.name === "j");
  step("a new profile (New Profile) starts with all four, kept a year, the HttpOnly one HttpOnly", namesOf(seeded) === "a=one1; b=two2; j=son3; n=net4" && seeded.every((c) => !c.session && c.expires > year) && j && j.httpOnly && j.domain === ".other.test", seeded);
  const toast = await until(() => main(() => global.noorTest.browser.chrome.webContents.executeJavaScript('document.getElementById("toast").textContent')), (shown) => /Seeded/.test(shown || ""));
  step("its toast says so", /“Seeded”: a new profile, in its own window, with the cookies of 3 sites/.test(toast || ""), toast);
  await visit(`${base}/page?who=seeded`);
  const sent = ((got.seeded || [])[0] || "").split("; ").sort();
  step("the site gets them with the profile's first page", JSON.stringify(sent) === JSON.stringify(["a=one1", "b=two2"]), got.seeded);

  // 7. Several at once (the settings' "Create multiple profiles").
  const before = await profileNames();
  await page('document.getElementById("manycount").value = "2"; document.getElementById("manyname").value = "Farm"; document.getElementById("manycreate").click()');
  const after = await until(profileNames, (names) => names.length === before.length + 2);
  const farm = (after || []).filter((name) => !before.includes(name));
  const farmed = [];
  for (const name of farm) {
    farmed.push(namesOf(await seededWith(name, ["a=one1", "b=two2", "j=son3", "n=net4"])));
  }
  step("several made at once: each starts with them", farm.length === 2 && farmed.every((names) => names === "a=one1; b=two2; j=son3; n=net4"), { farm, farmed });

  // 8. The first profile, made before: none of them.
  const first = await main(async ({ session }) => {
    const noor = global.noorTest;
    const list = await session.fromPartition(noor.windows.partitionFor(false, noor.context.profiles.all()[0])).cookies.get({});
    return list.map((c) => c.name);
  });
  step("the profiles made before keep theirs: the first has none of them", !["a", "b", "j", "n"].some((name) => first.includes(name)), first);

  // 9. Made in a closed profile's place.
  await page('if (!document.getElementById("freshonclose").checked) document.getElementById("freshonclose").click()');
  const beforeClose = await profileNames();
  await main(() => {
    const noor = global.noorTest;
    const profile = noor.context.profiles.all().find((p) => p.name === "Seeded");
    noor.windows.forProfile(profile.id).win.close();
  });
  const afterClose = await until(profileNames, (names) => Boolean(names) && !names.includes("Seeded") && names.length === beforeClose.length, 15000);
  const replacement = (afterClose || []).find((name) => !beforeClose.includes(name));
  const replaced = replacement ? await seededWith(replacement, ["a=one1", "b=two2", "j=son3", "n=net4"]) : null;
  step("one made in a closed profile's place starts with them", Boolean(replacement) && namesOf(replaced) === "a=one1; b=two2; j=son3; n=net4", { replacement, cookies: namesOf(replaced) });
  await page('if (document.getElementById("freshonclose").checked) document.getElementById("freshonclose").click()');

  // 10. Turned off: a new profile starts with none; on again.
  await page('document.getElementById("newcookieson").click()');
  const off = await until(() => page('document.getElementById("newcookieshint").textContent'), (shown) => /^Off/.test(shown || ""));
  await main(() => { global.noorTest.windows.createProfiles(1, "Plain"); });
  await sleep(1500);
  const plainName = (await profileNames()).find((name) => /^Plain/.test(name));
  const none = await cookiesOf(plainName);
  step("turned off: the switch says so, and a new profile starts with none", /^Off: new profiles start with no cookies/.test(off || "") && Array.isArray(none) && none.length === 0, { off, none });
  await page('document.getElementById("newcookieson").click()');
  await until(() => main(() => global.noorTest.newCookies.state().enabled), Boolean);

  // 11. A site removed: put in no more.
  await page('[...document.querySelectorAll("#newcookieslist .row")].find((row) => row.querySelector(".label").firstChild.textContent === "net.test").querySelector("button").click()');
  list = await until(listed, (rows) => Array.isArray(rows) && rows.length === 2);
  await main(() => { global.noorTest.windows.createProfiles(1, "NoNet"); });
  const noNetName = (await profileNames()).find((name) => /^NoNet/.test(name));
  const noNet = await seededWith(noNetName, ["a=one1", "b=two2", "j=son3"]);
  await sleep(500);
  step("a site removed from the list: no longer put into new profiles", list.map((row) => row.site).join() === "other.test,win.test" && namesOf(await cookiesOf(noNetName)) === "a=one1; b=two2; j=son3", { sites: list.map((row) => row.site), cookies: namesOf(noNet) });

  // 12. After a restart: read back, and put in still.
  await app.close().catch(() => {});
  await sleep(800);
  await launch();
  const back = await main(() => global.noorTest.newCookies.state());
  step("after a restart: read back (the system opens what it encrypted)", back.enabled && back.sites.map((s) => s.site).join() === "other.test,win.test" && back.sites.every((s) => !s.unreadable) && back.total === 3, back);
  await main(() => { global.noorTest.windows.createProfiles(1, "After"); });
  const afterName = (await profileNames()).find((name) => /^After/.test(name));
  const restarted = await seededWith(afterName, ["a=one1", "b=two2", "j=son3"]);
  step("a profile made after the restart starts with them", namesOf(restarted) === "a=one1; b=two2; j=son3", namesOf(restarted));

  await app.close().catch(() => {});
  server.close();
  for (const folder of [userData, scratch]) {
    try {
      fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      // Left for the system to clear.
    }
  }
  const ok = steps.every(Boolean);
  console.log(ok ? "NEW PROFILE COOKIES SMOKE OK" : "NEW PROFILE COOKIES SMOKE FAILED");
  process.exit(ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
