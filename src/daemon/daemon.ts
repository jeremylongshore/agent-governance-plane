// Daemon — the AGP control-plane orchestration. For each tool call a intendant
// attempts, it runs the governance loop:
//
//   policy gate → (if `require`) channel HITL → signed journal → sandbox exec
//   → journal result → deliver result/verdict back to the intendant
//
// `mediate` is generic over the contract interfaces and is the heavily-tested
// core. `runScripted` is reference glue that drives the ScriptedIntendant for
// `agp run`. Subsystem epics swap in production impls without touching this loop.

import { randomUUID } from "node:crypto";
import type { ToolCallRequest } from "../contracts/gateway-message.ts";
import { PolicyVerdict } from "../contracts/policy-verdict.ts";
import type { SandboxHandle, SandboxProvider } from "../contracts/sandbox-provider.ts";
import type { ChannelAdapter } from "../contracts/channel-adapter.ts";
import type { IntendantAdapter, IntendantIdentity } from "../contracts/intendant-adapter.ts";
import type { IntendantManifest } from "../contracts/intendant-manifest.ts";
import type { Verifier } from "../contracts/verifier.ts";
import { assertTenantContext, defaultTenantContext, type TenantContext } from "../tenants/tenant.ts";
import type { Journal } from "../journal/journal.ts";
import type { PolicyEngine } from "../policy/engine.ts";
import type { ScriptedIntendant } from "../runtime/intendant.ts";
import type { SessionLease } from "../contracts/session-lease.ts";
import type { SessionStore } from "./session-store.ts";
import {
  type SecretVault,
  findPlaceholders,
  redactSecrets,
  resolvePlaceholders,
  resolvedSecretValues,
} from "../sandbox/credentials.ts";

export interface DaemonDeps {
  policy: PolicyEngine;
  journal: Journal;
  sandbox: SandboxProvider;
  channel: ChannelAdapter;
  /**
   * Optional secret vault. When present, `{{secret:NAME}}` placeholders in a
   * tool call's args are resolved to real secrets ONLY in the post-gate argv
   * handed to `sandbox.exec` — never in any GatewayMessage or journal payload.
   * When absent, a call carrying a placeholder still FAILS CLOSED (throws),
   * rather than passing the literal placeholder to exec.
   */
  vault?: SecretVault;
  /**
   * Optional durable session store (agp-4na.2). When present, each session runs
   * under a fenced lease so a daemon crash does not orphan it: a restart's
   * `recoverSessions()` reaps expired leases, and a new owner supersedes a stale
   * one via a higher fencing token. When absent, sessions run unleased (the
   * reference behavior) — the signed journal is crash-durable either way.
   */
  sessionStore?: SessionStore;
  /** This daemon process's identity (lease owner). Default: a fresh uuid. */
  instanceId?: string;
  /** Clock (epoch ms), injectable for deterministic tests. Default: Date.now. */
  nowMs?: () => number;
  /** Lease TTL in ms; a session whose heartbeat is older than this is reapable. */
  leaseTtlMs?: number;
  /**
   * Optional supply-chain verifier (agp-z26 / 043-AT-ADR). Used in the
   * `warn`/`enforce` identity modes to verify the intendant's signed manifest
   * before a session starts. The daemon depends only on the Verifier interface;
   * the concrete backend (Ed25519 v0, Sigstore v0.6) is injected by the CLI.
   */
  verifier?: Verifier;
  /**
   * Intendant identity policy. `off` (default v0) does not verify and records
   * `intendant_identity_uri: null`. `warn` verifies and journals an
   * `intendant.verify.failed` event on failure but still runs. `enforce` refuses
   * to start a session whose manifest does not verify.
   */
  identityMode?: IdentityMode;
  /**
   * The tenant this daemon serves (agp-pne / 047-AT-ADR). Optional; defaults to the
   * v0 single-operator sentinel. A non-sentinel context fails closed at every
   * governance entry point — v0 is single-tenant ONLY; hosted multi-tenant is a
   * future epic + security gates. RESERVE, do not enable.
   */
  tenantContext?: TenantContext;
}

export type IdentityMode = "off" | "warn" | "enforce";

/** Per-session run options, including the supply-chain material to verify. */
export interface SessionRunOptions {
  sessionId?: string;
  image?: string;
  /** The intendant's signed manifest (warn/enforce modes). */
  manifest?: IntendantManifest;
  /** Detached base64 Ed25519 signature over canonicalJson(manifest). */
  signatureB64?: string;
  /**
   * Sandbox egress for THIS session (runMediated only; the other drivers stay
   * hardcoded network-off). The Slice-0 watcher's proxy-executed `gh` calls need
   * api.github.com in live Docker mode; reference (recording) mode ignores it.
   * Default false — network stays off unless a driver asks for it explicitly.
   */
  networkEnabled?: boolean;
}

/** A vault that holds nothing — used when no `vault` dep is supplied so an
 *  unexpected placeholder fails closed instead of reaching exec verbatim. */
const EMPTY_VAULT: SecretVault = { get: () => undefined, values: () => [] };

/**
 * A intendant the live driver (`runLive`) can drive to completion. It EXTENDS the
 * frozen IntendantAdapter (016) — `run` is the live analogue of
 * ScriptedIntendant.emitAll — so the contract itself is untouched (no Bead+ADR).
 * Documented in 000-docs/027-AT-SPEC-claude-code-intendant.md.
 */
export interface RunnableIntendant extends IntendantAdapter {
  /** Drive the harness session to completion, emitting tool calls as it runs. */
  run(sessionId: string): Promise<void>;
}

export interface MediationOutcome {
  request: ToolCallRequest;
  verdict: PolicyVerdict;
  /** null when no approval was needed; otherwise the human decision. */
  approved: boolean | null;
  /** whether the call was executed (only an effective-allow executes). */
  executed: boolean;
}

export interface SessionResult {
  sessionId: string;
  outcomes: MediationOutcome[];
  /** True when the identity gate refused to start the session (enforce mode). */
  refused?: boolean;
}

export class Daemon {
  private readonly deps: DaemonDeps;
  private readonly instanceId: string;
  private readonly nowMs: () => number;
  private readonly leaseTtlMs: number;
  private readonly identityMode: IdentityMode;
  private readonly tenantContext: TenantContext;

  constructor(deps: DaemonDeps) {
    this.deps = deps;
    this.instanceId = deps.instanceId ?? randomUUID();
    this.nowMs = deps.nowMs ?? (() => Date.now());
    this.leaseTtlMs = deps.leaseTtlMs ?? 300_000; // 5 min; refreshed per gated call
    this.identityMode = deps.identityMode ?? "off";
    this.tenantContext = deps.tenantContext ?? defaultTenantContext();
  }

  /**
   * Supply-chain identity gate (agp-z26.4 / 043-AT-ADR), run before a session
   * starts. Returns whether to proceed and the identity URI to record on
   * session.started:
   *   - off     → proceed; URI = the adapter's self-asserted identity.uri (null v0).
   *   - warn    → verify; on failure journal intendant.verify.failed and proceed
   *               UNVERIFIED (URI null); on success record the verifier-minted URI.
   *   - enforce → verify; on failure journal intendant.verify.failed and REFUSE
   *               (no lease, no session.started, no sandbox spawn).
   */
  private async gateIdentity(
    identity: IntendantIdentity,
    sessionId: string,
    opts: SessionRunOptions,
  ): Promise<{ proceed: boolean; identityUri: string | null }> {
    if (this.identityMode === "off") return { proceed: true, identityUri: identity.uri };

    const fail = (reason: string): { proceed: boolean; identityUri: string | null } => {
      this.deps.journal.append({
        kind: "intendant.verify.failed",
        actor: "session_owner",
        payload: { sessionId, reason, mode: this.identityMode },
      });
      // enforce refuses; warn records the failure but runs unverified (URI null).
      return { proceed: this.identityMode !== "enforce", identityUri: null };
    };

    const { verifier } = this.deps;
    if (!verifier || opts.manifest === undefined || opts.signatureB64 === undefined) {
      return fail("no-verification-material");
    }
    const res = await verifier.verify(opts.manifest, opts.signatureB64);
    return res.ok ? { proceed: true, identityUri: res.identity.uri } : fail(res.reason);
  }

  /**
   * Crash recovery (agp-4na.2). Sweep the session store and reap every lease
   * whose heartbeat has expired — a session whose owning daemon crashed without
   * releasing it. Each reap is journaled (`session.reaped`) so the audit trail
   * records the recovery. Call once on daemon startup, before driving sessions.
   * No store ⇒ no-op. Returns the reaped leases.
   */
  recoverSessions(): SessionLease[] {
    const store = this.deps.sessionStore;
    if (!store) return [];
    const reaped = store.reapExpired(this.nowMs());
    for (const lease of reaped) {
      this.deps.journal.append({
        kind: "session.reaped",
        actor: "session_owner",
        payload: { sessionId: lease.sessionId, fencingToken: lease.fencingToken, reapedBy: this.instanceId },
      });
    }
    return reaped;
  }

  private toCommand(req: ToolCallRequest): string[] {
    const cmd = req.args.command;
    if (typeof cmd === "string") return ["sh", "-c", cmd];
    return [req.tool, JSON.stringify(req.args)];
  }

  /** Mediate a single tool call through the full governance loop. */
  async mediate(req: ToolCallRequest, handle: SandboxHandle, intendant: IntendantAdapter): Promise<MediationOutcome> {
    assertTenantContext(this.tenantContext); // v0 single-tenant fail-closed (agp-pne)
    const { policy, journal, sandbox, channel } = this.deps;
    const vault = this.deps.vault ?? EMPTY_VAULT;

    const verdict = policy.evaluate({ tool: req.tool, actor: req.actor });
    journal.append({
      kind: `tool_call.${verdict.decision}`,
      actor: req.actor,
      payload: { messageId: req.id, tool: req.tool, ruleId: verdict.ruleId, reason: verdict.reason },
    });

    let approved: boolean | null = null;
    let effective: "allow" | "deny" = verdict.decision === "allow" ? "allow" : "deny";

    if (verdict.decision === "require") {
      const h = await channel.postApprovalRequest({
        messageId: req.id,
        sessionId: req.sessionId,
        tool: req.tool,
        verdict,
      });
      let decidedBy: string | null = null;
      let reason: string | undefined;
      try {
        const decision = await channel.awaitDecision(h);
        approved = decision.approved;
        decidedBy = decision.decidedBy;
      } catch (err) {
        // No decision (receiver timeout / socket closed) MUST fail closed — the
        // loop never hangs or crashes waiting on a click that never arrives.
        approved = false;
        reason = `no decision: ${(err as Error).message}`;
      }
      journal.append({
        kind: approved ? "approval.granted" : "approval.denied",
        actor: "session_owner",
        payload: reason ? { messageId: req.id, decidedBy, reason } : { messageId: req.id, decidedBy },
      });
      effective = approved ? "allow" : "deny";
    }

    let executed = false;
    if (effective === "allow") {
      // Credential-injection seam: build the argv, then resolve `{{secret:NAME}}`
      // placeholders to real secrets ONLY here — after the gate, immediately
      // before exec. The secret value never entered a GatewayMessage and never
      // enters the journal; we journal the secret NAMES only. Fail closed: a
      // referenced-but-absent secret throws (resolvePlaceholders), so the literal
      // placeholder is never handed to exec.
      const cmd = this.toCommand(req);
      const secretsUsed = findPlaceholders(cmd);
      const resolvedCmd = resolvePlaceholders(cmd, vault) as string[];
      const secretValues = resolvedSecretValues(cmd, vault);

      const result = await sandbox.exec(handle, resolvedCmd);
      // Redact any echoed secret from the result before it reaches the journal /
      // the intendant (defense-in-depth; not a guarantee).
      const safeStdout = redactSecrets(result.stdout, secretValues) as string;
      journal.append({
        kind: "tool_call.executed",
        actor: req.actor,
        payload:
          secretsUsed.length > 0
            ? { messageId: req.id, exitCode: result.exitCode, secretsUsed }
            : { messageId: req.id, exitCode: result.exitCode },
      });
      await intendant.deliver({
        kind: "tool_call_result",
        id: req.id,
        sessionId: req.sessionId,
        ok: result.exitCode === 0,
        output: safeStdout,
      });
      executed = true;
    } else {
      await intendant.deliver({ kind: "policy_verdict", id: req.id, sessionId: req.sessionId, verdict });
    }

    return { request: req, verdict, approved, executed };
  }

  /**
   * Gate-only mediation for a LIVE harness that executes its own tools inside
   * the sandbox: policy gate → (if `require`) channel HITL → signed journal →
   * deliver the EFFECTIVE verdict back to the blocked hook. AGP does NOT
   * proxy-execute (the harness runs the allowed tool itself) — this is the
   * difference from `mediate`, and it mirrors CCSC's `gate()` semantics.
   */
  async gate(req: ToolCallRequest, intendant: IntendantAdapter): Promise<MediationOutcome> {
    const { policy, journal, channel } = this.deps;

    const verdict = policy.evaluate({ tool: req.tool, actor: req.actor });
    journal.append({
      kind: `tool_call.${verdict.decision}`,
      actor: req.actor,
      payload: { messageId: req.id, tool: req.tool, ruleId: verdict.ruleId, reason: verdict.reason },
    });

    let approved: boolean | null = null;
    let effective: "allow" | "deny" = verdict.decision === "allow" ? "allow" : "deny";

    if (verdict.decision === "require") {
      const h = await channel.postApprovalRequest({
        messageId: req.id,
        sessionId: req.sessionId,
        tool: req.tool,
        verdict,
      });
      let decidedBy: string | null = null;
      let reason: string | undefined;
      try {
        const decision = await channel.awaitDecision(h);
        approved = decision.approved;
        decidedBy = decision.decidedBy;
      } catch (err) {
        // No decision (receiver timeout / socket closed) MUST fail closed — the
        // loop never hangs or crashes waiting on a click that never arrives.
        approved = false;
        reason = `no decision: ${(err as Error).message}`;
      }
      journal.append({
        kind: approved ? "approval.granted" : "approval.denied",
        actor: "session_owner",
        payload: reason ? { messageId: req.id, decidedBy, reason } : { messageId: req.id, decidedBy },
      });
      effective = approved ? "allow" : "deny";
    }

    journal.append({ kind: `gate.${effective}`, actor: req.actor, payload: { messageId: req.id, tool: req.tool } });

    // Deliver the effective decision back to the hook as a verdict message.
    const effectiveVerdict = PolicyVerdict.parse({
      decision: effective,
      reason:
        effective === verdict.decision
          ? verdict.reason
          : `${verdict.decision} → ${effective} (operator decision)`,
      ruleId: verdict.ruleId,
      tier: verdict.tier,
    });
    await intendant.deliver({ kind: "policy_verdict", id: req.id, sessionId: req.sessionId, verdict: effectiveVerdict });

    // executed=false: AGP never proxy-executes a live harness's tools.
    return { request: req, verdict, approved, executed: false };
  }

  /**
   * Live driver: drive a real harness intendant to completion, gating every tool
   * call it attempts. The harness blocks per-call (PreToolUse back-pressure), so
   * gates settle in emission order; `await Promise.all` is a belt-and-suspenders
   * barrier in case a intendant ever emits concurrently.
   */
  async runLive(intendant: RunnableIntendant, opts: SessionRunOptions = {}): Promise<SessionResult> {
    assertTenantContext(this.tenantContext); // v0 single-tenant fail-closed (agp-pne)
    const sessionId = opts.sessionId ?? randomUUID();
    const { journal, sandbox, sessionStore } = this.deps;

    // Supply-chain gate (agp-z26.4): refuse an unverified intendant in enforce mode
    // BEFORE acquiring a lease, journaling session.started, or spawning a sandbox.
    const gate = await this.gateIdentity(intendant.identity, sessionId, opts);
    if (!gate.proceed) return { sessionId, outcomes: [], refused: true };

    let lease = sessionStore?.acquire(sessionId, this.instanceId, this.nowMs(), this.leaseTtlMs);
    journal.append({
      kind: "session.started",
      actor: "session_owner",
      payload: { sessionId, intendant: intendant.identity },
      // Provenance column (agp-z26 / 043-AT-ADR): the verifier-minted URI in
      // warn/enforce, the adapter's self-asserted uri in off (null at v0).
      intendant_identity_uri: gate.identityUri,
    });
    await intendant.start(sessionId);
    const handle = await sandbox.spawn({
      image: opts.image ?? "agp-sandbox:v0",
      sessionId,
      networkEnabled: false,
    });

    const outcomes: MediationOutcome[] = [];
    const inflight: Promise<void>[] = [];
    intendant.onToolCall((req) => {
      inflight.push(
        this.gate(req, intendant).then((o) => {
          outcomes.push(o);
          // Heartbeat per gated call. Calls are serialized by PreToolUse
          // back-pressure, so this read-modify-write does not race in practice.
          if (lease && sessionStore) lease = sessionStore.heartbeat(lease, this.nowMs(), this.leaseTtlMs);
        }),
      );
    });

    await intendant.run(sessionId);
    await Promise.all(inflight);

    await sandbox.teardown(handle);
    await intendant.stop();
    journal.append({ kind: "session.ended", actor: "session_owner", payload: { sessionId, calls: outcomes.length } });
    if (lease && sessionStore) sessionStore.release(lease, this.nowMs());

    return { sessionId, outcomes };
  }

  /**
   * Mediated driver (Slice 0, agp-eva.1.5): drive a RunnableIntendant whose tool
   * calls AGP PROXY-EXECUTES through `mediate()` — policy gate → (require) HITL →
   * signed journal → sandbox exec → result delivered back. This is the driver for
   * trigger-woken agents (the GitHub watcher): unlike `runLive` (gate-only; a live
   * harness executes its own tools) the agent here holds NO executor of its own —
   * every effect it has on the world goes through the sandbox. Unlike
   * `runScripted` (collect-then-mediate) the intendant sees each result before
   * deciding its next call, so a watcher can read → diff → act in one session.
   */
  async runMediated(intendant: RunnableIntendant, opts: SessionRunOptions = {}): Promise<SessionResult> {
    assertTenantContext(this.tenantContext); // v0 single-tenant fail-closed (agp-pne)
    const sessionId = opts.sessionId ?? randomUUID();
    const { journal, sandbox, sessionStore } = this.deps;

    // Supply-chain gate (agp-z26.4): refuse an unverified intendant in enforce mode
    // BEFORE acquiring a lease, journaling session.started, or spawning a sandbox.
    const gate = await this.gateIdentity(intendant.identity, sessionId, opts);
    if (!gate.proceed) return { sessionId, outcomes: [], refused: true };

    let lease = sessionStore?.acquire(sessionId, this.instanceId, this.nowMs(), this.leaseTtlMs);
    journal.append({
      kind: "session.started",
      actor: "session_owner",
      payload: { sessionId, intendant: intendant.identity },
      intendant_identity_uri: gate.identityUri,
    });
    await intendant.start(sessionId);
    const handle = await sandbox.spawn({
      image: opts.image ?? "agp-sandbox:v0",
      sessionId,
      networkEnabled: opts.networkEnabled ?? false,
    });

    const outcomes: MediationOutcome[] = [];
    const inflight: Promise<void>[] = [];
    intendant.onToolCall((req) => {
      inflight.push(
        this.mediate(req, handle, intendant).then((o) => {
          outcomes.push(o);
          // Heartbeat per mediated call. The watcher emits serially (it awaits
          // each delivered result before the next call), so no read-modify race.
          if (lease && sessionStore) lease = sessionStore.heartbeat(lease, this.nowMs(), this.leaseTtlMs);
        }),
      );
    });

    await intendant.run(sessionId);
    await Promise.all(inflight);

    await sandbox.teardown(handle);
    await intendant.stop();
    journal.append({ kind: "session.ended", actor: "session_owner", payload: { sessionId, calls: outcomes.length } });
    // Clean end releases the lease. On a throw above we deliberately do NOT
    // release — the lease expires and a future recoverSessions() reaps it.
    if (lease && sessionStore) sessionStore.release(lease, this.nowMs());

    return { sessionId, outcomes };
  }

  /** Reference driver: run a scripted intendant's whole script through the loop. */
  async runScripted(intendant: ScriptedIntendant, opts: SessionRunOptions = {}): Promise<SessionResult> {
    assertTenantContext(this.tenantContext); // v0 single-tenant fail-closed (agp-pne)
    const sessionId = opts.sessionId ?? randomUUID();
    const { journal, sandbox, sessionStore } = this.deps;

    // Supply-chain gate (agp-z26.4): refuse an unverified intendant in enforce mode
    // BEFORE acquiring a lease, journaling session.started, or spawning a sandbox.
    const gate = await this.gateIdentity(intendant.identity, sessionId, opts);
    if (!gate.proceed) return { sessionId, outcomes: [], refused: true };

    let lease = sessionStore?.acquire(sessionId, this.instanceId, this.nowMs(), this.leaseTtlMs);
    journal.append({
      kind: "session.started",
      actor: "session_owner",
      payload: { sessionId, intendant: intendant.identity },
      // Provenance column (agp-z26 / 043-AT-ADR): the verifier-minted URI in
      // warn/enforce, the adapter's self-asserted uri in off (null at v0).
      intendant_identity_uri: gate.identityUri,
    });
    await intendant.start(sessionId);
    const handle = await sandbox.spawn({
      image: opts.image ?? "agp-sandbox:v0",
      sessionId,
      networkEnabled: false,
    });

    const collected: ToolCallRequest[] = [];
    intendant.onToolCall((req) => collected.push(req));
    intendant.emitAll(sessionId);

    const outcomes: MediationOutcome[] = [];
    for (const req of collected) {
      outcomes.push(await this.mediate(req, handle, intendant));
      if (lease && sessionStore) lease = sessionStore.heartbeat(lease, this.nowMs(), this.leaseTtlMs);
    }

    await sandbox.teardown(handle);
    await intendant.stop();
    journal.append({ kind: "session.ended", actor: "session_owner", payload: { sessionId, calls: outcomes.length } });
    // Clean end releases the lease. On a throw above we deliberately do NOT
    // release — the lease expires and a future recoverSessions() reaps it.
    if (lease && sessionStore) sessionStore.release(lease, this.nowMs());

    return { sessionId, outcomes };
  }
}
