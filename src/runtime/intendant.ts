// ScriptedIntendant — AGP reference IntendantAdapter. Emits a fixed sequence of
// tool-call requests so `agp run` can drive the governance loop end-to-end as a
// self-test, with no real harness attached. It records what the gateway delivers
// back (verdicts/results).
//
// REFERENCE — the production intendant (Epic 06, agp-92v) replaces this with the
// real Claude Code adapter, which reuses the operator's Claude Code login
// session (no Anthropic API key).

import type { GatewayMessage, ToolCallRequest } from "../contracts/gateway-message.ts";
import type { IntendantAdapter, IntendantIdentity, ToolCallHandler } from "../contracts/intendant-adapter.ts";

export class ScriptedIntendant implements IntendantAdapter {
  readonly identity: IntendantIdentity = { name: "scripted-reference", version: "0.0.0", uri: null };
  readonly delivered: GatewayMessage[] = [];
  private handler: ToolCallHandler | null = null;
  private readonly script: ReadonlyArray<{ tool: string; args: Record<string, unknown> }>;

  constructor(
    script: ReadonlyArray<{ tool: string; args: Record<string, unknown> }> = [
      { tool: "Read", args: { path: "/work/README.md" } },
      { tool: "Bash", args: { command: "rm -rf /" } },
    ],
  ) {
    this.script = script;
  }

  start(_sessionId: string): Promise<void> {
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
    return Promise.resolve();
  }

  /** Emit the scripted tool calls through the registered handler. */
  emitAll(sessionId: string): ToolCallRequest[] {
    if (!this.handler) throw new Error("no tool-call handler registered");
    const emitted: ToolCallRequest[] = [];
    this.script.forEach((step, i) => {
      const req: ToolCallRequest = {
        kind: "tool_call_request",
        id: `${sessionId}-call-${i + 1}`,
        sessionId,
        tool: step.tool,
        args: step.args,
        actor: "claude_process",
      };
      emitted.push(req);
      this.handler?.(req);
    });
    return emitted;
  }
}
