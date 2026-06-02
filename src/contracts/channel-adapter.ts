// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See 000-docs/018-AT-CONT-channel-adapter.md.
//
// ChannelAdapter — the contract for the human-in-the-loop approval channel
// (Slack is the v0 implementation). The control plane posts approval requests
// for policy `require` verdicts and awaits the human decision; it also projects
// selected journal events to the channel.
//
// INVARIANT (inherited from CCSC): the channel is a PROJECTION, not the
// authority. The local hash-chained journal is ground truth; a dropped or
// rate-limited projection never changes what actually happened.

import { z } from "zod";
import { PolicyVerdict } from "./policy-verdict.ts";

/** A request for human approval of a pending `require` verdict. */
export const ApprovalRequest = z.object({
  /** Correlates to the GatewayMessage id of the pending tool call. */
  messageId: z.string().min(1),
  sessionId: z.string().min(1),
  tool: z.string().min(1),
  /** The verdict demanding approval (decision must be "require"). */
  verdict: PolicyVerdict,
}).superRefine((r, ctx) => {
  if (r.verdict.decision !== "require") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["verdict", "decision"],
      message: "an ApprovalRequest may only be raised for a 'require' verdict",
    });
  }
});
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

/** The human's decision on an approval request. */
export const ApprovalDecision = z.object({
  messageId: z.string().min(1),
  approved: z.boolean(),
  /** Who decided (Slack user id, etc.). */
  decidedBy: z.string().min(1),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

/** Opaque handle to a posted approval request. */
export interface ApprovalHandle {
  readonly messageId: string;
}

export interface ChannelAdapter {
  /** Post an approval request to the channel; returns a handle to await on. */
  postApprovalRequest(request: ApprovalRequest): Promise<ApprovalHandle>;
  /** Await the human decision for a posted request. */
  awaitDecision(handle: ApprovalHandle): Promise<ApprovalDecision>;
  /**
   * Best-effort projection of a journal event to the channel. Returns whether
   * the projection was delivered; a `false` (dropped/rate-limited) NEVER
   * affects journal authority.
   */
  projectEvent(eventKind: string, summary: string): Promise<boolean>;
}
