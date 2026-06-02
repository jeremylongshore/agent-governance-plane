import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RefJournal, verifyJournal, readEvents } from "./journal.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "./crypto.ts";
import type { KeyObject } from "node:crypto";

function setup(): { dir: string; path: string; priv: KeyObject; pub: KeyObject } {
  const dir = mkdtempSync(join(tmpdir(), "agp-jrnl-"));
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  return { dir, path: join(dir, "audit.log"), priv, pub: publicKeyFromPrivate(priv) };
}

const FIXED = () => "2026-06-02T00:00:00.000Z";

test("a freshly written journal verifies (chain + signatures)", () => {
  const { dir, path, priv, pub } = setup();
  const j = new RefJournal(path, priv, FIXED);
  j.append({ kind: "session.started", actor: "session_owner", payload: { sessionId: "s1" } });
  j.append({ kind: "tool_call.allow", actor: "claude_process", payload: { tool: "Read" } });
  const res = verifyJournal(path, pub);
  expect(res.ok).toBe(true);
  expect(res.count).toBe(2);
  expect(res.errors).toEqual([]);
  rmSync(dir, { recursive: true, force: true });
});

test("genesis prevHash is null and each event links to the prior hash", () => {
  const { dir, path, priv } = setup();
  const j = new RefJournal(path, priv, FIXED);
  const e1 = j.append({ kind: "a", actor: "session_owner", payload: {} });
  const e2 = j.append({ kind: "b", actor: "session_owner", payload: {} });
  expect(e1.prevHash).toBeNull();
  expect(e1.seq).toBe(1);
  expect(e2.prevHash).toBe(e1.hash);
  expect(e2.seq).toBe(2);
  rmSync(dir, { recursive: true, force: true });
});

test("tampering with a recorded payload is detected (hash mismatch)", () => {
  const { dir, path, priv, pub } = setup();
  const j = new RefJournal(path, priv, FIXED);
  j.append({ kind: "tool_call.allow", actor: "claude_process", payload: { tool: "Read" } });
  const ev = readEvents(path)[0]!;
  // keep hash + signature, change the payload — the classic forgery attempt
  writeFileSync(path, JSON.stringify({ ...ev, payload: { tool: "Bash" } }) + "\n");
  const res = verifyJournal(path, pub);
  expect(res.ok).toBe(false);
  expect(res.errors.join(" ")).toContain("hash mismatch");
  rmSync(dir, { recursive: true, force: true });
});

test("a journal signed by a different key fails signature verification", () => {
  const { dir, path, priv } = setup();
  new RefJournal(path, priv, FIXED).append({ kind: "a", actor: "session_owner", payload: {} });
  const otherPub = publicKeyFromPrivate(loadPrivateKey(generateSigningKeyPem().privateKeyPem));
  const res = verifyJournal(path, otherPub);
  expect(res.ok).toBe(false);
  expect(res.errors.join(" ")).toContain("signature invalid");
  rmSync(dir, { recursive: true, force: true });
});
