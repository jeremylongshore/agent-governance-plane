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
import { Daemon } from "../daemon/daemon.ts";
import { PolicyEngine } from "../policy/engine.ts";
import { RecordingSandbox } from "../runtime/sandbox.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { ScriptedIntendant } from "../runtime/intendant.ts";
import type { IntendantIdentity } from "../contracts/intendant-adapter.ts";

const FIXED = () => "2026-06-21T00:00:00.000Z";

function freshJournal(): { dir: string; path: string; journal: Journal; priv: KeyObject } {
  const dir = mkdtempSync(join(tmpdir(), "agp-iuri-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  return { dir, path, journal: new Journal(path, priv, FIXED), priv };
}

// --- journal append: both branches of the new field -------------------------

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

// --- daemon threads the adapter identity into session.started ----------------

/** A scripted intendant that asserts a (test) verified identity URI. */
class UriScripted extends ScriptedIntendant {
  override readonly identity: IntendantIdentity = {
    name: "scripted-reference",
    version: "1.0.0",
    uri: "agp-intendant:ed25519/scripted-reference@1.0.0/deadbeefdeadbeef",
  };
}

function daemonWith(journal: Journal): Daemon {
  return new Daemon({
    policy: new PolicyEngine([{ id: "allow-read", effect: "allow", tool: "Read" }]),
    journal,
    sandbox: new RecordingSandbox(),
    channel: new ConsoleChannel({}, () => {}),
  });
}

test("daemon sources session.started's intendant_identity_uri from the adapter (null by default)", async () => {
  const { dir, path, journal } = freshJournal();
  await daemonWith(journal).runScripted(new ScriptedIntendant([{ tool: "Read", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  const started = readEvents(path).find((e) => e.kind === "session.started");
  expect(started?.intendant_identity_uri).toBeNull(); // default adapter asserts no provenance
  rmSync(dir, { recursive: true, force: true });
});

test("daemon threads a non-null adapter identity URI into the session.started column", async () => {
  const { dir, path, journal } = freshJournal();
  await daemonWith(journal).runScripted(new UriScripted([{ tool: "Read", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  const started = readEvents(path).find((e) => e.kind === "session.started");
  expect(started?.intendant_identity_uri).toBe("agp-intendant:ed25519/scripted-reference@1.0.0/deadbeefdeadbeef");
  rmSync(dir, { recursive: true, force: true });
});
