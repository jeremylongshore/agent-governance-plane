// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See
// 000-docs/043-AT-ADR-intendant-identity-and-supply-chain-verification-2026-06-21.md.
//
// IntendantManifest — the canonical-JSON document an intendant author signs. The
// verifier checks a detached signature over canonicalJson(manifest) against a
// trusted key and, on success, mints the IntendantIdentity URI. Fields mirror the
// identity-bearing fields of IntendantIdentity; the pubkey fingerprint in the URI
// comes from the verifying key, not the manifest, so the manifest stays minimal.

import { z } from "zod";

export const IntendantManifest = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

export type IntendantManifest = z.infer<typeof IntendantManifest>;
