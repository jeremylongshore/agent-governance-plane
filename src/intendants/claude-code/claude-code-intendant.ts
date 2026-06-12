// ClaudeCodeIntendant — AGP's first real harness adapter (Epic 06, agp-92v). It
// implements the FROZEN IntendantAdapter contract (016) with no one-off backdoor:
// the harness's PreToolUse hook events become ToolCallRequests, and the gate's
// verdicts (delivered as policy_verdict messages) become hook allow/deny
// decisions. The harness itself is reached only through the injectable
// ClaudeProcess seam, so the whole adapter is unit-testable without a real
// `claude` binary or a login session.
//
// Auth: the intendant reuses the operator's existing Claude Code LOGIN SESSION.
// AGP holds no Anthropic API key (CLI spec 012 / Epic-00 contradiction C7).

import type { GatewayMessage } from "../../contracts/gateway-message.ts";
import type { ToolCallRequest } from "../../contracts/gateway-message.ts";
import type { IntendantIdentity, ToolCallHandler } from "../../contracts/intendant-adapter.ts";
import type { RunnableIntendant } from "../../daemon/daemon.ts";
import type { ClaudeProcess, HookDecision } from "./claude-process.ts";

export class ClaudeCodeIntendant implements RunnableIntendant {
  readonly identity: IntendantIdentity = { name: "claude-code", version: "0.1.0", uri: null };
  private readonly process: ClaudeProcess;
  private handler: ToolCallHandler | null = null;
  private sessionId = "";

  constructor(process: ClaudeProcess) {
    this.process = process;
    // Each PreToolUse hook event becomes a tool-call request to the gateway.
    this.process.onPreToolUse((ev) => {
      if (!this.handler) {
        throw new Error("ClaudeCodeIntendant: tool call before a handler was registered");
      }
      const req: ToolCallRequest = {
        kind: "tool_call_request",
        id: ev.callId,
        sessionId: this.sessionId,
        tool: ev.tool,
        args: ev.args,
        actor: "claude_process",
      };
      this.handler(req);
    });
  }

  async start(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    await this.process.start(sessionId);
  }

  onToolCall(handler: ToolCallHandler): void {
    this.handler = handler;
  }

  /**
   * Map a gateway message back to the blocked PreToolUse hook. The live gate
   * delivers a `policy_verdict` carrying the EFFECTIVE decision (allow after an
   * approval, or deny). A `tool_call_result` (proxy-exec path) is treated as an
   * allow for robustness, though `runLive` never sends one.
   */
  deliver(message: GatewayMessage): Promise<void> {
    if (message.kind === "policy_verdict") {
      const decision: HookDecision =
        message.verdict.decision === "deny"
          ? { allow: false, reason: message.verdict.reason }
          : { allow: true };
      this.process.respond(message.id, decision);
    } else if (message.kind === "tool_call_result") {
      this.process.respond(message.id, { allow: true });
    } else if (message.kind === "error") {
      // A protocol error fails closed: deny the pending call.
      this.process.respond(message.id, { allow: false, reason: message.message });
    }
    return Promise.resolve();
  }

  async run(sessionId: string): Promise<void> {
    if (sessionId !== this.sessionId) {
      throw new Error(`ClaudeCodeIntendant: run(${sessionId}) does not match started session ${this.sessionId}`);
    }
    await this.process.run();
  }

  async stop(): Promise<void> {
    await this.process.stop();
  }
}
