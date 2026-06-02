// RefPolicyEvaluator — AGP reference policy engine. Evaluates a tool call
// against ordered rules from ~/.agp/policy.json and returns a PolicyVerdict.
// First matching rule wins; no match is DEFAULT-DENY (fail-closed).
//
// REFERENCE — the production policy engine (Epic 09, agp-9r8) replaces this with
// the full CCSC-aligned gate; it must keep the default-deny + PolicyVerdict
// contract.

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { Actor } from "../contracts/_common.ts";
import { PolicyTier, PolicyVerdict } from "../contracts/policy-verdict.ts";

export const PolicyRule = z.object({
  id: z.string().min(1),
  effect: z.enum(["allow", "deny", "require"]),
  /** Tool name to match, or "*" for any. */
  tool: z.string().default("*"),
  /** Optional actor constraint. */
  actor: Actor.optional(),
  tier: PolicyTier.optional(),
  reason: z.string().optional(),
});
export type PolicyRule = z.infer<typeof PolicyRule>;

export const PolicyFile = z.object({ rules: z.array(PolicyRule) });
export type PolicyFile = z.infer<typeof PolicyFile>;

export interface ToolCall {
  tool: string;
  actor: Actor;
}

export class RefPolicyEvaluator {
  private readonly rules: PolicyRule[];

  constructor(rules: PolicyRule[]) {
    this.rules = rules;
  }

  evaluate(call: ToolCall): PolicyVerdict {
    const rule = this.rules.find(
      (r) => (r.tool === "*" || r.tool === call.tool) && (r.actor === undefined || r.actor === call.actor),
    );

    if (!rule) {
      return PolicyVerdict.parse({
        decision: "deny",
        reason: `no matching rule for tool '${call.tool}' (default-deny)`,
        ruleId: null,
        tier: null,
      });
    }

    return PolicyVerdict.parse({
      decision: rule.effect,
      reason: rule.reason ?? `rule '${rule.id}' → ${rule.effect}`,
      ruleId: rule.id,
      tier: rule.tier ?? null,
    });
  }
}

/** Load + validate a policy file into an evaluator. Throws on missing/invalid (caller fails closed). */
export function loadPolicyEvaluator(path: string): RefPolicyEvaluator {
  if (!existsSync(path)) throw new Error(`policy file not found at ${path}`);
  const parsed = PolicyFile.parse(JSON.parse(readFileSync(path, "utf8")));
  return new RefPolicyEvaluator(parsed.rules);
}
