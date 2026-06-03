// PolicyEngine — AGP's production policy engine (the hardened successor to the
// Epic 04 RefPolicyEvaluator). Adapted from CCSC policy.ts: three effects, and
// decisions use only verified signals (tool + actor), never arbitrary args.
//
// Combining algorithm: among all matching rules, the STRICTEST effect wins
// (deny > require > allow); ties break by priority then declaration order. No
// matching rule is DEFAULT-DENY (fail-closed). This replaces the reference's
// first-match-wins so rule ordering can never accidentally allow what a deny
// rule forbids.

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { Actor } from "../contracts/_common.ts";
import { PolicyTier, PolicyVerdict } from "../contracts/policy-verdict.ts";

export const PolicyEffect = z.enum(["allow", "deny", "require"]);
export type PolicyEffect = z.infer<typeof PolicyEffect>;

export const PolicyRule = z.object({
  id: z.string().min(1),
  effect: PolicyEffect,
  /** Tool name to match, or "*" for any. */
  tool: z.string().default("*"),
  /** Optional actor constraint (session_owner | claude_process). */
  actor: Actor.optional(),
  tier: PolicyTier.optional(),
  /** Tie-breaker within the same effect; higher wins (default 0). */
  priority: z.number().int().optional(),
  reason: z.string().optional(),
});
export type PolicyRule = z.infer<typeof PolicyRule>;

export const PolicyFile = z.object({ rules: z.array(PolicyRule) }).strict();
export type PolicyFile = z.infer<typeof PolicyFile>;

export interface ToolCall {
  tool: string;
  actor: Actor;
}

const RESTRICTIVENESS: Record<PolicyEffect, number> = { deny: 3, require: 2, allow: 1 };

function matches(rule: PolicyRule, call: ToolCall): boolean {
  const toolOk = rule.tool === "*" || rule.tool === call.tool;
  const actorOk = rule.actor === undefined || rule.actor === call.actor;
  return toolOk && actorOk;
}

export class PolicyEngine {
  private readonly rules: PolicyRule[];

  constructor(rules: PolicyRule[]) {
    this.rules = rules;
  }

  evaluate(call: ToolCall): PolicyVerdict {
    const matching = this.rules.filter((r) => matches(r, call));
    if (matching.length === 0) {
      return PolicyVerdict.parse({
        decision: "deny",
        reason: `no matching rule for tool '${call.tool}' (default-deny)`,
        ruleId: null,
        tier: null,
      });
    }

    const maxRank = Math.max(...matching.map((r) => RESTRICTIVENESS[r.effect]));
    const winner = matching
      .filter((r) => RESTRICTIVENESS[r.effect] === maxRank)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]!;

    return PolicyVerdict.parse({
      decision: winner.effect,
      reason: winner.reason ?? `rule '${winner.id}' → ${winner.effect}`,
      ruleId: winner.id,
      tier: winner.tier ?? null,
    });
  }
}

/**
 * Load + validate a policy file into an engine. Parse errors are FATAL — a
 * malformed policy must never be silently ignored (it would fail open).
 */
export function loadPolicyFile(path: string): PolicyFile {
  if (!existsSync(path)) throw new Error(`policy file not found at ${path}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`policy file is not valid JSON: ${(err as Error).message}`);
  }
  return PolicyFile.parse(raw); // throws on schema violation — fatal by design
}

export function loadPolicyEngine(path: string): PolicyEngine {
  return new PolicyEngine(loadPolicyFile(path).rules);
}
