import { test, expect } from "bun:test";
import { CROSS_CHAIN_FIELD_NAMES, JournalEvent, RESERVED_FIELD_NAMES } from "./journal-event.ts";
import { validJournalEvent } from "./fixtures.ts";

test("a valid v0 signed journal event parses unchanged", () => {
  expect(JournalEvent.parse(validJournalEvent)).toEqual(validJournalEvent);
});

test("reserves all five future fields, present and null at v0 (council lock)", () => {
  const parsed = JournalEvent.parse(validJournalEvent) as Record<string, unknown>;
  for (const field of RESERVED_FIELD_NAMES) {
    expect(Object.hasOwn(parsed, field)).toBe(true);
    expect(parsed[field]).toBeNull();
  }
  expect(RESERVED_FIELD_NAMES).toEqual([
    "tenant_id",
    "signing_key_id",
    "approval_binding_type",
    "intendant_identity_uri",
    "on_behalf_of",
  ]);
});

test("on_behalf_of (the principal slot) is reserved and null at v0 (board review agp-dxp)", () => {
  // The accountability principal — "Claude acting on behalf of <human>". Reserved
  // now because the signed journal is append-only and cannot be retrofitted.
  const parsed = JournalEvent.parse(validJournalEvent) as Record<string, unknown>;
  expect(Object.hasOwn(parsed, "on_behalf_of")).toBe(true);
  expect(parsed.on_behalf_of).toBeNull();
  // Populating it is additive and accepted by the strict schema (forward-compat).
  expect(JournalEvent.safeParse({ ...validJournalEvent, on_behalf_of: "U_ALICE" }).success).toBe(true);
});

test("reserved fields default to null when omitted (forward-compatible slot)", () => {
  const {
    tenant_id,
    signing_key_id,
    approval_binding_type,
    intendant_identity_uri,
    on_behalf_of,
    ...withoutReserved
  } = validJournalEvent;
  void tenant_id;
  void signing_key_id;
  void approval_binding_type;
  void intendant_identity_uri;
  void on_behalf_of;
  const parsed = JournalEvent.parse(withoutReserved) as Record<string, unknown>;
  for (const field of RESERVED_FIELD_NAMES) {
    expect(parsed[field]).toBeNull();
  }
});

test("carries the cross-chain causal pointer fields, present and null by default (agp-eva.1.2)", () => {
  const parsed = JournalEvent.parse(validJournalEvent) as Record<string, unknown>;
  for (const field of CROSS_CHAIN_FIELD_NAMES) {
    expect(Object.hasOwn(parsed, field)).toBe(true);
    expect(parsed[field]).toBeNull();
  }
  expect(CROSS_CHAIN_FIELD_NAMES).toEqual(["correlation_id", "gsb_receipt_tip_hash"]);
});

test("cross-chain fields are ACTIVE, distinct from the reserved lock", () => {
  // They default null like reserved fields, but they are NOT reserved — they are
  // populated at decision time, so they must not leak into the reserved lock list.
  for (const field of CROSS_CHAIN_FIELD_NAMES) {
    expect(RESERVED_FIELD_NAMES).not.toContain(field);
  }
});

test("cross-chain fields default to null when omitted (forward-compatible slot)", () => {
  const { correlation_id, gsb_receipt_tip_hash, ...without } = validJournalEvent;
  void correlation_id;
  void gsb_receipt_tip_hash;
  const parsed = JournalEvent.parse(without) as Record<string, unknown>;
  expect(parsed.correlation_id).toBeNull();
  expect(parsed.gsb_receipt_tip_hash).toBeNull();
});

test("populating the cross-chain pointer is accepted; malformed values are rejected", () => {
  expect(
    JournalEvent.safeParse({ ...validJournalEvent, correlation_id: "run-1", gsb_receipt_tip_hash: "a".repeat(64) }).success,
  ).toBe(true);
  // an empty correlation id is not a valid id (min 1) — null means "uncorrelated", "" is malformed
  expect(JournalEvent.safeParse({ ...validJournalEvent, correlation_id: "" }).success).toBe(false);
  // the GSB tip must be a real sha256, never an arbitrary string
  expect(JournalEvent.safeParse({ ...validJournalEvent, gsb_receipt_tip_hash: "not-a-hash" }).success).toBe(false);
});

test("rejects a malformed hash", () => {
  expect(JournalEvent.safeParse({ ...validJournalEvent, hash: "not-a-hash" }).success).toBe(false);
});

test("rejects a v1 (unsigned) event — v0 requires signed v2", () => {
  expect(JournalEvent.safeParse({ ...validJournalEvent, v: 1 }).success).toBe(false);
});

test("rejects an event without a signature", () => {
  const { signature, ...unsigned } = validJournalEvent;
  void signature;
  expect(JournalEvent.safeParse(unsigned).success).toBe(false);
});

test("rejects unknown fields (strict schema)", () => {
  expect(JournalEvent.safeParse({ ...validJournalEvent, rogue: 1 }).success).toBe(false);
});

test("genesis event may have a null prevHash; non-genesis must be a hash", () => {
  expect(JournalEvent.safeParse({ ...validJournalEvent, prevHash: null }).success).toBe(true);
  expect(JournalEvent.safeParse({ ...validJournalEvent, prevHash: "short" }).success).toBe(false);
});
