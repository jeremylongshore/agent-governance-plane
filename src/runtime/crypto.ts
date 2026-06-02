// Cryptographic primitives for the reference journal: canonical JSON, SHA-256
// hash chaining, and Ed25519 signing/verification. Uses node:crypto (available
// under Bun). These back the RefJournal; the production journal epic (agp-qn7)
// may harden the surface but must keep the same canonical-bytes/verify contract.

import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createPublicKey,
  createPrivateKey,
  type KeyObject,
} from "node:crypto";

/**
 * Deterministic JSON: object keys sorted recursively so the same logical value
 * always serializes to the same bytes (required for stable hashing/signing).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex of a string. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Ed25519 sign → base64 of the 64-byte signature. */
export function signEd25519(message: string, privateKey: KeyObject): string {
  return edSign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");
}

/** Verify a base64 Ed25519 signature over `message`. */
export function verifyEd25519(message: string, signatureB64: string, publicKey: KeyObject): boolean {
  try {
    return edVerify(null, Buffer.from(message, "utf8"), publicKey, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Generate a new Ed25519 keypair as PKCS8 / SPKI PEM strings. */
export function generateSigningKeyPem(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey(pem);
}

export function publicKeyFromPrivate(privateKey: KeyObject): KeyObject {
  return createPublicKey(privateKey);
}

export function loadPublicKey(pem: string): KeyObject {
  return createPublicKey(pem);
}
