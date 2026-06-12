import { test, expect } from "bun:test";
import { IntendantIdentity, type IntendantAdapter, type ToolCallHandler } from "./intendant-adapter.ts";
import {
  SandboxSpec,
  IsolationGuarantees,
  type SandboxProvider,
  type SandboxHandle,
  type ExecResult,
} from "./sandbox-provider.ts";
import {
  ApprovalRequest,
  type ChannelAdapter,
  type ApprovalHandle,
  type ApprovalDecision,
} from "./channel-adapter.ts";
import type { GatewayMessage } from "./gateway-message.ts";
import {
  validIntendantIdentity,
  validSandboxSpec,
  containerIsolation,
  validApprovalRequest,
  validAllowVerdict,
} from "./fixtures.ts";

// ---- data-part schemas -----------------------------------------------------

test("IntendantIdentity parses; uri reserved (null) at v0", () => {
  const parsed = IntendantIdentity.parse(validIntendantIdentity);
  expect(parsed.uri).toBeNull();
  expect(IntendantIdentity.parse({ name: "x", version: "1" }).uri).toBeNull();
});

test("SandboxSpec defaults networkEnabled to false (fail-closed)", () => {
  const parsed = SandboxSpec.parse({ image: "i", sessionId: "s" });
  expect(parsed.networkEnabled).toBe(false);
  expect(SandboxSpec.parse(validSandboxSpec).networkEnabled).toBe(false);
});

test("IsolationGuarantees for a container is honestly not vm-grade", () => {
  const parsed = IsolationGuarantees.parse(containerIsolation);
  expect(parsed.vmGrade).toBe(false);
});

test("ApprovalRequest accepts a require verdict, rejects a non-require one", () => {
  expect(ApprovalRequest.safeParse(validApprovalRequest).success).toBe(true);
  expect(
    ApprovalRequest.safeParse({ ...validApprovalRequest, verdict: validAllowVerdict }).success,
  ).toBe(false);
});

// ---- reference-fake conformance --------------------------------------------

class FakeIntendant implements IntendantAdapter {
  readonly identity = validIntendantIdentity;
  private handler: ToolCallHandler | null = null;
  delivered: GatewayMessage[] = [];
  started = false;
  start(_sessionId: string): Promise<void> {
    this.started = true;
    return Promise.resolve();
  }
  onToolCall(handler: ToolCallHandler): void {
    this.handler = handler;
  }
  deliver(message: GatewayMessage): Promise<void> {
    this.delivered.push(message);
    return Promise.resolve();
  }
  stop(): Promise<void> {
    this.started = false;
    return Promise.resolve();
  }
  hasHandler(): boolean {
    return this.handler !== null;
  }
}

class FakeSandbox implements SandboxProvider {
  isolation(): IsolationGuarantees {
    return containerIsolation;
  }
  spawn(spec: SandboxSpec): Promise<SandboxHandle> {
    return Promise.resolve({ id: `sbx-${spec.sessionId}`, sessionId: spec.sessionId });
  }
  exec(_handle: SandboxHandle, _command: readonly string[]): Promise<ExecResult> {
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  }
  teardown(_handle: SandboxHandle): Promise<void> {
    return Promise.resolve();
  }
}

class FakeChannel implements ChannelAdapter {
  postApprovalRequest(request: ApprovalRequest): Promise<ApprovalHandle> {
    return Promise.resolve({ messageId: request.messageId });
  }
  awaitDecision(handle: ApprovalHandle): Promise<ApprovalDecision> {
    return Promise.resolve({ messageId: handle.messageId, approved: true, decidedBy: "U123" });
  }
  projectEvent(_eventKind: string, _summary: string): Promise<boolean> {
    return Promise.resolve(true);
  }
}

test("a reference IntendantAdapter conforms and drives a session", async () => {
  const intendant = new FakeIntendant();
  await intendant.start("s1");
  expect(intendant.started).toBe(true);
  intendant.onToolCall(() => {});
  expect(intendant.hasHandler()).toBe(true);
  await intendant.stop();
  expect(intendant.started).toBe(false);
});

test("a reference SandboxProvider spawns/execs/tears down", async () => {
  const sandbox = new FakeSandbox();
  expect(sandbox.isolation().vmGrade).toBe(false);
  const handle = await sandbox.spawn(validSandboxSpec);
  expect(handle.sessionId).toBe("sess-1");
  expect((await sandbox.exec(handle, ["true"])).exitCode).toBe(0);
  await sandbox.teardown(handle);
});

test("a reference ChannelAdapter posts, awaits, and projects (best-effort)", async () => {
  const channel = new FakeChannel();
  const handle = await channel.postApprovalRequest(validApprovalRequest);
  const decision = await channel.awaitDecision(handle);
  expect(decision.approved).toBe(true);
  expect(typeof (await channel.projectEvent("tool_call.allow", "Read /x"))).toBe("boolean");
});
