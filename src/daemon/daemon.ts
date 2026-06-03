// Daemon — the AGP control-plane orchestration. For each tool call a sprite
// attempts, it runs the governance loop:
//
//   policy gate → (if `require`) channel HITL → signed journal → sandbox exec
//   → journal result → deliver result/verdict back to the sprite
//
// `mediate` is generic over the contract interfaces and is the heavily-tested
// core. `runScripted` is reference glue that drives the ScriptedSprite for
// `agp run`. Subsystem epics swap in production impls without touching this loop.

import { randomUUID } from "node:crypto";
import type { ToolCallRequest } from "../contracts/gateway-message.ts";
import { PolicyVerdict } from "../contracts/policy-verdict.ts";
import type { SandboxHandle, SandboxProvider } from "../contracts/sandbox-provider.ts";
import type { ChannelAdapter } from "../contracts/channel-adapter.ts";
import type { SpriteAdapter } from "../contracts/sprite-adapter.ts";
import type { Journal } from "../journal/journal.ts";
import type { PolicyEngine } from "../policy/engine.ts";
import type { ScriptedSprite } from "../runtime/sprite.ts";

export interface DaemonDeps {
  policy: PolicyEngine;
  journal: Journal;
  sandbox: SandboxProvider;
  channel: ChannelAdapter;
}

/**
 * A sprite the live driver (`runLive`) can drive to completion. It EXTENDS the
 * frozen SpriteAdapter (016) — `run` is the live analogue of
 * ScriptedSprite.emitAll — so the contract itself is untouched (no Bead+ADR).
 * Documented in 000-docs/027-AT-SPEC-claude-code-sprite.md.
 */
export interface RunnableSprite extends SpriteAdapter {
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
}

export class Daemon {
  private readonly deps: DaemonDeps;

  constructor(deps: DaemonDeps) {
    this.deps = deps;
  }

  private toCommand(req: ToolCallRequest): string[] {
    const cmd = req.args.command;
    if (typeof cmd === "string") return ["sh", "-c", cmd];
    return [req.tool, JSON.stringify(req.args)];
  }

  /** Mediate a single tool call through the full governance loop. */
  async mediate(req: ToolCallRequest, handle: SandboxHandle, sprite: SpriteAdapter): Promise<MediationOutcome> {
    const { policy, journal, sandbox, channel } = this.deps;

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
      const decision = await channel.awaitDecision(h);
      approved = decision.approved;
      journal.append({
        kind: approved ? "approval.granted" : "approval.denied",
        actor: "session_owner",
        payload: { messageId: req.id, decidedBy: decision.decidedBy },
      });
      effective = approved ? "allow" : "deny";
    }

    let executed = false;
    if (effective === "allow") {
      const result = await sandbox.exec(handle, this.toCommand(req));
      journal.append({
        kind: "tool_call.executed",
        actor: req.actor,
        payload: { messageId: req.id, exitCode: result.exitCode },
      });
      await sprite.deliver({
        kind: "tool_call_result",
        id: req.id,
        sessionId: req.sessionId,
        ok: result.exitCode === 0,
        output: result.stdout,
      });
      executed = true;
    } else {
      await sprite.deliver({ kind: "policy_verdict", id: req.id, sessionId: req.sessionId, verdict });
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
  async gate(req: ToolCallRequest, sprite: SpriteAdapter): Promise<MediationOutcome> {
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
      const decision = await channel.awaitDecision(h);
      approved = decision.approved;
      journal.append({
        kind: approved ? "approval.granted" : "approval.denied",
        actor: "session_owner",
        payload: { messageId: req.id, decidedBy: decision.decidedBy },
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
    await sprite.deliver({ kind: "policy_verdict", id: req.id, sessionId: req.sessionId, verdict: effectiveVerdict });

    // executed=false: AGP never proxy-executes a live harness's tools.
    return { request: req, verdict, approved, executed: false };
  }

  /**
   * Live driver: drive a real harness sprite to completion, gating every tool
   * call it attempts. The harness blocks per-call (PreToolUse back-pressure), so
   * gates settle in emission order; `await Promise.all` is a belt-and-suspenders
   * barrier in case a sprite ever emits concurrently.
   */
  async runLive(sprite: RunnableSprite, opts: { sessionId?: string; image?: string } = {}): Promise<SessionResult> {
    const sessionId = opts.sessionId ?? randomUUID();
    const { journal, sandbox } = this.deps;

    journal.append({ kind: "session.started", actor: "session_owner", payload: { sessionId, sprite: sprite.identity } });
    await sprite.start(sessionId);
    const handle = await sandbox.spawn({
      image: opts.image ?? "agp-sandbox:v0",
      sessionId,
      networkEnabled: false,
    });

    const outcomes: MediationOutcome[] = [];
    const inflight: Promise<void>[] = [];
    sprite.onToolCall((req) => {
      inflight.push(this.gate(req, sprite).then((o) => void outcomes.push(o)));
    });

    await sprite.run(sessionId);
    await Promise.all(inflight);

    await sandbox.teardown(handle);
    await sprite.stop();
    journal.append({ kind: "session.ended", actor: "session_owner", payload: { sessionId, calls: outcomes.length } });

    return { sessionId, outcomes };
  }

  /** Reference driver: run a scripted sprite's whole script through the loop. */
  async runScripted(sprite: ScriptedSprite, opts: { sessionId?: string; image?: string } = {}): Promise<SessionResult> {
    const sessionId = opts.sessionId ?? randomUUID();
    const { journal, sandbox } = this.deps;

    journal.append({ kind: "session.started", actor: "session_owner", payload: { sessionId, sprite: sprite.identity } });
    await sprite.start(sessionId);
    const handle = await sandbox.spawn({
      image: opts.image ?? "agp-sandbox:v0",
      sessionId,
      networkEnabled: false,
    });

    const collected: ToolCallRequest[] = [];
    sprite.onToolCall((req) => collected.push(req));
    sprite.emitAll(sessionId);

    const outcomes: MediationOutcome[] = [];
    for (const req of collected) {
      outcomes.push(await this.mediate(req, handle, sprite));
    }

    await sandbox.teardown(handle);
    await sprite.stop();
    journal.append({ kind: "session.ended", actor: "session_owner", payload: { sessionId, calls: outcomes.length } });

    return { sessionId, outcomes };
  }
}
