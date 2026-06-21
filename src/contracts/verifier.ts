// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See
// 000-docs/043-AT-ADR-intendant-identity-and-supply-chain-verification-2026-06-21.md.
//
// Verifier — the single pluggable supply-chain verification seam. An Ed25519
// backend implements it at v0 (offline, src/runtime/crypto.ts); a Sigstore
// backend implements the SAME interface at v0.6 with zero caller changes. The
// verifier MINTS the identity URI on success, so an unverified/self-asserted
// identity can never reach the journal as if it were verified.

import type { IntendantIdentity } from "./intendant-adapter.ts";
import type { IntendantManifest } from "./intendant-manifest.ts";

/** Why a verification failed — never throws for an untrusted artifact. */
export type VerifyFailureReason =
  | "bad-signature" // signature did not verify against the trusted key
  | "unknown-key" // no trusted verifying key available / key mismatch
  | "malformed-manifest" // manifest failed schema validation
  | "malformed-signature"; // signature was not decodable / wrong length

/** A verification verdict: ok carries the verifier-minted identity (uri populated). */
export type VerifyResult =
  | { ok: true; identity: IntendantIdentity }
  | { ok: false; reason: VerifyFailureReason };

export interface Verifier {
  /** The scheme this backend speaks ("ed25519" at v0, "sigstore" at v0.6). */
  readonly scheme: string;
  /** Verify a detached base64 signature over canonicalJson(manifest). Returns a
   *  verdict; NEVER throws for an untrusted artifact. */
  verify(manifest: IntendantManifest, signatureB64: string): Promise<VerifyResult>;
}
