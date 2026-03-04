// Run once: node generate-keys.js
// Outputs:
//   private.key.b64  — set as JWT_PRIVATE_KEY secret in Cloudflare
//   public.key.pem   — paste into src-tauri/src/license.rs
//
// Keep private.key.b64 SECRET. Never commit it.

const { generateKeyPairSync } = require("crypto");
const fs = require("fs");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "der" },
});

// Private key as base64 (what Cloudflare secret expects)
const privateB64 = Buffer.from(privateKey).toString("base64");
fs.writeFileSync("private.key.b64", privateB64);

// Public key PEM (what goes in the Rust app)
fs.writeFileSync("public.key.pem", publicKey);

console.log("✓ private.key.b64  — add to Cloudflare: wrangler secret put JWT_PRIVATE_KEY");
console.log("✓ public.key.pem   — paste into src-tauri/src/license.rs PUBLIC_KEY constant");
console.log("");
console.log("NEVER commit private.key.b64");
