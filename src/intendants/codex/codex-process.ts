// CodexProcess — the injectable seam between the CodexIntendant and the OpenAI
// Codex harness (agp-cln / 044-AT-ADR). The SECOND harness, proving the frozen
// IntendantAdapter contract is generic: it mirrors the ClaudeProcess seam exactly
// in shape, but deliberately surfaces a DIFFERENT native tool-event shape
// (`{ id, name, arguments }`, not Claude's `{ callId, tool, args }`) so the
// normalization boundary is real and exercised — the contract absorbs the
// difference at the adapter, never in the gate.
//
// Two implementations: InMemoryCodexProcess (deterministic — tests + the v0
// `--intendant codex` reference) and, in agp-cln.2, a gated LiveCodexProcess that
// spawns the real `codex` binary. Each emitted event BLOCKS until a decision is
// returned — the same back-pressure the contract models for Claude.

/** A pending tool call surfaced by Codex — its NATIVE shape (pre-normalization). */
export interface CodexToolEvent {
  /** Codex's per-call id (normalizes to ToolCallRequest.id). */
  id: string;
  /** Codex's tool name (normalizes to ToolCallRequest.tool). */
  name: string;
  /** Codex's tool arguments (normalizes to ToolCallRequest.args). */
  arguments: Record<string, unknown>;
}

/** The gate decision returned to a blocked Codex tool call. */
export type CodexDecision = { allow: true } | { allow: false; reason: string };

/** The harness side of the Codex intendant — structurally identical to
 *  ClaudeProcess; only the event shape differs. */
export interface CodexProcess {
  start(sessionId: string): Promise<void>;
  onToolCall(handler: (ev: CodexToolEvent) => void): void;
  respond(callId: string, decision: CodexDecision): void;
  run(): Promise<void>;
  stop(): Promise<void>;
}

const DEFAULT_SCRIPT: ReadonlyArray<{ tool: string; args: Record<string, unknown> }> = [
  { tool: "Read", args: { path: "/work/README.md" } },
  { tool: "Write", args: { path: "/work/plan.md", content: "draft" } },
  { tool: "Bash", args: { command: "git diff" } },
  { tool: "Bash", args: { command: "rm -rf /" } },
];

/**
 * Deterministic CodexProcess for tests and the v0 reference. Emits a fixed
 * sequence of Codex-shaped tool events with real back-pressure: each is emitted,
 * then `run` awaits its `respond` before emitting the next. A denial does NOT
 * crash the harness; `stop` aborts the rest. Mirrors InMemoryClaudeProcess.
 */
export class InMemoryCodexProcess implements CodexProcess {
  /** Every decision delivered back, in order — for test assertions. */
  readonly responses: Array<{ callId: string; decision: CodexDecision }> = [];
  private handler: ((ev: CodexToolEvent) => void) | null = null;
  private readonly waiters = new Map<string, (d: CodexDecision) => void>();
  private readonly script: ReadonlyArray<{ tool: string; args: Record<string, unknown> }>;
  private sessionId = "";
  private stopped = false;

  constructor(script: ReadonlyArray<{ tool: string; args: Record<string, unknown> }> = DEFAULT_SCRIPT) {
    this.script = script;
  }

  start(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    return Promise.resolve();
  }

  onToolCall(handler: (ev: CodexToolEvent) => void): void {
    this.handler = handler;
  }

  respond(callId: string, decision: CodexDecision): void {
    this.responses.push({ callId, decision });
    const waiter = this.waiters.get(callId);
    if (waiter) {
      this.waiters.delete(callId);
      waiter(decision);
    }
  }

  async run(): Promise<void> {
    if (!this.handler) throw new Error("InMemoryCodexProcess: no tool-call handler registered");
    for (let i = 0; i < this.script.length; i++) {
      if (this.stopped) break;
      const step = this.script[i]!;
      const callId = `${this.sessionId}-call-${i + 1}`;
      // Emit Codex's NATIVE shape, then block until the gate responds.
      await new Promise<CodexDecision>((resolve) => {
        this.waiters.set(callId, resolve);
        this.handler!({ id: callId, name: step.tool, arguments: step.args });
      });
    }
  }

  stop(): Promise<void> {
    this.stopped = true;
    for (const callId of [...this.waiters.keys()]) {
      this.respond(callId, { allow: false, reason: "session terminated" });
    }
    return Promise.resolve();
  }
}
