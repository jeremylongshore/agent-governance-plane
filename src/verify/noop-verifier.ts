// NoopVerifier — the fail-closed stand-in when no real verifier is configured
// (agp-z26.2). It trusts nothing: every artifact fails with "unknown-key" (no
// trusted verifying key is present). This is the safe default for the daemon's
// warn/enforce modes before a backend is wired, and the deterministic test seam.
// The real Ed25519 backend (agp-z26.3) implements the same Verifier interface.

import type { Verifier, VerifyResult } from "../contracts/verifier.ts";
import type { IntendantManifest } from "../contracts/intendant-manifest.ts";

export class NoopVerifier implements Verifier {
  readonly scheme = "noop";
  verify(_manifest: IntendantManifest, _signatureB64: string): Promise<VerifyResult> {
    return Promise.resolve({ ok: false, reason: "unknown-key" });
  }
}
