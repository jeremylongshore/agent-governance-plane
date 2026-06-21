import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { Journal, readEvents } from "./journal.ts";
import { verifyJournalFile } from "./verify.ts";
import {
  generateSigningKeyPem,
  loadPrivateKey,
  loadPublicKey,
  publicKeyFromPrivate,
} from "../runtime/crypto.ts";

// Journal-layer tests only (the daemon-threading tests live in
// src/daemon/daemon-intendant-uri.test.ts — the journal layer must not import
// the daemon, per the `daemon-not-imported-by-leaves` architecture rule).

const FIXED = () => "2026-06-21T00:00:00.000Z";

function freshJournal(): { dir: string; path: string; journal: Journal; priv: KeyObject } {
  const dir = mkdtempSync(join(tmpdir(), "agp-iuri-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  return { dir, path, journal: new Journal(path, priv, FIXED), priv };
}

test("append without intendant_identity_uri records null (backward-compatible)", () => {
  const { dir, path, journal } = freshJournal();
  journal.append({ kind: "session.started", actor: "session_owner", payload: { sessionId: "s1" } });
  expect(readEvents(path)[0]!.intendant_identity_uri).toBeNull();
  rmSync(dir, { recursive: true, force: true });
});

test("append with intendant_identity_uri records it verbatim and the chain still verifies", () => {
  const { dir, path, journal, priv } = freshJournal();
  const uri = "agp-intendant:ed25519/scripted-reference@0.0.0/0123456789abcdef";
  journal.append({
    kind: "session.started",
    actor: "session_owner",
    payload: { sessionId: "s1" },
    intendant_identity_uri: uri,
  });
  const ev = readEvents(path)[0]!;
  expect(ev.intendant_identity_uri).toBe(uri);
  // The signature + chain cover the populated top-level field.
  const pubPem = publicKeyFromPrivate(priv).export({ type: "spki", format: "pem" }).toString();
  expect(verifyJournalFile(path, loadPublicKey(pubPem)).ok).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});
