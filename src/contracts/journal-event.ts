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

/**
 * Cross-chain causal pointer (agp-eva.1.2 · 058-AT-ADR · iel-25a.4 governed-judgment
 * Layer 1). One governed run writes two hash chains — this AGP journal ("what it did")
 * and the GSB receipt chain ("what it knew"). These fields bind the two so
 * "what did the agent KNOW when it acted X?" is answerable.
 *
 * UNLIKE the reserved future fields above, these are ACTIVE fields populated at
 * decision time: `correlation_id` whenever the event belongs to a governed run
 * (the shared id from `TriggerEvent.correlationId`, 056-AT-CONT), and
 * `gsb_receipt_tip_hash` whenever a GSB brain read grounded the action. They live
 * inside the hashed+signed canonical bytes (the verifier hashes the event sans
 * `hash`+`signature`), so the pointer is SIGNED-IN — not merely embedded — which is
 * the 109-AT-DECR CISO binding (forging a fake parent lineage must break the
 * signature, cost > 0). Present from the first commit; `null` when no correlation
 * or no brain read applies (append-only journal cannot be retrofitted).
 */
export const CrossChainPointer = z.object({
  /** Shared id linking this entry to its trigger run + GSB receipt; null for uncorrelated (genesis/admin) events. */
  correlation_id: z.string().min(1).nullable().default(null),
  /** GSB receipt-chain tip-hash observed at decision time; null when no brain read grounded this action. */
  gsb_receipt_tip_hash: Sha256Hex.nullable().default(null),
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
  .merge(CrossChainPointer)
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

/** The cross-chain pointer field names — active fields, distinct from the reserved lock. */
export const CROSS_CHAIN_FIELD_NAMES = ["correlation_id", "gsb_receipt_tip_hash"] as const;
