import { test, expect } from "bun:test";
import { JournalEvent, RESERVED_FIELD_NAMES } from "./journal-event.ts";
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
