// `agp run` — drive an agent session through the governance loop. At v0 this is
// REFERENCE mode: a scripted sprite, recording sandbox, and console channel. It
// fails closed on a missing/invalid signing key or policy (the things it needs
// to journal and gate). Production mode (Docker sandbox + Slack channel) lands
// with Epics 07/08.

import { existsSync, readFileSync } from "node:fs";
import { resolvePaths } from "../../config.ts";
import { loadPrivateKey } from "../../runtime/crypto.ts";
import { Journal } from "../../journal/journal.ts";
import { loadPolicyEngine } from "../../policy/engine.ts";
import { RecordingSandbox } from "../../runtime/sandbox.ts";
import { ConsoleChannel } from "../../runtime/channel.ts";
import { ScriptedSprite } from "../../runtime/sprite.ts";
import { Daemon } from "../../daemon/daemon.ts";
import { DockerSandbox } from "../../sandbox/docker/docker-sandbox.ts";
import { ClaudeCodeSprite } from "../../sprites/claude-code/claude-code-sprite.ts";
import { InMemoryClaudeProcess } from "../../sprites/claude-code/claude-process.ts";
import { FsDoctorProbe } from "../probe.ts";
import type { SandboxProvider } from "../../contracts/sandbox-provider.ts";

export interface RunOptions {
  /** Which harness to drive: "scripted" reference (default) or "claude-code". */
  sprite?: string;
}

export async function runCommand(
  env: Record<string, string | undefined> = process.env,
  out: (line: string) => void = console.log,
  opts: RunOptions = {},
): Promise<number> {
  const paths = resolvePaths(env);
  const sprite = opts.sprite ?? env.AGP_SPRITE ?? "scripted";

  if (!existsSync(paths.signingKey)) {
    out(`agp run: signing key missing at ${paths.signingKey} — run \`agp keygen\`. (fail-closed)`);
    return 1;
  }
  if (!existsSync(paths.policy)) {
    out(`agp run: policy missing at ${paths.policy} — run \`agp init\`. (fail-closed)`);
    return 1;
  }

  let privateKey;
  try {
    privateKey = loadPrivateKey(readFileSync(paths.signingKey, "utf8"));
  } catch (err) {
    out(`agp run: cannot load signing key: ${(err as Error).message} (fail-closed)`);
    return 1;
  }

  let policy;
  try {
    policy = loadPolicyEngine(paths.policy);
  } catch (err) {
    out(`agp run: invalid policy: ${(err as Error).message} (fail-closed)`);
    return 1;
  }

  // Select the sandbox. Default is the recording reference; AGP_SANDBOX=docker
  // uses real namespace isolation and fails closed (never falls back to host).
  let sandbox: SandboxProvider;
  let image: string | undefined;
  if (env.AGP_SANDBOX === "docker") {
    if (!new FsDoctorProbe(env).docker().ok) {
      out("agp run: AGP_SANDBOX=docker but Docker is not available — refusing (no host fallback). (fail-closed)");
      return 1;
    }
    image = env.AGP_SANDBOX_IMAGE;
    if (!image) {
      out("agp run: AGP_SANDBOX=docker requires AGP_SANDBOX_IMAGE=<pinned image>. (fail-closed)");
      return 1;
    }
    sandbox = new DockerSandbox();
    out("agp run: DOCKER sandbox — namespace isolation (NOT VM-grade); console channel (NOT Slack).");
  } else {
    sandbox = new RecordingSandbox();
    out("agp run: REFERENCE mode — recording sandbox + console channel (NOT Docker/Slack).");
  }

  const daemon = new Daemon({
    policy,
    journal: new Journal(paths.journal, privateKey),
    sandbox,
    channel: new ConsoleChannel(env, out),
  });

  if (sprite === "claude-code") {
    // The live `claude` spawn (BunClaudeProcess) is the manual dogfood path —
    // it needs a task + repo + login session and is validated off-CI. `agp run`
    // does not yet accept those, so the live flag fails closed here; the v0
    // reference is the deterministic InMemoryClaudeProcess driven gate-only.
    if (env.AGP_CLAUDE_LIVE === "1") {
      out("agp run: live Claude Code spawn is the manual dogfood path (see 000-docs/027-AT-SPEC); not wired into `agp run` yet. (fail-closed)");
      return 1;
    }
    out("agp run: CLAUDE-CODE sprite — reference harness (InMemoryClaudeProcess), gate-only mediation (the harness executes its own tools).");
    const cc = new ClaudeCodeSprite(new InMemoryClaudeProcess());
    const result = await daemon.runLive(cc, image ? { image } : {});
    out(`\nsession ${result.sessionId} — ${result.outcomes.length} tool call(s) gated:`);
    for (const o of result.outcomes) {
      const approval = o.approved === null ? "" : ` → approval ${o.approved ? "granted" : "denied"}`;
      const effective = o.verdict.decision === "allow" || o.approved === true ? "allow" : "deny";
      out(`  ${o.request.tool}: ${o.verdict.decision}${approval} → gate ${effective}`);
    }
    out(`\njournal: ${paths.journal} — verify with \`agp verify\`.`);
    return 0;
  }

  const result = await daemon.runScripted(new ScriptedSprite(), image ? { image } : {});

  out(`\nsession ${result.sessionId} — ${result.outcomes.length} tool call(s):`);
  for (const o of result.outcomes) {
    const approval = o.approved === null ? "" : ` → approval ${o.approved ? "granted" : "denied"}`;
    out(`  ${o.request.tool}: ${o.verdict.decision}${approval}${o.executed ? " → executed" : ""}`);
  }
  out(`\njournal: ${paths.journal} — verify with \`agp verify\`.`);
  return 0;
}
