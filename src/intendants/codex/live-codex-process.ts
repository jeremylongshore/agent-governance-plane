// LiveCodexProcess — the flag-gated live Codex path (agp-cln.2 / 045-AT-ADR).
// The analogue of BunClaudeProcess: gated behind AGP_CODEX_LIVE=1, it opens the
// SAME GatewayServer bridge the Claude live path uses (a real, proven, harness-
// agnostic transport — the in-harness bridge sends a ToolCallRequest over the
// socket, which is surfaced to onToolCall and blocked until respond settles it),
// then spawns the real `codex` binary, reusing the operator's own Codex
// credentials (AGP holds no API key — same posture as the Claude path).
//
// ⚠️ HONEST LIMITATION (045-AT-ADR): the bridge transport here is real and tested,
// but HOW `codex` is configured to CALL the bridge on each tool call (its hook /
// config format) is UNMEASURED — no Codex binary is available in CI / this
// environment, unlike Claude Code's measured PreToolUse hook (037-AT-ADR D4). That
// codex-side wiring is PROVISIONAL and must be validated by the operator against a
// real `codex` binary before the live path is trusted. The deterministic
// InMemoryCodexProcess — not this — is what gates the contract in CI.

import type { GatewayMessage } from "../../contracts/gateway-message.ts";
import { GatewayServer } from "../../gateway/server.ts";
import type { CodexDecision, CodexProcess, CodexToolEvent } from "./codex-process.ts";

export interface LiveCodexOptions {
  /** The task prompt handed to `codex`. */
  task: string;
  /** Working repo `codex` runs in (cwd of the spawn). */
  repoPath: string;
  /** Unix socket the in-harness bridge calls back on. */
  bridgeSocket: string;
  /** Path to the `codex` binary (default: resolved from PATH). */
  codexBin?: string;
  /** Process env (so AGP_CODEX_LIVE can be injected in tests without globals). */
  env?: Record<string, string | undefined>;
  /** Injectable launcher so the gating + argv can be unit-tested without a binary. */
  launch?: (argv: string[], cwd: string) => { exited: Promise<number>; kill: () => void };
}

/**
 * Build the argv for a non-interactive `codex` run. Pure + unit-tested. Reuses the
 * operator's Codex auth (no `--api-key`). PROVISIONAL (045-AT-ADR): `codex exec
 * <task>` is the assumed non-interactive form; confirm against a real binary.
 */
export function buildCodexArgv(opts: { task: string; codexBin?: string }): string[] {
  return [opts.codexBin ?? "codex", "exec", opts.task];
}

function defaultLaunch(argv: string[], cwd: string): { exited: Promise<number>; kill: () => void } {
  const proc = Bun.spawn(argv, { cwd, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  return { exited: proc.exited, kill: () => proc.kill() };
}

export class LiveCodexProcess implements CodexProcess {
  private readonly opts: LiveCodexOptions;
  private handler: ((ev: CodexToolEvent) => void) | null = null;
  private readonly pending = new Map<string, (msg: GatewayMessage) => void>();
  private server: GatewayServer | null = null;
  private child: { exited: Promise<number>; kill: () => void } | null = null;
  private sessionId = "";

  constructor(opts: LiveCodexOptions) {
    this.opts = opts;
  }

  private assertLive(): void {
    const env = this.opts.env ?? process.env;
    if (env.AGP_CODEX_LIVE !== "1") {
      throw new Error(
        "LiveCodexProcess: the live `codex` spawn is gated. Set AGP_CODEX_LIVE=1 to run the real Codex harness " +
          "(operator's Codex credentials required; not run in CI). The deterministic reference is InMemoryCodexProcess.",
      );
    }
  }

  /** Open the bridge socket. Does NOT spawn codex — the spawn is deferred to run()
   *  so the daemon can register onToolCall first (mirrors BunClaudeProcess). */
  async start(sessionId: string): Promise<void> {
    this.assertLive();
    this.sessionId = sessionId;
    const server = new GatewayServer({
      socketPath: this.opts.bridgeSocket,
      handler: (req) =>
        new Promise<GatewayMessage>((resolve) => {
          if (this.handler === null) {
            resolve({ kind: "error", id: req.id, sessionId: req.sessionId, message: "no gate handler registered" });
            return;
          }
          this.pending.set(req.id, resolve);
          // Surface Codex's native event shape (the bridge already normalized the
          // wire ToolCallRequest; CodexIntendant re-normalizes — the boundary is explicit).
          this.handler({ id: req.id, name: req.tool, arguments: req.args });
        }),
    });
    await server.listen();
    this.server = server;
  }

  onToolCall(handler: (ev: CodexToolEvent) => void): void {
    this.handler = handler;
  }

  respond(callId: string, decision: CodexDecision): void {
    const resolve = this.pending.get(callId);
    if (resolve === undefined) return;
    this.pending.delete(callId);
    resolve(this.toVerdict(callId, decision));
  }

  private toVerdict(callId: string, decision: CodexDecision): GatewayMessage {
    return {
      kind: "policy_verdict",
      id: callId,
      sessionId: this.sessionId,
      verdict: decision.allow
        ? { decision: "allow", reason: "approved", ruleId: null, tier: null }
        : { decision: "deny", reason: decision.reason, ruleId: null, tier: null },
    };
  }

  /** Spawn `codex` and drive it to completion. PROVISIONAL (045-AT-ADR): the codex
   *  hook config that makes the binary call the bridge per tool call is unmeasured
   *  and operator-validated; this wires the real bridge + the spawn. */
  async run(): Promise<void> {
    this.assertLive();
    const argv = buildCodexArgv({ task: this.opts.task, codexBin: this.opts.codexBin });
    const launch = this.opts.launch ?? defaultLaunch;
    this.child = launch(argv, this.opts.repoPath);
    await this.child.exited;
  }

  async stop(): Promise<void> {
    this.child?.kill();
    for (const [callId] of this.pending) {
      this.respond(callId, { allow: false, reason: "session terminated" });
    }
    await this.server?.close();
    this.server = null;
  }
}
