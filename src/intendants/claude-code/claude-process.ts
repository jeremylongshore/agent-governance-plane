// ClaudeProcess — the injectable seam between the ClaudeCodeIntendant and the real
// Claude Code harness. It mirrors the Slack epic's transport/interaction split:
// the intendant holds the protocol logic; the process holds the harness I/O. Two
// implementations exist — InMemoryClaudeProcess (deterministic, for tests + the
// v0 `--intendant claude-code` reference) and BunClaudeProcess (gated, spawns the
// real `claude` binary).
//
// Interception mechanism: Claude Code's **PreToolUse hook**. Anthropic's
// external-message-injection / ACP wire (anthropics/claude-code#53049) is not
// shipped, so the hook is the stable, login-session-preserving way to gate a
// tool call. Each hook invocation BLOCKS the harness until a decision is
// returned — this is the back-pressure the contract models.

/** A pending tool call surfaced by the harness's PreToolUse hook. */
export interface PreToolUseEvent {
  /** Stable per-call id within the session (e.g. "<sessionId>-call-N"). */
  callId: string;
  /** Tool the harness wants to invoke (Read, Write, Bash, …). */
  tool: string;
  /** The tool's input arguments. */
  args: Record<string, unknown>;
}

/** The gate decision returned to a blocked PreToolUse hook. */
export type HookDecision = { allow: true } | { allow: false; reason: string };

/**
 * The harness side of the intendant. The harness executes its own tools INSIDE the
 * sandbox; the process only surfaces each pending call (via the hook) and blocks
 * until `respond` is called. AGP never proxy-executes a live harness's tools.
 */
export interface ClaudeProcess {
  /** Begin the harness session. */
  start(sessionId: string): Promise<void>;
  /**
   * Register the receiver for each PreToolUse hook event. The harness blocks on
   * every emitted event until `respond(callId, …)` settles it.
   */
  onPreToolUse(handler: (ev: PreToolUseEvent) => void): void;
  /** Unblock a pending hook with the gate's allow/deny decision. */
  respond(callId: string, decision: HookDecision): void;
  /**
   * Drive the harness to completion. Resolves when the session ends; the promise
   * only settles after every emitted hook has been responded to (back-pressure).
   */
  run(): Promise<void>;
  /** Kill the harness; idempotent. Unblocks any pending hooks as denied. */
  stop(): Promise<void>;
}

const DEFAULT_SCRIPT: ReadonlyArray<{ tool: string; args: Record<string, unknown> }> = [
  { tool: "Read", args: { path: "/work/README.md" } },
  { tool: "Write", args: { path: "/work/notes.md", content: "wip" } },
  { tool: "Bash", args: { command: "git status" } },
  { tool: "Bash", args: { command: "git push --force" } },
];

/**
 * Deterministic ClaudeProcess for tests and the v0 reference. It emits a fixed
 * sequence of PreToolUse events with real back-pressure: each call is emitted,
 * then `run` awaits its `respond` before emitting the next — exactly how a real
 * blocking hook serializes tool calls. A denial does NOT crash the harness (the
 * real harness observes the block and keeps going); `stop` aborts the rest.
 */
export class InMemoryClaudeProcess implements ClaudeProcess {
  /** Every decision delivered back, in order — for test assertions. */
  readonly responses: Array<{ callId: string; decision: HookDecision }> = [];
  private handler: ((ev: PreToolUseEvent) => void) | null = null;
  private readonly waiters = new Map<string, (d: HookDecision) => void>();
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

  onPreToolUse(handler: (ev: PreToolUseEvent) => void): void {
    this.handler = handler;
  }

  respond(callId: string, decision: HookDecision): void {
    this.responses.push({ callId, decision });
    const waiter = this.waiters.get(callId);
    if (waiter) {
      this.waiters.delete(callId);
      waiter(decision);
    }
  }

  async run(): Promise<void> {
    if (!this.handler) throw new Error("InMemoryClaudeProcess: no PreToolUse handler registered");
    for (let i = 0; i < this.script.length; i++) {
      if (this.stopped) break;
      const step = this.script[i]!;
      const callId = `${this.sessionId}-call-${i + 1}`;
      // Emit, then block until the gate responds — real hook back-pressure.
      await new Promise<HookDecision>((resolve) => {
        this.waiters.set(callId, resolve);
        this.handler!({ callId, tool: step.tool, args: step.args });
      });
    }
  }

  stop(): Promise<void> {
    this.stopped = true;
    // Route through respond() so terminated calls are recorded like any decision.
    for (const callId of [...this.waiters.keys()]) {
      this.respond(callId, { allow: false, reason: "session terminated" });
    }
    return Promise.resolve();
  }
}
