// What WebRTC tells a page of this computer's addresses, in a build of
// Noor ("windows", "iphone" or "android"): the ICE candidates a page
// gathers with no server, and with a STUN server (one this tool runs on
// this computer's own address, so the test needs no network), in the
// page and in a frame of another site. A raw local address (not an mDNS
// name, *.local) in a host candidate is a leak: it is this computer's,
// the same in every profile. Prints the candidates; exits 1 on a leak.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-webrtc.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const dgram = require("dgram");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/// This computer's own addresses (not loopback).
const OWN = Object.values(os.networkInterfaces()).flat().filter((a) => !a.internal).map((a) => a.address);

/// A STUN server that answers a binding request with the address it came
/// from (XOR-MAPPED-ADDRESS, RFC 5389).
const stun = (host) => new Promise((resolve) => {
  const socket = dgram.createSocket("udp4");
  socket.on("message", (message, from) => {
    if (message.length < 20 || message.readUInt16BE(0) !== 0x0001) return;
    const response = Buffer.alloc(32);
    response.writeUInt16BE(0x0101, 0);
    response.writeUInt16BE(12, 2);
    message.copy(response, 4, 4, 20);
    response.writeUInt16BE(0x0020, 20);
    response.writeUInt16BE(8, 22);
    response.writeUInt8(0, 24);
    response.writeUInt8(1, 25);
    response.writeUInt16BE(from.port ^ 0x2112, 26);
    const ip = from.address.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
    response.writeUInt32BE((ip ^ 0x2112a442) >>> 0, 28);
    socket.send(response, from.port, from.address);
  });
  socket.bind(0, host, () => resolve(socket));
});

const GATHER = (servers) => `(async () => {
  const pc = new RTCPeerConnection({ iceServers: ${JSON.stringify(servers)} });
  pc.createDataChannel("probe");
  const found = [];
  const done = new Promise((resolve) => {
    pc.onicecandidate = (event) => { if (event.candidate && event.candidate.candidate) found.push(event.candidate.candidate); else if (!event.candidate) resolve(); };
    setTimeout(resolve, 6000);
  });
  await pc.setLocalDescription(await pc.createOffer());
  await done;
  const sdp = pc.localDescription ? pc.localDescription.sdp : "";
  pc.close();
  return { candidates: found, sdpAddresses: (sdp.match(/^a=candidate:.*$/gm) || []).length, cLine: (sdp.match(/^c=IN IP[46] (\\S+)/m) || [])[1] || null };
})()`;

(async () => {
  const host = OWN.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || "127.0.0.1";
  const server = await stun(host);
  const stunUrl = `stun:${host}:${server.address().port}`;
  const web = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>webrtc</title><p>webrtc</p>");
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${web.address().port}/`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-webrtc-"));
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
  await sleep(2500);
  const inTab = (code) => main((electron, source) => global.noorTest.browser.selected.webContents.executeJavaScript(source, true), code);
  const result = {
    build: BUILD,
    own: OWN,
    noServer: await inTab(GATHER([])),
    withStun: await inTab(GATHER([{ urls: stunUrl }])),
  };
  // The same page in a second profile, and in a private tab: the names
  // they get for this computer must not be the first profile's.
  await main(() => global.noorTest.browser.createProfile("Second"));
  await sleep(1500);
  await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
  await sleep(2500);
  result.secondProfile = await inTab(GATHER([]));
  await main((electron, url) => { global.noorTest.browser.newTab({ url, isPrivate: true }); }, base);
  await sleep(2500);
  result.privateTab = await inTab(GATHER([]));
  await app.close().catch(() => {});
  server.close();
  web.close();
  const addressOf = (candidate) => candidate.split(" ")[4];
  const raw = (list) => list.filter((c) => / typ host /.test(c)).map(addressOf).filter((a) => !/\.local$/.test(a));
  result.rawHost = [...new Set(raw(result.noServer.candidates).concat(raw(result.withStun.candidates)))];
  result.srflx = [...new Set(result.withStun.candidates.filter((c) => / typ srflx /.test(c)).map(addressOf))];
  const names = (list) => list.map(addressOf).filter((a) => /\.local$/.test(a));
  result.mdns = { first: names(result.noServer.candidates), second: names(result.secondProfile.candidates), private: names(result.privateTab.candidates) };
  result.sharedName = result.mdns.first.some((name) => result.mdns.second.includes(name) || result.mdns.private.includes(name));
  result.leak = result.rawHost.length > 0 || result.sharedName;
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.leak ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
