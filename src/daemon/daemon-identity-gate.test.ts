import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Daemon, type IdentityMode } from "./daemon.ts";
import { Journal, readEvents } from "../journal/journal.ts";
import { PolicyEngine } from "../policy/engine.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { ScriptedIntendant } from "../runtime/intendant.ts";
import { generateSigningKeyPem, loadPrivateKey } from "../runtime/crypto.ts";
import type { Verifier, VerifyResult } from "../contracts/verifier.ts";
import type { IntendantManifest } from "../contracts/intendant-manifest.ts";
import type {
  ExecResult,
  IsolationGuarantees,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "../contracts/sandbox-provider.ts";

const VERIFIED_URI = "agp-intendant:ed25519/scripted-reference@0.0.0/feedfacefeedface";
const MANIFEST: IntendantManifest = { name: "scripted-reference", version: "0.0.0" };

/** A verifier whose verdict is fixed by the test. */
class FakeVerifier implements Verifier {
  readonly scheme = "fake";
  constructor(private readonly result: VerifyResult) {}
  verify(): Promise<VerifyResult> {
    return Promise.resolve(this.result);
  }
}

/** Records how many times a sandbox was spawned (to prove refuse = no spawn). */
class SpySandbox implements SandboxProvider {
  spawns = 0;
  isolation(): IsolationGuarantees {
    return { kind: "recording", boundary: "test", vmGrade: false };
  }
  spawn(spec: SandboxSpec): Promise<SandboxHandle> {
    this.spawns++;
    return Promise.resolve({ id: `spy-${spec.sessionId}`, sessionId: spec.sessionId });
  }
  exec(): Promise<ExecResult> {
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  }
  teardown(): Promise<void> {
    return Promise.resolve();
  }
}

function setup(mode: IdentityMode, verifier: Verifier | undefined, sandbox: SpySandbox) {
  const dir = mkdtempSync(join(tmpdir(), "agp-idgate-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-21T00:00:00.000Z");
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "allow-read", effect: "allow", tool: "Read" }]),
    journal,
    sandbox,
    channel: new ConsoleChannel({}, () => {}),
    verifier,
    identityMode: mode,
  });
  return { dir, path, daemon };
}

const script = [{ tool: "Read", args: { path: "/x" } }];
const verifyMaterial = { manifest: MANIFEST, signatureB64: "AAAA" }; // FakeVerifier ignores these

test("enforce + failing verifier REFUSES: no spawn, no session.started, intendant.verify.failed journaled", async () => {
  const sandbox = new SpySandbox();
  const { dir, path, daemon } = setup("enforce", new FakeVerifier({ ok: false, reason: "bad-signature" }), sandbox);
  const result = await daemon.runScripted(new ScriptedIntendant(script), { sessionId: "s1", ...verifyMaterial });

  expect(result.refused).toBe(true);
  expect(result.outcomes).toHaveLength(0);
  expect(sandbox.spawns).toBe(0); // never spawned
  const kinds = readEvents(path).map((e) => e.kind);
  expect(kinds).toContain("intendant.verify.failed");
  expect(kinds).not.toContain("session.started");
  rmSync(dir, { recursive: true, force: true });
});

test("enforce + valid verifier STARTS and records the verifier-minted URI", async () => {
  const sandbox = new SpySandbox();
  const { dir, path, daemon } = setup(
    "enforce",
    new FakeVerifier({ ok: true, identity: { name: "scripted-reference", version: "0.0.0", uri: VERIFIED_URI } }),
    sandbox,
  );
  const result = await daemon.runScripted(new ScriptedIntendant(script), { sessionId: "s1", ...verifyMaterial });

  expect(result.refused).toBeUndefined();
  expect(sandbox.spawns).toBe(1);
  const started = readEvents(path).find((e) => e.kind === "session.started");
  expect(started?.intendant_identity_uri).toBe(VERIFIED_URI);
  rmSync(dir, { recursive: true, force: true });
});

test("warn + failing verifier RUNS but journals the failure and records a null URI", async () => {
  const sandbox = new SpySandbox();
  const { dir, path, daemon } = setup("warn", new FakeVerifier({ ok: false, reason: "unknown-key" }), sandbox);
  const result = await daemon.runScripted(new ScriptedIntendant(script), { sessionId: "s1", ...verifyMaterial });

  expect(result.refused).toBeUndefined();
  expect(sandbox.spawns).toBe(1); // ran despite the failure
  const events = readEvents(path);
  expect(events.map((e) => e.kind)).toContain("intendant.verify.failed");
  const started = events.find((e) => e.kind === "session.started");
  expect(started?.intendant_identity_uri).toBeNull(); // ran unverified
  rmSync(dir, { recursive: true, force: true });
});

test("enforce with NO verification material refuses with reason no-verification-material", async () => {
  const sandbox = new SpySandbox();
  const { dir, path, daemon } = setup("enforce", undefined, sandbox);
  const result = await daemon.runScripted(new ScriptedIntendant(script), { sessionId: "s1" }); // no manifest/sig

  expect(result.refused).toBe(true);
  expect(sandbox.spawns).toBe(0);
  const failed = readEvents(path).find((e) => e.kind === "intendant.verify.failed");
  expect(failed?.payload).toMatchObject({ reason: "no-verification-material", mode: "enforce" });
  rmSync(dir, { recursive: true, force: true });
});

test("off mode does not verify: no intendant.verify.failed, URI from the adapter (null at v0)", async () => {
  const sandbox = new SpySandbox();
  // A verifier is present but must be ignored in off mode.
  const { dir, path, daemon } = setup("off", new FakeVerifier({ ok: false, reason: "bad-signature" }), sandbox);
  const result = await daemon.runScripted(new ScriptedIntendant(script), { sessionId: "s1", ...verifyMaterial });

  expect(result.refused).toBeUndefined();
  expect(sandbox.spawns).toBe(1);
  const events = readEvents(path);
  expect(events.map((e) => e.kind)).not.toContain("intendant.verify.failed");
  expect(events.find((e) => e.kind === "session.started")?.intendant_identity_uri).toBeNull();
  rmSync(dir, { recursive: true, force: true });
});
