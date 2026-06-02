import { test, expect } from "bun:test";
import { PolicyVerdict } from "./policy-verdict.ts";
import { validAllowVerdict, validRequireVerdict } from "./fixtures.ts";

test("an allow verdict parses", () => {
  expect(PolicyVerdict.parse(validAllowVerdict)).toEqual(validAllowVerdict);
});

test("a require verdict that names its rule parses", () => {
  expect(PolicyVerdict.parse(validRequireVerdict)).toEqual(validRequireVerdict);
});

test("a 'require' verdict without a ruleId is rejected (fail-closed invariant)", () => {
  const res = PolicyVerdict.safeParse({ ...validRequireVerdict, ruleId: null });
  expect(res.success).toBe(false);
});

test("an unknown decision is rejected", () => {
  expect(PolicyVerdict.safeParse({ ...validAllowVerdict, decision: "maybe" }).success).toBe(false);
});

test("ruleId and tier default to null for a no-rule-matched allow", () => {
  const parsed = PolicyVerdict.parse({ decision: "allow", reason: "default" });
  expect(parsed.ruleId).toBeNull();
  expect(parsed.tier).toBeNull();
});
