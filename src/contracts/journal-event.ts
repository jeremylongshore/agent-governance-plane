// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See 000-docs/013-AT-CONT-journal-event.md.
//
// JournalEvent — one record in AGP's authoritative, hash-chained, Ed25519-signed
// audit journal. Aligned with the CCSC `journal.ts` substrate (v2 signed events).
//
// COUNCIL NON-NEGOTIABLE (AT-DECR Q4, CISO-locked): the four future fields
// (tenant_id, signing_key_id, approval_binding_type, intendant_identity_uri) are
// reserved in the schema from the first commit and are `null` at v0. Reserving
// them now means populating them later is NOT a breaking change.

import { z } from "zod";
import { Actor, Ed25519SignatureB64, IsoTimestamp, Sha256Hex } from "./_common.ts";

/** Schema version. v0 emits signed v2 events (matching the CCSC substrate). */
export const JournalEventVersion = z.literal(2);

/** Reserved-future fields. Present from the first commit; null at v0. */
export const ReservedFutureFields = z.object({
  /** Multi-tenant id — null until v0.1 multi-tenant gate() lands. */
  tenant_id: z.string().nullable().default(null),
  /** Per-tenant signing key id — null until per-tenant KMS lands. */
  signing_key_id: z.string().nullable().default(null),
  /** How an approval was bound (nonce / WebAuthn) — null until binding lands. */
  approval_binding_type: z.string().nullable().default(null),
  /** Intendant identity URI (Sigstore) — null until intendant identity lands (v0.6). */
  intendant_identity_uri: z.string().nullable().default(null),
});

export const JournalEvent = z
  .object({
    v: JournalEventVersion,
    /** Monotonic sequence, starts at 1 on the first event. */
    seq: z.number().int().positive(),
    ts: IsoTimestamp,
    /** SHA-256 of the prior event's canonical bytes; null only for the genesis event. */
    prevHash: Sha256Hex.nullable(),
    /** SHA-256 over `prevHash || canonicalJson(event sans hash and signature)`. */
    hash: Sha256Hex,
    /** Event kind, e.g. "tool_call.allow", "tool_call.deny", "approval.granted". */
    kind: z.string().min(1),
    actor: Actor,
    /** Redacted, structured payload for this event. */
    payload: z.record(z.string(), z.unknown()),
    /** Ed25519 signature over the canonical bytes covered by `hash`. */
    signature: Ed25519SignatureB64,
  })
  .merge(ReservedFutureFields)
  .strict();

export type JournalEvent = z.infer<typeof JournalEvent>;

/** The four reserved field names, for tests/tools that assert the lock. */
export const RESERVED_FIELD_NAMES = [
  "tenant_id",
  "signing_key_id",
  "approval_binding_type",
  "intendant_identity_uri",
] as const;
