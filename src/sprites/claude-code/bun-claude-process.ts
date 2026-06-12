// BunClaudeProcess — the REAL ClaudeProcess: it spawns the operator's `claude`
// binary (reusing their login session; no Anthropic API key) and bridges its
// PreToolUse hook to AGP's gate over the session Unix socket. This is the dogfood
// path for "run AGP on a real CCSC bug fix" (Epic 06, agp-3g0).
//
// ⚠️ GATED. The real `claude` spawn cannot run in CI (login session + interactive
// model calls), so — like the Docker E2E path behind AGP_DOCKER_E2E — it is gated
// behind AGP_CLAUDE_LIVE=1. The pure builders (settings + argv) and the
// socket↔gate correlation are unit-tested; the live spawn is validated off-CI.
//
// Topology + the measured PreToolUse hook contract: 000-docs/037-AT-ADR.
// Flow per tool call:
//   claude PreToolUse hook → `agp bridge` (the hook command) → session Unix socket
//   → this GatewayServer → onPreToolUse → ClaudeCodeSprite → daemon.gate
//   → respond() → socket reply → bridge exits 0 (allow) / 2 (deny) → claude obeys.

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GatewayMessage } from "../../contracts/gateway-message.ts";
import { GatewayServer } from "../../gateway/server.ts";
import type { ClaudeProcess, HookDecision, PreToolUseEvent } from "./claude-process.ts";

export interface BunClaudeOptions {
  /** The task prompt handed to `claude` (e.g. "fix the failing test in foo.ts"). */
  task: string;
  /** Working repo `claude` runs in (cwd of the spawn). */
  repoPath: string;
  /** Path to the `claude` binary (default: resolved from PATH). */
  claudeBin?: string;
  /** Unix socket the PreToolUse bridge calls back on. */
  bridgeSocket: string;
  /** Process env (so AGP_CLAUDE_LIVE can be injected in tests without globals). */
  env?: Record<string, string | undefined>;
  /**
   * Launcher for the `claude` subprocess — injectable so the socket↔gate
   * correlation can be unit-tested without a real binary. Defaults to Bun.spawn.
   */
  launch?: (argv: string[], cwd: string) => { exited: Promise<number>; kill: () => void };
}

/** A PreToolUse hook entry for Claude Code's settings file. */
export interface HookSettings {
  hooks: {
    PreToolUse: Array<{ matcher: string; hooks: Array<{ type: "command"; command: string }> }>;
  };
}

/**
 * Build the Claude Code settings that route every tool call through the AGP
 * bridge. Pure + unit-tested — this is the drift-prone surface.
 */
export function buildHookSettings(bridgeCommand: string): HookSettings {
  return {
    hooks: {
      // "*" matches every tool: nothing reaches execution without passing the gate.
      PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: bridgeCommand }] }],
    },
  };
}

/**
 * Build the argv for the non-interactive `claude` invocation. Pure + unit-tested.
 * Uses the operator's login session (no `--api-key`); `--settings` injects the
 * PreToolUse bridge; the task is the prompt.
 */
export function buildClaudeArgs(opts: { task: string; settingsPath: string; claudeBin?: string }): string[] {
  return [opts.claudeBin ?? "claude", "--settings", opts.settingsPath, "--permission-mode", "default", "--print", opts.task];
}

/**
 * Build the shell command Claude runs for each PreToolUse hook: the `agp bridge`
 * subcommand, pointed at the session socket. Resolves the CLI entry next to this
 * module so it works without an installed `agp` binary.
 */
export function buildBridgeCommand(socketPath: string, execPath: string = process.execPath): string {
  const cliEntry = fileURLToPath(new URL("../../cli/index.ts", import.meta.url));
  return `"${execPath}" "${cliEntry}" bridge --socket "${socketPath}"`;
}

export class BunClaudeProcess implements ClaudeProcess {
  private readonly opts: BunClaudeOptions;
  private handler: ((ev: PreToolUseEvent) => void) | null = null;
  /** Pending socket replies, keyed by callId (= tool_use_id), resolved by respond(). */
  private readonly pending = new Map<string, (msg: GatewayMessage) => void>();
  private server: GatewayServer | null = null;
  private child: { exited: Promise<number>; kill: () => void } | null = null;
  private sessionId = "";

  constructor(opts: BunClaudeOptions) {
    this.opts = opts;
  }

  private assertLive(): void {
    const env = this.opts.env ?? process.env;
    if (env.AGP_CLAUDE_LIVE !== "1") {
      throw new Error(
        "BunClaudeProcess: the live `claude` spawn is gated. Set AGP_CLAUDE_LIVE=1 to dogfood on a real " +
          "harness (login session required; not run in CI). The deterministic reference is InMemoryClaudeProcess.",
      );
    }
  }

  /** Open the session socket + write the hook settings. Does NOT spawn claude —
   *  the spawn is deferred to run() so the daemon can register onToolCall first. */
  async start(sessionId: string): Promise<void> {
    this.assertLive();
    this.sessionId = sessionId;

    const server = new GatewayServer({
      socketPath: this.opts.bridgeSocket,
      handler: (req) =>
        new Promise<GatewayMessage>((resolve) => {
          if (this.handler === null) {
            // No sprite handler wired → fail closed.
            resolve({ kind: "error", id: req.id, sessionId: req.sessionId, message: "no gate handler registered" });
            return;
          }
          this.pending.set(req.id, resolve);
          this.handler({ callId: req.id, tool: req.tool, args: req.args });
        }),
    });
    await server.listen();
    this.server = server;
  }

  onPreToolUse(handler: (ev: PreToolUseEvent) => void): void {
    this.handler = handler;
  }

  respond(callId: string, decision: HookDecision): void {
    const resolve = this.pending.get(callId);
    if (resolve === undefined) return; // already settled / unknown call
    this.pending.delete(callId);
    resolve(this.toVerdict(callId, decision));
  }

  private toVerdict(callId: string, decision: HookDecision): GatewayMessage {
    return {
      kind: "policy_verdict",
      id: callId,
      sessionId: this.sessionId,
      verdict: decision.allow
        ? { decision: "allow", reason: "approved", ruleId: null, tier: null }
        : { decision: "deny", reason: decision.reason, ruleId: null, tier: null },
    };
  }

  /** Spawn `claude` and drive it to completion. Each tool call blocks in its
   *  PreToolUse hook until the gate responds — real back-pressure. */
  async run(): Promise<void> {
    this.assertLive();
    const settingsPath = join(tmpdir(), `agp-${this.sessionId}-settings.json`);
    const bridgeCommand = buildBridgeCommand(this.opts.bridgeSocket);
    writeFileSync(settingsPath, JSON.stringify(buildHookSettings(bridgeCommand), null, 2));

    const argv = buildClaudeArgs({ task: this.opts.task, settingsPath, claudeBin: this.opts.claudeBin });
    const launch = this.opts.launch ?? defaultLaunch;
    this.child = launch(argv, this.opts.repoPath);
    await this.child.exited;
  }

  async stop(): Promise<void> {
    this.child?.kill();
    // Fail closed: deny any still-pending hook so a blocked bridge unblocks.
    for (const [callId] of this.pending) {
      this.respond(callId, { allow: false, reason: "session terminated" });
    }
    await this.server?.close();
    this.server = null;
  }
}

/** Real subprocess launcher (Bun.spawn). Stdout/stderr inherit so the operator
 *  watches the live run; stdin is ignored (non-interactive --print). */
function defaultLaunch(argv: string[], cwd: string): { exited: Promise<number>; kill: () => void } {
  const proc = Bun.spawn(argv, { cwd, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  return { exited: proc.exited, kill: () => proc.kill() };
}
