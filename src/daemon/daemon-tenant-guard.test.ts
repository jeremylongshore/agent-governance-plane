import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Daemon, type RunnableIntendant } from "./daemon.ts";
import { Journal } from "../journal/journal.ts";
import { PolicyEngine } from "../policy/engine.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { ScriptedIntendant } from "../runtime/intendant.ts";
import { generateSigningKeyPem, loadPrivateKey } from "../runtime/crypto.ts";
import type { TenantContext } from "../tenants/tenant.ts";
import type { ToolCallRequest } from "../contracts/gateway-message.ts";
import type {
  ExecResult,
  IsolationGuarantees,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "../contracts/sandbox-provider.ts";

// agp-pne.1: the daemon fails closed on any non-sentinel tenant BEFORE any spawn
// or mediation — v0 is single-tenant only (047-AT-ADR).

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

const BAD_TENANT = { tenantId: "acme" } as unknown as TenantContext;

function daemon(sandbox: SpySandbox, tenantContext?: TenantContext): Daemon {
  const dir = mkdtempSync(join(tmpdir(), "agp-tg-"));
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(join(dir, "audit.log"), priv, () => "2026-06-22T00:00:00.000Z");
  return new Daemon({
    policy: new PolicyEngine([{ id: "allow-read", effect: "allow", tool: "Read" }]),
    journal,
    sandbox,
    channel: new ConsoleChannel({}, () => {}),
    tenantContext,
  });
}

test("runScripted fails closed on a non-sentinel tenant, before any spawn", async () => {
  const sandbox = new SpySandbox();
  await expect(
    daemon(sandbox, BAD_TENANT).runScripted(new ScriptedIntendant([{ tool: "Read", args: {} }]), { sessionId: "s1" }),
  ).rejects.toThrow(/\[FAIL-CLOSED\] tenant context violation/);
  expect(sandbox.spawns).toBe(0);
});

test("runLive fails closed on a non-sentinel tenant, before any spawn", async () => {
  const sandbox = new SpySandbox();
  // A minimal RunnableIntendant — never driven, since the tenant assert throws first.
  const stub: RunnableIntendant = {
    identity: { name: "stub", version: "0", uri: null },
    start: () => Promise.resolve(),
    onToolCall: () => {},
    deliver: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    run: () => Promise.resolve(),
  };
  await expect(daemon(sandbox, BAD_TENANT).runLive(stub, { sessionId: "s1" })).rejects.toThrow(/\[FAIL-CLOSED\]/);
  expect(sandbox.spawns).toBe(0);
});

test("mediate fails closed on a non-sentinel tenant", async () => {
  const sandbox = new SpySandbox();
  const req: ToolCallRequest = {
    kind: "tool_call_request",
    id: "c1",
    sessionId: "s1",
    tool: "Read",
    args: {},
    actor: "claude_process",
  };
  await expect(
    daemon(sandbox, BAD_TENANT).mediate(req, { id: "h", sessionId: "s1" }, new ScriptedIntendant([])),
  ).rejects.toThrow(/\[FAIL-CLOSED\]/);
  expect(sandbox.spawns).toBe(0);
});

test("the default (sentinel) tenant runs normally", async () => {
  const sandbox = new SpySandbox();
  const res = await daemon(sandbox).runScripted(new ScriptedIntendant([{ tool: "Read", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes).toHaveLength(1);
  expect(sandbox.spawns).toBe(1);
});
