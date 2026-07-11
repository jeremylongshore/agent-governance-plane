// runMediated (Slice 0, agp-eva.1.5): the driver for trigger-woken agents whose
// tool calls AGP PROXY-EXECUTES — unlike runLive (gate-only) the agent holds no
// executor; unlike runScripted the agent sees each result before its next call.

import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Daemon, type RunnableIntendant } from "./daemon.ts";
import { Journal, readEvents } from "../journal/journal.ts";
import { verifyJournalFile } from "../journal/verify.ts";
import { PolicyEngine, type PolicyRule } from "../policy/engine.ts";
import { RecordingSandbox } from "../runtime/sandbox.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "../runtime/crypto.ts";
import type { GatewayMessage, ToolCallRequest } from "../contracts/gateway-message.ts";
import type { IntendantIdentity, ToolCallHandler } from "../contracts/intendant-adapter.ts";
import type {
  ExecResult,
  IsolationGuarantees,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "../contracts/sandbox-provider.ts";

/** A minimal two-step agent: read, then act IF the read's result says to. */
class TwoStepIntendant implements RunnableIntendant {
  readonly identity: IntendantIdentity = { name: "two-step", version: "0.0.0", uri: null };
  readonly delivered: GatewayMessage[] = [];
  private handler: ToolCallHandler | null = null;
  private readonly pending = new Map<string, (m: GatewayMessage) => void>();

  start(): Promise<void> {
    return Promise.resolve();
  }
  onToolCall(handler: ToolCallHandler): void {
    this.handler = handler;
  }
  deliver(message: GatewayMessage): Promise<void> {
    this.delivered.push(message);
    if (message.kind === "tool_call_result" || message.kind === "policy_verdict") {
      const r = this.pending.get(message.id);
      if (r) {
        this.pending.delete(message.id);
        r(message);
      }
    }
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }

  private call(id: string, tool: string): Promise<GatewayMessage> {
    const req: ToolCallRequest = {
      kind: "tool_call_request",
      id,
      sessionId: "s1",
      tool,
      args: { command: `${tool} --go` },
      actor: "claude_process",
    };
    const p = new Promise<GatewayMessage>((resolve) => this.pending.set(id, resolve));
    this.handler?.(req);
    return p;
  }

  /** The feedback loop runScripted cannot do: the second call DEPENDS on the first result. */
  async run(): Promise<void> {
    const read = await this.call("c1", "watch_read");
    if (read.kind === "tool_call_result" && read.ok) {
      await this.call("c2", "watch_act");
    }
  }
}

function harness(rules: PolicyRule[], env: Record<string, string | undefined> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "agp-dmr-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-07-10T00:00:00.000Z");
  const sandbox = new RecordingSandbox();
  const daemon = new Daemon({ policy: new PolicyEngine(rules), journal, sandbox, channel: new ConsoleChannel(env, () => {}) });
  return { dir, path, pub: publicKeyFromPrivate(priv), daemon, sandbox };
}

test("proxy-executes an allowed call, delivers the result, and the next call reacts to it", async () => {
  const h = harness([
    { id: "allow-read", effect: "allow", tool: "watch_read" },
    { id: "allow-act", effect: "allow", tool: "watch_act" },
  ]);
  const agent = new TwoStepIntendant();
  const res = await h.daemon.runMediated(agent, { sessionId: "s1" });
  expect(res.outcomes).toHaveLength(2); // the act happened BECAUSE the read result arrived
  expect(res.outcomes.every((o) => o.executed)).toBe(true);
  expect(h.sandbox.recorded).toHaveLength(2);
  expect(verifyJournalFile(h.path, h.pub).ok).toBe(true);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a require call executes only on human approval; fail-closed deny delivers the verdict instead", async () => {
  const approved = harness(
    [
      { id: "allow-read", effect: "allow", tool: "watch_read" },
      { id: "req-act", effect: "require", tool: "watch_act" },
    ],
    { AGP_AUTO_APPROVE: "1" },
  );
  const a1 = new TwoStepIntendant();
  const r1 = await approved.daemon.runMediated(a1, { sessionId: "s1" });
  expect(r1.outcomes[1]!.approved).toBe(true);
  expect(r1.outcomes[1]!.executed).toBe(true);
  rmSync(approved.dir, { recursive: true, force: true });

  const denied = harness([
    { id: "allow-read", effect: "allow", tool: "watch_read" },
    { id: "req-act", effect: "require", tool: "watch_act" },
  ]); // console channel with no human → fail-closed deny
  const a2 = new TwoStepIntendant();
  const r2 = await denied.daemon.runMediated(a2, { sessionId: "s1" });
  expect(r2.outcomes[1]!.approved).toBe(false);
  expect(r2.outcomes[1]!.executed).toBe(false);
  expect(denied.sandbox.recorded).toHaveLength(1); // only the read ran
  const verdicts = a2.delivered.filter((m) => m.kind === "policy_verdict");
  expect(verdicts).toHaveLength(1); // the deny came back as a verdict, not a result
  rmSync(denied.dir, { recursive: true, force: true });
});

test("an unknown tool default-denies (fail-closed) and nothing executes", async () => {
  const h = harness([]); // no rules at all
  const agent = new TwoStepIntendant();
  const res = await h.daemon.runMediated(agent, { sessionId: "s1" });
  expect(res.outcomes).toHaveLength(1); // read denied → agent never acts
  expect(res.outcomes[0]!.verdict.decision).toBe("deny");
  expect(h.sandbox.recorded).toHaveLength(0);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a THROWING intendant never leaks the sandbox: teardown + stop always run, the error propagates", async () => {
  // The Gemini-review finding on PR #123: a crash mid-run must not leave a
  // container running or the harness attached. No session.ended is journaled
  // (the run did NOT end cleanly) — the lease path reaps it later instead.
  let toreDown = 0;
  class CountingSandbox implements SandboxProvider {
    isolation(): IsolationGuarantees {
      return { kind: "spy", boundary: "none — test double", vmGrade: false };
    }
    spawn(spec: SandboxSpec): Promise<SandboxHandle> {
      return Promise.resolve({ id: "c-1", sessionId: spec.sessionId });
    }
    exec(): Promise<ExecResult> {
      return Promise.resolve({ exitCode: 0, stdout: "ok", stderr: "" });
    }
    teardown(): Promise<void> {
      toreDown++;
      return Promise.resolve();
    }
  }
  class CrashingIntendant implements RunnableIntendant {
    readonly identity: IntendantIdentity = { name: "crasher", version: "0.0.0", uri: null };
    stopped = 0;
    start(): Promise<void> {
      return Promise.resolve();
    }
    onToolCall(): void {}
    deliver(): Promise<void> {
      return Promise.resolve();
    }
    stop(): Promise<void> {
      this.stopped++;
      return Promise.resolve();
    }
    run(): Promise<void> {
      return Promise.reject(new Error("harness exploded mid-run"));
    }
  }
  const dir = mkdtempSync(join(tmpdir(), "agp-dmr-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-07-10T00:00:00.000Z");
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "allow-all", effect: "allow", tool: "*" }]),
    journal,
    sandbox: new CountingSandbox(),
    channel: new ConsoleChannel({}, () => {}),
  });
  const crasher = new CrashingIntendant();
  await expect(daemon.runMediated(crasher, { sessionId: "s-crash" })).rejects.toThrow("harness exploded mid-run");
  expect(toreDown).toBe(1); // the container did NOT leak
  expect(crasher.stopped).toBe(1); // the harness was detached
  const kinds = readEvents(path).map((e) => e.kind);
  expect(kinds).toContain("session.started");
  expect(kinds).not.toContain("session.ended"); // no fabricated clean end
  rmSync(dir, { recursive: true, force: true });
});

test("session lifecycle is journaled and networkEnabled passes through to the sandbox spawn", async () => {
  const spawns: SandboxSpec[] = [];
  class SpyingSandbox implements SandboxProvider {
    isolation(): IsolationGuarantees {
      return { kind: "spy", boundary: "none — test double", vmGrade: false };
    }
    spawn(spec: SandboxSpec): Promise<SandboxHandle> {
      spawns.push(spec);
      return Promise.resolve({ id: "spy-1", sessionId: spec.sessionId });
    }
    exec(): Promise<ExecResult> {
      return Promise.resolve({ exitCode: 0, stdout: "ok", stderr: "" });
    }
    teardown(): Promise<void> {
      return Promise.resolve();
    }
  }
  const dir = mkdtempSync(join(tmpdir(), "agp-dmr-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-07-10T00:00:00.000Z");
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "allow-all", effect: "allow", tool: "*" }]),
    journal,
    sandbox: new SpyingSandbox(),
    channel: new ConsoleChannel({}, () => {}),
  });

  await daemon.runMediated(new TwoStepIntendant(), { sessionId: "s-net", networkEnabled: true });
  expect(spawns[0]!.networkEnabled).toBe(true);
  await daemon.runMediated(new TwoStepIntendant(), { sessionId: "s-off" });
  expect(spawns[1]!.networkEnabled).toBe(false); // default stays network-off

  const kinds = readEvents(path).map((e) => e.kind);
  expect(kinds).toContain("session.started");
  expect(kinds).toContain("session.ended");
  rmSync(dir, { recursive: true, force: true });
});
