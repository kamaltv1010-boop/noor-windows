// What a page drew with WebGL itself (a shader's gradient: how this
// computer's graphics draw it is a fingerprint), read back every way a page
// can, with the WebGL protection on and off: readPixels (WebGL and WebGL2,
// all of it and a part), from a framebuffer of its own, toDataURL, toBlob,
// drawn on a 2D canvas, an image bitmap of it, a VideoFrame of it, uploaded
// to another WebGL; and in a worker (OffscreenCanvas). A way that reads the
// same with the protection on as off hands a site the real drawing: counted.
// Two ways are known not to be covered, and are only noted: WebGL2's
// readPixels into a PIXEL_PACK_BUFFER (read with getBufferSubData), and a
// float framebuffer read as floats. Sites that compute on the graphics card
// (TensorFlow.js, a photo editor's background removal) read their results
// that way; noise there would change their results. The same holds for a
// read in another format the browser allows (IMPLEMENTATION_COLOR_READ_*),
// noted when it isn't RGBA bytes.
// Prints each way's hash; exits 1 if a covered way reads the real drawing,
// or fails only with the protection.
// Needs Playwright and a display:
// `xvfb-run -a node tools/probe-webgl-reads.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SIZE = 64;

const COMMON = `
const SIZE = ${SIZE};
const fnv = (bytes) => { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const ways = {};
const tried = async (name, fn) => { try { ways[name] = await fn(); } catch (e) { ways[name] = "ERR " + e.name + ": " + e.message; } };
const VS2 = "#version 300 es\\nin vec2 p; out vec2 v; void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }";
const FS2 = "#version 300 es\\nprecision highp float; in vec2 v; out vec4 o; void main() { o = vec4(sin(v.x * 7.3) * 0.5 + 0.5, cos(v.y * 5.1) * 0.5 + 0.5, fract(v.x * v.y * 13.7), 1.0); }";
const VS1 = "attribute vec2 p; varying vec2 v; void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }";
const FS1 = "precision highp float; varying vec2 v; void main() { gl_FragColor = vec4(sin(v.x * 7.3) * 0.5 + 0.5, cos(v.y * 5.1) * 0.5 + 0.5, fract(v.x * v.y * 13.7), 1.0); }";
// Draws the gradient with WebGL (version 1 or 2) on the canvas, or into a
// framebuffer of the context's own (a texture, RGBA bytes or floats).
const drawOn = (canvas, version, target) => {
  const gl = canvas.getContext(version === 2 ? "webgl2" : "webgl", { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error("no WebGL " + version);
  if (target) {
    if (target === "float" && !gl.getExtension("EXT_color_buffer_float")) throw new Error("no EXT_color_buffer_float");
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, target === "float" ? gl.RGBA32F : gl.RGBA8, SIZE, SIZE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  }
  const shader = (type, text) => { const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s); return s; };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, version === 2 ? VS2 : VS1));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, version === 2 ? FS2 : FS1));
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 0, 1, -1, 1, 1, 1, 0, -1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, SIZE, SIZE);
  gl.clearColor(0.1, 0.2, 0.3, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  return gl;
};
const pixels = (gl, x = 0, y = 0, w = SIZE, h = SIZE) => { const px = new Uint8Array(w * h * 4); gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return fnv(px); };
`;

const PAGE = `<!doctype html><title>webgl reads</title><body><script>
${COMMON}
const canvas = () => Object.assign(document.createElement("canvas"), { width: SIZE, height: SIZE });
const drawn = (version = 2) => { const c = canvas(); drawOn(c, version); return c; };
const pixelsOf = (source) => { const c = canvas(); const x = c.getContext("2d"); x.drawImage(source, 0, 0); return fnv(x.getImageData(0, 0, SIZE, SIZE).data); };
(async () => {
  await tried("WebGL readPixels", () => pixels(drawOn(canvas(), 1)));
  await tried("WebGL2 readPixels", () => pixels(drawOn(canvas(), 2)));
  await tried("WebGL2 readPixels, a part", () => pixels(drawOn(canvas(), 2), 8, 8, 48, 48));
  await tried("WebGL2 readPixels, its framebuffer", () => pixels(drawOn(canvas(), 2, "bytes")));
  await tried("toDataURL", () => fnv(new TextEncoder().encode(drawn().toDataURL())));
  await tried("toBlob", () => new Promise((r) => drawn().toBlob(async (b) => r(fnv(new Uint8Array(await b.arrayBuffer()))))));
  await tried("drawn on a 2D canvas", () => pixelsOf(drawn()));
  await tried("an image bitmap of it, drawn", async () => pixelsOf(await createImageBitmap(drawn())));
  if (typeof VideoFrame === "function") await tried("a VideoFrame of it, copyTo", async () => { const f = new VideoFrame(drawn(), { timestamp: 0 }); const buf = new Uint8Array(f.allocationSize({ format: "RGBA" })); await f.copyTo(buf, { format: "RGBA" }); f.close(); return fnv(buf); });
  await tried("uploaded to another WebGL, readPixels", () => { const g = canvas().getContext("webgl"); const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, drawn()); const fb = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, fb); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t, 0); return pixels(g); });
  // Not covered (see the top of tools/probe-webgl-reads.js).
  await tried("KNOWN: a PIXEL_PACK_BUFFER, getBufferSubData", () => { const gl = drawOn(canvas(), 2); const b = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b); gl.bufferData(gl.PIXEL_PACK_BUFFER, SIZE * SIZE * 4, gl.STREAM_READ); gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, 0); const px = new Uint8Array(SIZE * SIZE * 4); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px); return fnv(px); });
  await tried("KNOWN: a float framebuffer, as floats", () => { const gl = drawOn(canvas(), 2, "float"); const f = new Float32Array(SIZE * SIZE * 4); gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.FLOAT, f); return fnv(new Uint8Array(f.buffer)); });
  await tried("KNOWN: the browser's other read format", () => { const gl = drawOn(canvas(), 2); const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT); const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE); if (format === gl.RGBA && type === gl.UNSIGNED_BYTE) return "SAME AS RGBA BYTES"; const px = new Uint8Array(SIZE * SIZE * 4); gl.readPixels(0, 0, SIZE, SIZE, format, type, px); return fnv(px); });
  await tried("in a worker", () => new Promise((resolve) => { const w = new Worker("/worker.js"); w.onmessage = (e) => resolve(e.data); w.onerror = (e) => resolve("ERR worker " + e.message); setTimeout(() => resolve("ERR timeout"), 10000); }));
  window.__ways = ways;
})();
</script>`;
const WORKER = `${COMMON}
(async () => {
  const canvas = () => new OffscreenCanvas(SIZE, SIZE);
  await tried("WebGL2 readPixels", () => pixels(drawOn(canvas(), 2)));
  await tried("convertToBlob", async () => { const o = canvas(); drawOn(o, 2); return fnv(new Uint8Array(await (await o.convertToBlob()).arrayBuffer())); });
  postMessage(ways);
})();`;

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("cache-control", "no-store");
    if (req.url.startsWith("/worker.js")) { res.setHeader("content-type", "text/javascript"); return res.end(WORKER); }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://webgl.localhost:${server.address().port}/`;
  const visit = async (settings) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-webglreads-"));
    if (settings) fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
    const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD };
    const app = await electron.launch({ executablePath: require(path.join(root, "node_modules", "electron")), args: [root, "--no-sandbox", "--enable-unsafe-swiftshader"], env });
    for (let i = 0; i < 200; i++) {
      if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(1000);
    const ways = await app.evaluate(async (electron, address) => {
      const tab = global.noorTest.browser.newTab({ url: address });
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const done = await tab.webContents.executeJavaScript("window.__ways || null").catch(() => null);
        if (done) return done;
      }
      return { error: "no answer" };
    }, url);
    await app.close().catch(() => {});
    return ways;
  };
  const on = await visit(null);
  const off = await visit({ "protection.canvas": false, "protection.webGL": false });
  server.close();

  const flat = (ways) => {
    const out = {};
    for (const [name, value] of Object.entries(ways || {})) {
      if (value && typeof value === "object") for (const [inner, v] of Object.entries(value)) out[`${name}: ${inner}`] = v;
      else out[name] = value;
    }
    return out;
  };
  const a = flat(on);
  const b = flat(off);
  const problems = [];
  if (on.error || off.error) problems.push(`no answer (${on.error || off.error})`);
  let covered = 0;
  for (const name of Object.keys(a)) {
    const mine = String(a[name]);
    const real = String(b[name]);
    const known = /^KNOWN: /.test(name);
    let verdict = "protected";
    if (/^ERR/.test(mine)) {
      verdict = /^ERR/.test(real) ? "fails as without the protection" : "FAILS ONLY WITH THE PROTECTION";
      if (!/^ERR/.test(real)) problems.push(`${name}: ${mine}`);
    } else if (mine === "SAME AS RGBA BYTES") {
      verdict = "RGBA bytes only (covered)";
    } else if (mine === real) {
      verdict = known ? "the real drawing (not covered)" : "THE REAL DRAWING";
      if (!known) problems.push(`${name} reads the real drawing (${mine})`);
    }
    if (!known && !/^ERR/.test(mine)) covered++;
    const line = `${verdict.padEnd(32)} ${name.padEnd(48)} on ${mine.slice(0, 50)} | off ${real.slice(0, 30)}`;
    console.log(known ? `note ${line}` : line);
  }
  // The check itself: the covered ways ran.
  if (covered < 8) problems.push(`only ${covered} covered ways ran: the check didn't`);
  console.log(problems.length ? `WEBGL READS: ${problems.length} PROBLEM(S): ${problems.join(" | ")}` : `WEBGL READS: no covered way (${covered}) reads the real drawing`);
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
