import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Journal, readEvents } from "./journal.ts";
import { reconstructGovernanceTipsAt, reconstructKnowledgeAt } from "./cross-chain.ts";
import { generateSigningKeyPem, loadPrivateKey } from "../runtime/crypto.ts";

const FIXED = () => "2026-07-12T00:00:00.000Z";

function journal(): { dir: string; path: string; j: Journal } {
  const dir = mkdtempSync(join(tmpdir(), "agp-crosschain-"));
  const path = join(dir, "audit.log");
  const j = new Journal(path, loadPrivateKey(generateSigningKeyPem().privateKeyPem), FIXED);
  return { dir, path, j };
}

// The projection proves which global governance tips were stamped into the AGP
// actions. It deliberately makes no exact read-set or causal claim.
test("projects a run's actions + the governance tips stamped at each decision", () => {
  const { dir, path, j } = journal();
  j.append({ kind: "tool_call.allow", actor: "session_owner", payload: { i: 0 }, correlation_id: "run-A", gsb_receipt_tip_hash: "a".repeat(64) });
  j.append({ kind: "tool_call.deny", actor: "session_owner", payload: { i: 1 }, correlation_id: "run-A", gsb_receipt_tip_hash: "b".repeat(64) });
  // interleave an unrelated run to prove correlation-scoping
  j.append({ kind: "tool_call.allow", actor: "session_owner", payload: { i: 2 }, correlation_id: "run-B", gsb_receipt_tip_hash: "c".repeat(64) });

  const run = reconstructGovernanceTipsAt(readEvents(path), "run-A");
  expect(run.correlationId).toBe("run-A");
  expect(run.actions.map((a) => a.kind)).toEqual(["tool_call.allow", "tool_call.deny"]);
  expect(run.actions.map((a) => a.seq)).toEqual([1, 2]);
  expect(run.gsbReceiptTips).toEqual(["a".repeat(64), "b".repeat(64)]);
  rmSync(dir, { recursive: true, force: true });
});

test("dedupes repeated GSB tips first-seen, and null tips do not enter the pointer list", () => {
  const { dir, path, j } = journal();
  const tip = "d".repeat(64);
  j.append({ kind: "e0", actor: "session_owner", payload: {}, correlation_id: "run-C", gsb_receipt_tip_hash: tip });
  j.append({ kind: "e1", actor: "session_owner", payload: {}, correlation_id: "run-C" }); // no brain read → null tip
  j.append({ kind: "e2", actor: "session_owner", payload: {}, correlation_id: "run-C", gsb_receipt_tip_hash: tip });

  const run = reconstructGovernanceTipsAt(readEvents(path), "run-C");
  expect(run.actions).toHaveLength(3);
  expect(run.actions[1]!.gsbReceiptTipHash).toBeNull();
  expect(run.gsbReceiptTips).toEqual([tip]); // deduped; the null is excluded
  rmSync(dir, { recursive: true, force: true });
});

test("an unknown correlation id yields an empty (but well-formed) reconstruction", () => {
  const { dir, path, j } = journal();
  j.append({ kind: "e0", actor: "session_owner", payload: {}, correlation_id: "run-D" });
  const run = reconstructGovernanceTipsAt(readEvents(path), "run-NONE");
  expect(run.actions).toEqual([]);
  expect(run.gsbReceiptTips).toEqual([]);
  rmSync(dir, { recursive: true, force: true });
});

test("fails closed on a malformed (empty or blank) correlation id — not a silently-clean empty result", () => {
  expect(() => reconstructGovernanceTipsAt([], "")).toThrow(/non-empty/);
  expect(() => reconstructGovernanceTipsAt([], "   ")).toThrow(/non-blank/); // whitespace-only is malformed, not a valid run
});

test("keeps reconstructKnowledgeAt as a compatibility alias", () => {
  expect(reconstructKnowledgeAt).toBe(reconstructGovernanceTipsAt);
});
