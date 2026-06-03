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
import type { PolicyVerdict } from "../contracts/policy-verdict.ts";
import type { SandboxHandle, SandboxProvider } from "../contracts/sandbox-provider.ts";
import type { ChannelAdapter } from "../contracts/channel-adapter.ts";
import type { SpriteAdapter } from "../contracts/sprite-adapter.ts";
import type { Journal } from "../journal/journal.ts";
import type { RefPolicyEvaluator } from "../runtime/policy.ts";
import type { ScriptedSprite } from "../runtime/sprite.ts";

export interface DaemonDeps {
  policy: RefPolicyEvaluator;
  journal: Journal;
  sandbox: SandboxProvider;
  channel: ChannelAdapter;
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
    const cmd = req.args["command"];
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
