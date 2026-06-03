// BunClaudeProcess — the REAL ClaudeProcess: it spawns the operator's `claude`
// binary (reusing their login session; no Anthropic API key) and bridges its
// PreToolUse hook to AGP's gate. This is the dogfood path for "Jeremy runs AGP
// on a real CCSC bug fix."
//
// ⚠️ GATED + UNVERIFIED-IN-CI. Spawning a real, interactive, login-authenticated
// harness cannot run in CI, so — exactly like the Docker E2E test gated behind
// AGP_DOCKER_E2E — the spawn here is gated behind AGP_CLAUDE_LIVE=1. What IS
// unit-tested are the pure builders below (the hook settings + argv), which is
// the part that can drift silently. The live spawn is validated manually on the
// operator's machine (tracked as the open dogfood child of Epic 06).
//
// PreToolUse-hook bridge design (what the live path wires):
//   1. AGP writes a settings file with a PreToolUse hook whose command is a tiny
//      bridge that, for each tool call, POSTs {callId,tool,args} to AGP over the
//      session Unix socket (blueprint §3.1 topology) and blocks for the verdict.
//   2. The bridge translates the verdict into the hook's allow/deny exit
//      protocol: allow → exit 0; deny → emit the block JSON with the reason.
//   3. `claude` runs inside the Docker sandbox with the task prompt; AGP never
//      sees the Anthropic credential and never proxy-executes a tool.

import type { ClaudeProcess, HookDecision, PreToolUseEvent } from "./claude-process.ts";

export interface BunClaudeOptions {
  /** The task prompt handed to `claude` (e.g. "fix the failing test in foo.ts"). */
  task: string;
  /** Working repo mounted into the sandbox. */
  repoPath: string;
  /** Path to the `claude` binary (default: resolved from PATH). */
  claudeBin?: string;
  /** Unix socket the PreToolUse bridge calls back on. */
  bridgeSocket: string;
  /** Process env (so AGP_CLAUDE_LIVE can be injected in tests without globals). */
  env?: Record<string, string | undefined>;
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
  return [opts.claudeBin ?? "claude", "--settings", opts.settingsPath, "--print", opts.task];
}

export class BunClaudeProcess implements ClaudeProcess {
  private readonly opts: BunClaudeOptions;
  private handler: ((ev: PreToolUseEvent) => void) | null = null;

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

  async start(_sessionId: string): Promise<void> {
    this.assertLive();
    // Live spawn (operator machine only): write buildHookSettings()+buildClaudeArgs(),
    // open the bridge socket, Bun.spawn `claude` in the Docker sandbox. Validated
    // manually per the Epic-06 dogfood child bead, not in CI.
    throw new Error("BunClaudeProcess: live spawn not yet wired — see 000-docs/027-AT-SPEC §Live path.");
  }

  onPreToolUse(handler: (ev: PreToolUseEvent) => void): void {
    this.handler = handler;
  }

  respond(_callId: string, _decision: HookDecision): void {
    this.assertLive();
    throw new Error("BunClaudeProcess: live bridge not yet wired.");
  }

  async run(): Promise<void> {
    this.assertLive();
    throw new Error("BunClaudeProcess: live spawn not yet wired.");
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }
}
