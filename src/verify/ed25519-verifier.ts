// Ed25519Verifier — the v0 supply-chain verification backend (agp-z26.3).
// Design: 000-docs/043-AT-ADR-intendant-identity-and-supply-chain-verification-2026-06-21.md.
//
// Offline, no new dependency: it reuses the Ed25519 primitives in
// src/runtime/crypto.ts. An intendant author signs a canonical-JSON manifest with
// their key; the verifier checks the detached base64 signature against an
// operator-trusted public key and, on success, MINTS the identity URI
// `agp-intendant:ed25519/<name>@<version>/<fingerprint>` (fingerprint = first 16
// hex of sha256(SPKI-PEM of the verifying key)). Self-describing — no registry
// needed at v0. Never throws for an untrusted artifact: it returns a verdict.
// The v0.6 Sigstore backend implements the same Verifier interface.

import { existsSync, readFileSync } from "node:fs";
import type { KeyObject } from "node:crypto";
import { IntendantManifest } from "../contracts/intendant-manifest.ts";
import type { Verifier, VerifyResult } from "../contracts/verifier.ts";
import { canonicalJson, loadPublicKey, sha256Hex, signEd25519, verifyEd25519 } from "../runtime/crypto.ts";

/** First 16 hex of sha256 over the key's SPKI PEM — the URI fingerprint. */
export function ed25519Fingerprint(publicKey: KeyObject): string {
  const spkiPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return sha256Hex(spkiPem).slice(0, 16);
}

/** Build the v0 intendant identity URI. */
export function intendantEd25519Uri(name: string, version: string, fingerprint: string): string {
  return `agp-intendant:ed25519/${name}@${version}/${fingerprint}`;
}

/** Sign a manifest for an intendant author / tests: base64 detached signature
 *  over canonicalJson(manifest). The manifest is schema-validated first. */
export function signManifest(manifest: IntendantManifest, privateKey: KeyObject): string {
  return signEd25519(canonicalJson(IntendantManifest.parse(manifest)), privateKey);
}

const ED25519_SIG_BYTES = 64;

export class Ed25519Verifier implements Verifier {
  readonly scheme = "ed25519";
  private readonly trustedKeys: readonly KeyObject[];

  /** @param trustedKeys operator-trusted intendant-author public keys. Empty ⇒
   *  every artifact fails closed with "unknown-key" (no trust anchor). */
  constructor(trustedKeys: readonly KeyObject[]) {
    this.trustedKeys = trustedKeys;
  }

  verify(manifest: IntendantManifest, signatureB64: string): Promise<VerifyResult> {
    const parsed = IntendantManifest.safeParse(manifest);
    if (!parsed.success) return Promise.resolve({ ok: false, reason: "malformed-manifest" });

    if (Buffer.from(signatureB64, "base64").length !== ED25519_SIG_BYTES) {
      return Promise.resolve({ ok: false, reason: "malformed-signature" });
    }

    if (this.trustedKeys.length === 0) return Promise.resolve({ ok: false, reason: "unknown-key" });

    const bytes = canonicalJson(parsed.data);
    for (const key of this.trustedKeys) {
      if (verifyEd25519(bytes, signatureB64, key)) {
        const uri = intendantEd25519Uri(parsed.data.name, parsed.data.version, ed25519Fingerprint(key));
        return Promise.resolve({ ok: true, identity: { name: parsed.data.name, version: parsed.data.version, uri } });
      }
    }
    return Promise.resolve({ ok: false, reason: "bad-signature" });
  }
}

/**
 * Build an Ed25519Verifier from a trusted public-key PEM file (default the
 * operator's intendant trust anchor). A missing file ⇒ an empty trust set, so the
 * verifier fails closed rather than trusting everything. (Daemon wiring of the
 * default path lands in agp-z26.4.)
 */
export function loadEd25519Verifier(publicKeyPath: string): Ed25519Verifier {
  if (!existsSync(publicKeyPath)) return new Ed25519Verifier([]);
  try {
    return new Ed25519Verifier([loadPublicKey(readFileSync(publicKeyPath, "utf8"))]);
  } catch {
    // A malformed key file must not crash the daemon; fail closed (no trust).
    return new Ed25519Verifier([]);
  }
}
