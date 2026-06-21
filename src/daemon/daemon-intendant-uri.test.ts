import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Daemon } from "./daemon.ts";
import { Journal, readEvents } from "../journal/journal.ts";
import { PolicyEngine } from "../policy/engine.ts";
import { RecordingSandbox } from "../runtime/sandbox.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { ScriptedIntendant } from "../runtime/intendant.ts";
import { generateSigningKeyPem, loadPrivateKey } from "../runtime/crypto.ts";
import type { IntendantIdentity } from "../contracts/intendant-adapter.ts";

// The daemon sources session.started's top-level intendant_identity_uri column
// from the adapter's identity (agp-z26.1 / 043-AT-ADR).

function freshJournal(): { dir: string; path: string; journal: Journal } {
  const dir = mkdtempSync(join(tmpdir(), "agp-duri-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  return { dir, path, journal: new Journal(path, priv, () => "2026-06-21T00:00:00.000Z") };
}

function daemonWith(journal: Journal): Daemon {
  return new Daemon({
    policy: new PolicyEngine([{ id: "allow-read", effect: "allow", tool: "Read" }]),
    journal,
    sandbox: new RecordingSandbox(),
    channel: new ConsoleChannel({}, () => {}),
  });
}

/** A scripted intendant that asserts a (test) verified identity URI. */
class UriScripted extends ScriptedIntendant {
  override readonly identity: IntendantIdentity = {
    name: "scripted-reference",
    version: "1.0.0",
    uri: "agp-intendant:ed25519/scripted-reference@1.0.0/deadbeefdeadbeef",
  };
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
