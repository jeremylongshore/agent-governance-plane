import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { Journal, readEvents } from "./journal.ts";
import { verifyJournalFile } from "./verify.ts";
import { generateSigningKeyPem, loadPrivateKey, loadPublicKey, publicKeyFromPrivate } from "../runtime/crypto.ts";

// agp-pne.2: prove the reserved tenant_id column can be populated later WITHOUT a
// breaking change or a chain fork. This is a migration/bridge test only — the
// daemon does NOT thread tenant_id; every production append still writes null.

const FIXED = () => "2026-06-22T00:00:00.000Z";

function freshJournal(): { dir: string; path: string; journal: Journal; priv: KeyObject } {
  const dir = mkdtempSync(join(tmpdir(), "agp-tid-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  return { dir, path, journal: new Journal(path, priv, FIXED), priv };
}

function verifies(path: string, priv: KeyObject): boolean {
  const pubPem = publicKeyFromPrivate(priv).export({ type: "spki", format: "pem" }).toString();
  return verifyJournalFile(path, loadPublicKey(pubPem)).ok;
}

test("tenant_id omitted records null (v0 default unchanged)", () => {
  const { dir, path, journal } = freshJournal();
  journal.append({ kind: "session.started", actor: "session_owner", payload: { sessionId: "s1" } });
  expect(readEvents(path)[0]!.tenant_id).toBeNull();
  rmSync(dir, { recursive: true, force: true });
});

test("a populated tenant_id round-trips verbatim and the chain + signed head still verify", () => {
  const { dir, path, journal, priv } = freshJournal();
  journal.append({
    kind: "session.started",
    actor: "session_owner",
    payload: { sessionId: "s1" },
    tenant_id: "tenant-acme",
  });
  expect(readEvents(path)[0]!.tenant_id).toBe("tenant-acme");
  expect(verifies(path, priv)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test("a mixed null-then-value sequence links across the schema change with no fork", () => {
  const { dir, path, journal, priv } = freshJournal();
  journal.append({ kind: "e0", actor: "session_owner", payload: {} }); // tenant_id null
  journal.append({ kind: "e1", actor: "session_owner", payload: {}, tenant_id: "t1" }); // populated
  journal.append({ kind: "e2", actor: "session_owner", payload: {} }); // null again
  const events = readEvents(path);
  expect(events.map((e) => e.tenant_id)).toEqual([null, "t1", null]);
  // The hash chain links across the mixed-null/value events (no fork) + verifies.
  expect(verifies(path, priv)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});
