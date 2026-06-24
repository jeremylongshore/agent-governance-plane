// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See 000-docs/013-AT-CONT-journal-event.md.
//
// JournalEvent — one record in AGP's authoritative, hash-chained, Ed25519-signed
// audit journal. Aligned with the CCSC `journal.ts` substrate (v2 signed events).
//
// COUNCIL NON-NEGOTIABLE (AT-DECR Q4, CISO-locked): the future fields
// (tenant_id, signing_key_id, approval_binding_type, intendant_identity_uri,
// on_behalf_of) are reserved in the schema from the first commit and are `null`
// at v0. Reserving them now means populating them later is NOT a breaking change.
// `on_behalf_of` was added per the thinker-canon board review of the authority
// model (agp-dxp / issue #115, 000-docs/052-AR-BORD): the signed journal is the
// only irreversible artifact, so the principal slot is reserved before the
// multi-tenant authority model lands.

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
  /**
   * The human principal on whose authority this action runs — "Claude acting on
   * behalf of <human>". Null until the multi-tenant authority model lands
   * (agp-dxp). ACCOUNTABILITY DATA ONLY: this records *who*, and MUST NOT be
   * read to make an authorization decision (doing so re-complects accountability
   * with authority — Hickey's guardrail, board review 000-docs/052-AR-BORD).
   */
  on_behalf_of: z.string().nullable().default(null),
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

/** The reserved field names, for tests/tools that assert the lock. */
export const RESERVED_FIELD_NAMES = [
  "tenant_id",
  "signing_key_id",
  "approval_binding_type",
  "intendant_identity_uri",
  "on_behalf_of",
] as const;
