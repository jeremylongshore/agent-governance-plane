// `agp run` — drive an agent session through the governance loop. Three
// subsystem axes are selectable, each defaulting to the safe reference and
// failing closed when a production option is requested but unavailable:
//   - sandbox: recording (default) | docker      (AGP_SANDBOX=docker)
//   - intendant:  scripted (default)  | claude-code  (--intendant / AGP_INTENDANT)
//   - channel: console (default)   | slack        (AGP_CHANNEL=slack)
// The journal (signed, hash-chained) and policy engine are always production.
// `run` fails closed on a missing/invalid signing key or policy.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AgpConfig, resolvePaths, resolveSlackCreds } from "../../config.ts";
import { loadPrivateKey } from "../../runtime/crypto.ts";
import { Journal } from "../../journal/journal.ts";
import { loadPolicyEngine } from "../../policy/engine.ts";
import { RecordingSandbox } from "../../runtime/sandbox.ts";
import { ConsoleChannel } from "../../runtime/channel.ts";
import { ScriptedIntendant } from "../../runtime/intendant.ts";
import { Daemon } from "../../daemon/daemon.ts";
import { FileSessionStore } from "../../daemon/session-store.ts";
import { FileOutboxStore } from "../../daemon/outbox-store.ts";
import { OutboxRelay } from "../../daemon/outbox-relay.ts";
import { loadEd25519Verifier } from "../../verify/ed25519-verifier.ts";
import { assertNoSecretValues, EnvSecretVault } from "../../sandbox/credentials.ts";
import { DockerSandbox } from "../../sandbox/docker/docker-sandbox.ts";
import { ClaudeCodeIntendant } from "../../intendants/claude-code/claude-code-intendant.ts";
import { InMemoryClaudeProcess } from "../../intendants/claude-code/claude-process.ts";
import { BunClaudeProcess, type DockerTarget } from "../../intendants/claude-code/bun-claude-process.ts";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SlackChannel } from "../../channels/slack/slack-channel.ts";
import { FetchSlackTransport } from "../../channels/slack/transport.ts";
import { SocketModeInteractionSource } from "../../channels/slack/socket-mode.ts";
import { FetchWebSocketDialer } from "../../channels/slack/slack-dialer.ts";
import { FsDoctorProbe } from "../probe.ts";
import type { SandboxProvider } from "../../contracts/sandbox-provider.ts";
import type { ChannelAdapter } from "../../contracts/channel-adapter.ts";

export interface RunOptions {
  /** Which harness to drive: "scripted" reference (default) or "claude-code". */
  intendant?: string;
  /** (live claude) the task prompt to fix; requires AGP_CLAUDE_LIVE=1. */
  task?: string;
  /** (live claude) the repo `claude` runs in. */
  repo?: string;
}

export async function runCommand(
  env: Record<string, string | undefined> = process.env,
  out: (line: string) => void = console.log,
  opts: RunOptions = {},
): Promise<number> {
  const paths = resolvePaths(env);
  const intendant = opts.intendant ?? env.AGP_INTENDANT ?? "scripted";

  if (!existsSync(paths.signingKey)) {
    out(`agp run: signing key missing at ${paths.signingKey} — run \`agp keygen\`. (fail-closed)`);
    return 1;
  }
  if (!existsSync(paths.policy)) {
    out(`agp run: policy missing at ${paths.policy} — run \`agp init\`. (fail-closed)`);
    return 1;
  }

  let privateKey: ReturnType<typeof loadPrivateKey>;
  try {
    privateKey = loadPrivateKey(readFileSync(paths.signingKey, "utf8"));
  } catch (err) {
    out(`agp run: cannot load signing key: ${(err as Error).message} (fail-closed)`);
    return 1;
  }

  let policy: ReturnType<typeof loadPolicyEngine>;
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
    out("agp run: DOCKER sandbox — namespace isolation (NOT VM-grade).");
  } else {
    sandbox = new RecordingSandbox();
    out("agp run: recording sandbox (reference — runs nothing; set AGP_SANDBOX=docker for real isolation).");
  }

  // Known secret values to screen outbound surfaces against (defense-in-depth):
  // AGP's vault secrets + the model auth. AGP already keeps values out of the
  // journal/channel by construction (it records tool names + decisions, never args
  // or values); this set makes that invariant fail-closed so a future change that
  // adds a value-bearing field can't silently leak a credential.
  const knownSecrets = (extra: readonly string[] = []): string[] => {
    const set = new Set<string>();
    for (const v of new EnvSecretVault(env).values()) set.add(v);
    if (env.ANTHROPIC_API_KEY) set.add(env.ANTHROPIC_API_KEY);
    for (const e of extra) if (e.length > 0) set.add(e);
    return [...set];
  };

  // The signed, hash-chained journal is authoritative and always production.
  const journalSecrets = knownSecrets();
  const journal = new Journal(paths.journal, privateKey, undefined, (event) =>
    assertNoSecretValues(event, journalSecrets, "journal"),
  );

  // Select the channel. Default is the console reference (fail-closed deny with
  // no human present). AGP_CHANNEL=slack selects production Slack HITL: it posts
  // approval requests AND needs the Socket Mode receiver to read Allow/Deny
  // clicks. The live socket is the off-CI dogfood path (like AGP_DOCKER_E2E /
  // AGP_CLAUDE_LIVE), gated behind AGP_SLACK_LIVE — without it we refuse to post
  // a prompt nothing can answer.
  let channel: ChannelAdapter;
  let receiver: SocketModeInteractionSource | undefined;
  if (env.AGP_CHANNEL === "slack") {
    const slack = new FsDoctorProbe(env).slack();
    if (!slack.ok) {
      out(`agp run: AGP_CHANNEL=slack but ${slack.detail}. (fail-closed)`);
      return 1;
    }
    if (env.AGP_SLACK_LIVE !== "1") {
      out(
        "agp run: AGP_CHANNEL=slack but AGP_SLACK_LIVE!=1 — the live Socket Mode click receiver is the off-CI dogfood path; refusing to post a prompt nothing can answer. (fail-closed)",
      );
      return 1;
    }
    // Safe operator-config load: a missing/malformed file resolves to {} (creds
    // may still come from env), mirroring the doctor probe's tolerance.
    let cfg: AgpConfig = {};
    if (existsSync(paths.config)) {
      try {
        cfg = JSON.parse(readFileSync(paths.config, "utf8")) as AgpConfig;
      } catch {
        cfg = {};
      }
    }
    const creds = resolveSlackCreds(env, cfg);
    receiver = new SocketModeInteractionSource({
      appToken: creds.appToken,
      dialer: new FetchWebSocketDialer(),
      onRejected: (r) =>
        journal.append({
          kind: "approval.rejected",
          actor: "session_owner",
          payload: { reason: r.reason, nonce: r.nonce, decidedBy: r.userId ?? null },
        }),
    });
    await receiver.start();
    const slackSecrets = knownSecrets([creds.botToken, creds.appToken]);
    channel = new SlackChannel({
      transport: new FetchSlackTransport(creds.botToken),
      interactions: receiver,
      channelId: creds.channelId,
      screen: (payload) => assertNoSecretValues(payload, slackSecrets, "slack"),
    });
    out("agp run: AGP_CHANNEL=slack — live Socket Mode receiver connected.");
  } else {
    channel = new ConsoleChannel(env, out);
  }

  // Durable session ownership (agp-4na.2): a fenced lease per session + a
  // startup recovery sweep that reaps sessions orphaned by a daemon crash.
  const sessionStore = new FileSessionStore(join(paths.home, "sessions.json"));
  // Supply-chain identity gate (agp-z26.4 / 043-AT-ADR). Default `off` (the single
  // CCSC intendant); AGP_IDENTITY_MODE=warn|enforce verifies an intendant's signed
  // manifest against the trust anchor. Signed-manifest delivery for built-in
  // intendants lands with the second harness (Epic 12); until then enforce
  // fail-closes any session lacking verification material.
  const identityMode =
    env.AGP_IDENTITY_MODE === "warn" || env.AGP_IDENTITY_MODE === "enforce" ? env.AGP_IDENTITY_MODE : "off";
  const verifier = loadEd25519Verifier(join(paths.home, "intendants", "ed25519.pub"));
  const daemon = new Daemon({ policy, journal, sandbox, channel, sessionStore, verifier, identityMode });
  const reaped = daemon.recoverSessions();
  if (reaped.length > 0) {
    out(`agp run: recovered — reaped ${reaped.length} orphaned session(s) from a prior crash (journaled).`);
  }

  // Durable channel delivery (agp-4na.3): a transactional outbox so best-effort
  // projections survive a restart. Drain redelivers obligations enqueued before a
  // prior crash; projection stays non-authoritative (the journal is the truth).
  const outbox = new OutboxRelay(channel, new FileOutboxStore(join(paths.home, "outbox.json")));
  const drained = await outbox.drain();
  if (drained.delivered > 0) {
    out(`agp run: outbox — redelivered ${drained.delivered} channel projection(s) held over a restart.`);
  }

  if (intendant === "claude-code") {
    // Live path (AGP_CLAUDE_LIVE=1): spawn the real `claude` on a task + repo and
    // gate every tool call via the PreToolUse hook bridge → session socket →
    // daemon.gate (000-docs/037-AT-ADR). Off-CI by design. Without the flag, the
    // deterministic InMemoryClaudeProcess reference drives the same gate loop.
    let cc: ClaudeCodeIntendant;
    if (env.AGP_CLAUDE_LIVE === "1") {
      const task = opts.task ?? env.AGP_TASK;
      const repo = opts.repo ?? env.AGP_REPO;
      if (!task || !repo) {
        out("agp run: AGP_CLAUDE_LIVE=1 requires --task <prompt> and --repo <path> (or AGP_TASK / AGP_REPO). (fail-closed)");
        return 1;
      }
      // The socket lives in its own dir so Topology B can bind-mount that dir
      // into the container (the in-container bridge reaches the host gate there).
      const socketDir = join(tmpdir(), `agp-${randomUUID()}`);
      mkdirSync(socketDir, { recursive: true });
      const socketPath = join(socketDir, "gate.sock");

      let docker: DockerTarget | undefined;
      if (env.AGP_CLAUDE_SANDBOX === "docker") {
        // Topology B (037-AT-ADR): claude runs in a network-enabled container.
        const image = env.AGP_CLAUDE_SANDBOX_IMAGE ?? env.AGP_SANDBOX_IMAGE;
        if (!image) {
          out("agp run: AGP_CLAUDE_SANDBOX=docker requires AGP_CLAUDE_SANDBOX_IMAGE=<pinned image>. (fail-closed)");
          return 1;
        }
        const agpRepoPath = fileURLToPath(new URL("../../..", import.meta.url));
        docker = { image, agpRepoPath, apiKey: env.ANTHROPIC_API_KEY, networkEnabled: true };
        out(`agp run: CLAUDE-CODE LIVE (Topology B) — claude in container ${image} on ${repo}; tool calls gated via ${socketPath} (full egress — see 037-AT-ADR).`);
      } else {
        out(`agp run: CLAUDE-CODE LIVE — spawning real claude on the host in ${repo}; every tool call gated via ${socketPath}.`);
      }
      cc = new ClaudeCodeIntendant(new BunClaudeProcess({ task, repoPath: repo, bridgeSocket: socketPath, env, docker }));
    } else {
      out("agp run: CLAUDE-CODE intendant — reference harness (InMemoryClaudeProcess), gate-only mediation (the harness executes its own tools).");
      cc = new ClaudeCodeIntendant(new InMemoryClaudeProcess());
    }
    const result = await daemon.runLive(cc, image ? { image } : {});
    await outbox.project("session.ended", `session ${result.sessionId}: ${result.outcomes.length} gated tool call(s)`);
    await receiver?.stop();
    out(`\nsession ${result.sessionId} — ${result.outcomes.length} tool call(s) gated:`);
    for (const o of result.outcomes) {
      const approval = o.approved === null ? "" : ` → approval ${o.approved ? "granted" : "denied"}`;
      const effective = o.verdict.decision === "allow" || o.approved === true ? "allow" : "deny";
      out(`  ${o.request.tool}: ${o.verdict.decision}${approval} → gate ${effective}`);
    }
    out(`\njournal: ${paths.journal} — verify with \`agp verify\`.`);
    return 0;
  }

  const result = await daemon.runScripted(new ScriptedIntendant(), image ? { image } : {});
  await outbox.project("session.ended", `session ${result.sessionId}: ${result.outcomes.length} tool call(s)`);
  await receiver?.stop();

  out(`\nsession ${result.sessionId} — ${result.outcomes.length} tool call(s):`);
  for (const o of result.outcomes) {
    const approval = o.approved === null ? "" : ` → approval ${o.approved ? "granted" : "denied"}`;
    out(`  ${o.request.tool}: ${o.verdict.decision}${approval}${o.executed ? " → executed" : ""}`);
  }
  out(`\njournal: ${paths.journal} — verify with \`agp verify\`.`);
  return 0;
}
