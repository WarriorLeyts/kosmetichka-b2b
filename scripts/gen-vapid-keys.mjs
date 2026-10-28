// Prints new VAPID keys for browser Web Push in .env format:
//   node scripts/gen-vapid-keys.mjs >> .env
import crypto from "node:crypto";

const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
console.log(`WEB_PUSH_PUBLIC_KEY=${ecdh.getPublicKey().toString("base64url")}`);
const d = ecdh.getPrivateKey();
const d32 = Buffer.concat([Buffer.alloc(32 - d.length), d]); // keep exactly 32 bytes
console.log(`WEB_PUSH_PRIVATE_KEY=${d32.toString("base64url")}`);
console.log("WEB_PUSH_SUBJECT=mailto:noreply@kosmetichka-opt.ru");
