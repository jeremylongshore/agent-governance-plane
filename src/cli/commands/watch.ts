// `agp watch` — the Slice-0 governed GitHub watcher (agp-eva.1.5; intent-os
// 030-AT-DECR). The cadence lives in the OS: cron (the notify-lib spine) calls
// `agp watch run --spec <file>` per tick; each tick is one TriggerEvent through
// the frozen trigger-source contract, one mediated session through the daemon,
// and one signed-journal segment bracketed by `trigger.fired` / `trigger.settled`
// events that carry the cross-chain causal pointer (correlationId + the state
// log's knowledge tip hash).
//
//   run     one poll tick: spec (human-committed, enabled) → failure-bound check
//           → TriggerEvent → runMediated (read=allow, act=require+HITL) → state
//   status  liveness dead-man's-switch: exit 1 when the source is STALE
//           (silent past livenessTimeoutMs), chain-verify the state log
//   enable  human re-commit after a restart-intensity refusal: verifies the spec
//           and appends an `enable` state entry (resets the failure streak)
//
// Wiring mirrors `agp run` and fails closed the same ways: missing signing key /
// policy refuses; AGP_SANDBOX=docker refuses without Docker + pinned image;
// AGP_CHANNEL=slack refuses without live Socket Mode. Reference mode (recording
// sandbox) executes nothing, so a reference read parses nothing and the run
// records an HONEST failure — proving the fail-closed path, not pretending.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type AgpConfig, resolvePaths, resolveSlackCreds } from "../../config.ts";
import { loadPrivateKey } from "../../runtime/crypto.ts";
import { Journal } from "../../journal/journal.ts";
import { loadPolicyEngine } from "../../policy/engine.ts";
import { RecordingSandbox } from "../../runtime/sandbox.ts";
import { ConsoleChannel } from "../../runtime/channel.ts";
import { Daemon } from "../../daemon/daemon.ts";
import { FileSessionStore } from "../../daemon/session-store.ts";
import { FileOutboxStore } from "../../daemon/outbox-store.ts";
import { OutboxRelay } from "../../daemon/outbox-relay.ts";
import { loadEd25519Verifier } from "../../verify/ed25519-verifier.ts";
import { defaultTenantContext } from "../../tenants/tenant.ts";
import { assertNoSecretValues, EnvSecretVault } from "../../sandbox/credentials.ts";
import { DockerSandbox } from "../../sandbox/docker/docker-sandbox.ts";
import { SlackChannel } from "../../channels/slack/slack-channel.ts";
import { FetchSlackTransport } from "../../channels/slack/transport.ts";
import { SocketModeInteractionSource } from "../../channels/slack/socket-mode.ts";
import { FetchWebSocketDialer } from "../../channels/slack/slack-dialer.ts";
import { FsDoctorProbe } from "../probe.ts";
import type { SandboxProvider } from "../../contracts/sandbox-provider.ts";
import type { ChannelAdapter } from "../../contracts/channel-adapter.ts";
import type { TriggerEvent, TriggerSourceSpec } from "../../contracts/trigger-source.ts";
import { loadWatcherSpec, type WatcherSpec } from "../../triggers/github-watcher/watcher-spec.ts";
import { verifyStateLog, WatcherStateLog } from "../../triggers/github-watcher/state-log.ts";
import { OneShotPollSource } from "../../triggers/github-watcher/one-shot-poll-source.ts";
import { GithubWatcherIntendant } from "../../triggers/github-watcher/watcher-intendant.ts";

export interface WatchOptions {
  /** Path to the committed watcher spec (required for every subcommand). */
  spec?: string;
}

function statePathFor(home: string, spec: WatcherSpec): string {
  return join(home, "watch", `${spec.id}.state.jsonl`);
}

function toSourceSpec(spec: WatcherSpec): TriggerSourceSpec {
  return {
    id: spec.id,
    kind: "poll",
    enabled: spec.enabled,
    livenessTimeoutMs: spec.livenessTimeoutMs,
    config: { repo: spec.repo, watch: spec.watch },
  };
}

/** Load the spec fail-closed; returns null after printing the refusal. */
function loadSpecOrRefuse(
  specPath: string | undefined,
  sub: string,
  out: (line: string) => void,
): WatcherSpec | null {
  if (!specPath) {
    out(`agp watch ${sub}: --spec <path> is required. (fail-closed)`);
    return null;
  }
  try {
    return loadWatcherSpec(specPath);
  } catch (err) {
    out(`agp watch ${sub}: ${(err as Error).message} (fail-closed)`);
    return null;
  }
}

export async function watchCommand(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  out: (line: string) => void = console.log,
): Promise<number> {
  const sub = argv[0];
  const si = argv.indexOf("--spec");
  const specPath = si >= 0 ? argv[si + 1] : undefined;
  const paths = resolvePaths(env);

  if (sub === "status") {
    const spec = loadSpecOrRefuse(specPath, "status", out);
    if (!spec) return 1;
    const statePath = statePathFor(paths.home, spec);
    const state = new WatcherStateLog(statePath);
    const chainErrors = verifyStateLog(statePath);
    const lastRunAt = state.lastRunAt();
    const failures = state.consecutiveFailures();
    out(`source ${spec.id} (${spec.watch} on ${spec.repo})`);
    out(`  enabled:              ${spec.enabled}`);
    out(`  last run:             ${lastRunAt ?? "never"}`);
    out(`  consecutive failures: ${failures}/${spec.maxConsecutiveFailures}`);
    out(`  knowledge chain:      ${chainErrors.length === 0 ? `intact (tip ${state.tipHash() ?? "none"})` : "BROKEN"}`);
    for (const e of chainErrors) out(`    ${e}`);
    if (chainErrors.length > 0) return 1;
    if (spec.livenessTimeoutMs !== null && lastRunAt !== null) {
      const silentMs = Date.now() - Date.parse(lastRunAt);
      if (silentMs > spec.livenessTimeoutMs) {
        out(`  liveness:             STALE — silent ${Math.round(silentMs / 1000)}s > ${Math.round(spec.livenessTimeoutMs / 1000)}s (dead-man's-switch)`);
        return 1;
      }
      out(`  liveness:             ok (silent ${Math.round(silentMs / 1000)}s of ${Math.round(spec.livenessTimeoutMs / 1000)}s allowed)`);
    } else if (spec.livenessTimeoutMs !== null) {
      out("  liveness:             STALE — never run but cadence-bound");
      return 1;
    }
    return 0;
  }

  if (sub === "enable") {
    const spec = loadSpecOrRefuse(specPath, "enable", out);
    if (!spec) return 1;
    const state = new WatcherStateLog(statePathFor(paths.home, spec));
    const before = state.consecutiveFailures();
    state.append("enable", { by: env.USER ?? "operator", specId: spec.id });
    out(`source ${spec.id}: enable recorded — failure streak reset (was ${before}, now ${state.consecutiveFailures()}).`);
    out(spec.enabled ? "spec is enabled; next `agp watch run` will poll." : "NOTE: spec file still has enabled:false — edit it to run. (fail-closed)");
    return 0;
  }

  if (sub !== "run") {
    out("agp watch: unknown subcommand — use `agp watch run|status|enable --spec <path>`.");
    return 1;
  }

  // ---- agp watch run ----
  const spec = loadSpecOrRefuse(specPath, "run", out);
  if (!spec) return 1;
  if (!spec.enabled) {
    out(`agp watch run: spec '${spec.id}' has enabled:false — a disabled source never fires. (fail-closed)`);
    return 1;
  }
  if (!existsSync(paths.signingKey)) {
    out(`agp watch run: signing key missing at ${paths.signingKey} — run \`agp keygen\`. (fail-closed)`);
    return 1;
  }
  if (!existsSync(paths.policy)) {
    out(`agp watch run: policy missing at ${paths.policy} — run \`agp init\`. (fail-closed)`);
    return 1;
  }

  let privateKey: ReturnType<typeof loadPrivateKey>;
  try {
    privateKey = loadPrivateKey(readFileSync(paths.signingKey, "utf8"));
  } catch (err) {
    out(`agp watch run: cannot load signing key: ${(err as Error).message} (fail-closed)`);
    return 1;
  }
  let policy: ReturnType<typeof loadPolicyEngine>;
  try {
    policy = loadPolicyEngine(paths.policy);
  } catch (err) {
    out(`agp watch run: invalid policy: ${(err as Error).message} (fail-closed)`);
    return 1;
  }

  // Restart-intensity bound (invariant 2): a source that keeps failing REFUSES
  // to run again until a human re-enables — escalate, don't crash-loop.
  const statePath = statePathFor(paths.home, spec);
  const state = new WatcherStateLog(statePath);
  const failures = state.consecutiveFailures();
  if (failures >= spec.maxConsecutiveFailures) {
    out(
      `agp watch run: source '${spec.id}' has ${failures} consecutive failures (bound ${spec.maxConsecutiveFailures}) — REFUSING until a human runs \`agp watch enable --spec ${specPath}\`. (restart-intensity bound)`,
    );
    return 3;
  }

  // Sandbox: recording reference (executes nothing) or real Docker isolation.
  let sandbox: SandboxProvider;
  let image: string | undefined;
  let networkEnabled = false;
  if (env.AGP_SANDBOX === "docker") {
    if (!new FsDoctorProbe(env).docker().ok) {
      out("agp watch run: AGP_SANDBOX=docker but Docker is not available — refusing (no host fallback). (fail-closed)");
      return 1;
    }
    image = env.AGP_SANDBOX_IMAGE;
    if (!image) {
      out("agp watch run: AGP_SANDBOX=docker requires AGP_SANDBOX_IMAGE=<pinned image with gh>. (fail-closed)");
      return 1;
    }
    sandbox = new DockerSandbox();
    networkEnabled = true; // the proxy-executed `gh` calls need api.github.com
    out("agp watch run: DOCKER sandbox — namespace isolation, egress enabled for gh (NOT VM-grade).");
  } else {
    sandbox = new RecordingSandbox();
    out("agp watch run: recording sandbox (reference — executes nothing; the read will record an HONEST failure).");
  }

  const vault = new EnvSecretVault(env);
  const knownSecrets = (extra: readonly string[] = []): string[] => {
    const set = new Set<string>();
    for (const v of vault.values()) set.add(v);
    for (const e of extra) if (e.length > 0) set.add(e);
    return [...set];
  };
  const journal = new Journal(paths.journal, privateKey, undefined, (event) =>
    assertNoSecretValues(event, knownSecrets(), "journal"),
  );

  // Channel: console reference (fail-closed deny with no human) or live Slack.
  let channel: ChannelAdapter;
  let receiver: SocketModeInteractionSource | undefined;
  if (env.AGP_CHANNEL === "slack") {
    const slack = new FsDoctorProbe(env).slack();
    if (!slack.ok) {
      out(`agp watch run: AGP_CHANNEL=slack but ${slack.detail}. (fail-closed)`);
      return 1;
    }
    if (env.AGP_SLACK_LIVE !== "1") {
      out(
        "agp watch run: AGP_CHANNEL=slack but AGP_SLACK_LIVE!=1 — refusing to post a prompt nothing can answer. (fail-closed)",
      );
      return 1;
    }
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
    out("agp watch run: AGP_CHANNEL=slack — live Socket Mode receiver connected.");
  } else {
    channel = new ConsoleChannel(env, out);
  }

  const sessionStore = new FileSessionStore(join(paths.home, "sessions.json"));
  const identityMode =
    env.AGP_IDENTITY_MODE === "warn" || env.AGP_IDENTITY_MODE === "enforce" ? env.AGP_IDENTITY_MODE : "off";
  const verifier = loadEd25519Verifier(join(paths.home, "intendants", "ed25519.pub"));
  const daemon = new Daemon({
    policy,
    journal,
    sandbox,
    channel,
    vault,
    sessionStore,
    verifier,
    identityMode,
    tenantContext: defaultTenantContext(),
  });
  const reaped = daemon.recoverSessions();
  if (reaped.length > 0) {
    out(`agp watch run: recovered — reaped ${reaped.length} orphaned session(s) from a prior crash (journaled).`);
  }
  const outbox = new OutboxRelay(channel, new FileOutboxStore(join(paths.home, "outbox.json")));
  await outbox.drain();

  // One tick through the frozen trigger-source contract.
  const source = new OneShotPollSource({
    sourceSpec: toSourceSpec(spec),
    lastEventAt: state.lastRunAt(),
    restartCount: failures,
  });
  let fired: TriggerEvent | null = null;
  await source.start(async (event) => {
    fired = event;
  });
  await source.stop();
  if (!fired) {
    out("agp watch run: source did not fire (disabled). (fail-closed)");
    return 1;
  }
  const event: TriggerEvent = fired;

  // Cross-chain causal pointer (invariant 1): the shared correlationId + the
  // knowledge chain's tip hash AT DECISION TIME, in the signed action journal.
  journal.append({
    kind: "trigger.fired",
    actor: "session_owner",
    payload: {
      triggerId: event.triggerId,
      source: event.source,
      kind: event.kind,
      correlationId: event.correlationId,
      knowledgeTipHash: state.tipHash(),
    },
  });

  const intendant = new GithubWatcherIntendant(spec, state, event.correlationId);
  const result = await daemon.runMediated(intendant, { ...(image ? { image } : {}), networkEnabled });
  const s = intendant.summary;

  // Record the run in the knowledge chain (heartbeat + failure accounting) and
  // close the journal bracket with the post-run tip.
  state.append("run", {
    correlationId: event.correlationId,
    ok: s.readOk,
    reason: s.failureReason,
    candidates: s.candidates,
    newCount: s.newKeys.length,
    actioned: s.actioned.length,
    suppressed: s.suppressed.length,
  });
  journal.append({
    kind: "trigger.settled",
    actor: "session_owner",
    payload: {
      correlationId: event.correlationId,
      sessionId: result.sessionId,
      ok: s.readOk,
      reason: s.failureReason,
      candidates: s.candidates,
      newKeys: s.newKeys,
      actioned: s.actioned,
      suppressed: s.suppressed,
      knowledgeTipHash: state.tipHash(),
    },
  });
  await outbox.project(
    "trigger.settled",
    `watch ${spec.id}: ${s.readOk ? `${s.newKeys.length} new / ${s.actioned.length} actioned / ${s.suppressed.length} suppressed` : `FAILED — ${s.failureReason}`}`,
  );
  await receiver?.stop();

  out(`\nwatch ${spec.id} — session ${result.sessionId} (correlation ${event.correlationId}):`);
  for (const o of result.outcomes) {
    const approval = o.approved === null ? "" : ` → approval ${o.approved ? "granted" : "denied"}`;
    out(`  ${o.request.tool}: ${o.verdict.decision}${approval}${o.executed ? " → executed" : ""}`);
  }
  if (s.readOk) {
    out(`read ok — ${s.candidates} candidate(s), ${s.newKeys.length} new, ${s.actioned.length} actioned, ${s.suppressed.length} suppressed.`);
  } else {
    const now = state.consecutiveFailures();
    out(`run FAILED (${s.failureReason}) — consecutive failures ${now}/${spec.maxConsecutiveFailures}.`);
  }
  out(`journal: ${paths.journal} — verify with \`agp verify\`. state: ${statePath}`);
  return s.readOk ? 0 : 2;
}
