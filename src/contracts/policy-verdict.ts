// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See 000-docs/014-AT-CONT-policy-verdict.md.
//
// PolicyVerdict — the decision the policy engine returns for a single tool call.
// Three kinds, mirroring the CCSC `policy.ts` substrate: allow / deny / require
// (require = human approval needed before the call may proceed).

import { z } from "zod";

/** Which policy tier matched (mirrors CCSC PolicyTier). */
export const PolicyTier = z.enum(["default", "workspace", "user", "admin"]);
export type PolicyTier = z.infer<typeof PolicyTier>;

export const PolicyDecision = z.enum(["allow", "deny", "require"]);
export type PolicyDecision = z.infer<typeof PolicyDecision>;

export const PolicyVerdict = z
  .object({
    decision: PolicyDecision,
    /** Human-readable justification; surfaced in the journal and (for `require`) Slack. */
    reason: z.string().min(1),
    /** Id of the rule that produced this verdict; null when no rule matched (default). */
    ruleId: z.string().nullable().default(null),
    /** The tier of the matching rule; null when no rule matched. */
    tier: PolicyTier.nullable().default(null),
  })
  // `require` must carry the rule that demands approval — fail-closed invariant.
  .superRefine((v, ctx) => {
    if (v.decision === "require" && v.ruleId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ruleId"],
        message: "a 'require' verdict must name the rule that demands approval",
      });
    }
  });

export type PolicyVerdict = z.infer<typeof PolicyVerdict>;
