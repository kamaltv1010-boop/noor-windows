"use strict";
// Makes .crx files of a folder, as the Chrome Web Store does (format 3,
// signed with RSA-SHA256) or as old Chrome did (format 2), for the tests.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const varint = (n) => {
  const bytes = [];
  while (n > 127) {
    bytes.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  bytes.push(n);
  return Buffer.from(bytes);
};
const field = (number, bytes) => Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
const uint32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
};

/// The zip of a folder, with `changes` (file name → text) applied.
const zipOf = (dir, changes = {}) => {
  const zip = new AdmZip();
  const add = (folder, prefix) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      const name = prefix + entry.name;
      if (entry.isDirectory()) {
        add(full, name + "/");
      } else if (!(name in changes)) {
        zip.addFile(name, fs.readFileSync(full));
      }
    }
  };
  add(dir, "");
  for (const [name, text] of Object.entries(changes)) {
    zip.addFile(name, Buffer.from(text));
  }
  return zip.toBuffer();
};

const newKey = () => crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

const idOf = (publicDer) => crypto.createHash("sha256").update(publicDer).digest("hex").slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

/// A format 3 .crx of `zip`, signed with `keys` (a key pair).
const crx3 = (zip, keys = newKey()) => {
  const publicDer = keys.publicKey.export({ type: "spki", format: "der" });
  const crxId = crypto.createHash("sha256").update(publicDer).digest().subarray(0, 16);
  const signedData = field(1, crxId);
  const signature = crypto.sign("sha256", Buffer.concat([Buffer.from("CRX3 SignedData\x00", "latin1"), uint32(signedData.length), signedData, zip]), keys.privateKey);
  const header = Buffer.concat([field(2, Buffer.concat([field(1, publicDer), field(2, signature)])), field(10000, signedData)]);
  return { data: Buffer.concat([Buffer.from("Cr24"), uint32(3), uint32(header.length), header, zip]), id: idOf(publicDer), publicDer };
};

/// A format 2 .crx of `zip`.
const crx2 = (zip, keys = newKey()) => {
  const publicDer = keys.publicKey.export({ type: "spki", format: "der" });
  const signature = crypto.sign("sha1", zip, keys.privateKey);
  return { data: Buffer.concat([Buffer.from("Cr24"), uint32(2), uint32(publicDer.length), uint32(signature.length), publicDer, signature, zip]), id: idOf(publicDer), publicDer };
};

module.exports = { zipOf, newKey, crx3, crx2, idOf };
