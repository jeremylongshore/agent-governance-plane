// CodexIntendant — AGP's SECOND real harness adapter (agp-cln / Epic 12). It
// implements the FROZEN IntendantAdapter contract (016) with NO harness-specific
// path: Codex's native tool events become ToolCallRequests at the single
// normalization boundary below, and the gate's verdicts become Codex decisions.
// After normalization the request is a plain ToolCallRequest — the daemon, gate,
// policy engine, journal, and channel are reused byte-for-byte and cannot tell
// which harness produced it. That is the structural proof that AGP is multi-harness
// for real (044-AT-ADR §2).
//
// Auth: reuses the operator's own Codex credentials; AGP holds no API key (same
// posture as the Claude intendant's login-session reuse).

import type { GatewayMessage, ToolCallRequest } from "../../contracts/gateway-message.ts";
import type { IntendantIdentity, ToolCallHandler } from "../../contracts/intendant-adapter.ts";
import type { RunnableIntendant } from "../../daemon/daemon.ts";
import type { CodexDecision, CodexProcess, CodexToolEvent } from "./codex-process.ts";

/**
 * The ONE translation point (044-AT-ADR §2): Codex's native `{ id, name,
 * arguments }` event becomes AGP's `ToolCallRequest`. Pure + unit-tested.
 *
 * LOAD-BEARING: `actor` is "claude_process" — the only agent-process value in the
 * FROZEN Actor enum (src/contracts/_common.ts: "the agent process"). It is NOT
 * "codex_process": adding an enum value is a breaking core-contract change AND
 * would fork the policy surface (a per-harness rule = the backdoor this epic
 * forbids). All harnesses are one actor class. The harness-neutral rename
 * claude_process → agent_process is deferred to its own Bead + ADR (044-AT-ADR).
 */
export function normalizeCodexEvent(ev: CodexToolEvent, sessionId: string): ToolCallRequest {
  return {
    kind: "tool_call_request",
    id: ev.id,
    sessionId,
    tool: ev.name,
    args: ev.arguments,
    actor: "claude_process",
  };
}

export class CodexIntendant implements RunnableIntendant {
  readonly identity: IntendantIdentity = { name: "codex", version: "0.1.0", uri: null };
  private readonly process: CodexProcess;
  private handler: ToolCallHandler | null = null;
  private sessionId = "";

  constructor(process: CodexProcess) {
    this.process = process;
    this.process.onToolCall((ev) => {
      if (!this.handler) {
        throw new Error("CodexIntendant: tool call before a handler was registered");
      }
      this.handler(normalizeCodexEvent(ev, this.sessionId));
    });
  }

  async start(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    await this.process.start(sessionId);
  }

  onToolCall(handler: ToolCallHandler): void {
    this.handler = handler;
  }

  /** Map a gateway message back to the blocked Codex tool call — structurally
   *  identical to the Claude intendant (the verdict shape is harness-neutral). */
  deliver(message: GatewayMessage): Promise<void> {
    if (message.kind === "policy_verdict") {
      const decision: CodexDecision =
        message.verdict.decision === "deny" ? { allow: false, reason: message.verdict.reason } : { allow: true };
      this.process.respond(message.id, decision);
    } else if (message.kind === "tool_call_result") {
      this.process.respond(message.id, { allow: true });
    } else if (message.kind === "error") {
      this.process.respond(message.id, { allow: false, reason: message.message });
    }
    return Promise.resolve();
  }

  async run(sessionId: string): Promise<void> {
    if (sessionId !== this.sessionId) {
      throw new Error(`CodexIntendant: run(${sessionId}) does not match started session ${this.sessionId}`);
    }
    await this.process.run();
  }

  async stop(): Promise<void> {
    await this.process.stop();
  }
}
