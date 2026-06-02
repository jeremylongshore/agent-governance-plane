// ConsoleChannel — AGP reference ChannelAdapter. Prints approval requests and,
// by default, DENIES them (fail-closed): a human-in-the-loop channel with no
// human present must not auto-approve. Set AGP_AUTO_APPROVE=1 to auto-approve
// for local end-to-end demos only.
//
// REFERENCE — the production channel (Epic 08, agp-yep) replaces this with the
// real Slack Block-Kit HITL flow. Projection remains best-effort and never
// authoritative.

import type {
  ApprovalDecision,
  ApprovalHandle,
  ApprovalRequest,
  ChannelAdapter,
} from "../contracts/channel-adapter.ts";

export class ConsoleChannel implements ChannelAdapter {
  private readonly autoApprove: boolean;
  private readonly out: (line: string) => void;

  constructor(env: Record<string, string | undefined> = process.env, out: (line: string) => void = console.log) {
    this.autoApprove = env.AGP_AUTO_APPROVE === "1";
    this.out = out;
  }

  postApprovalRequest(request: ApprovalRequest): Promise<ApprovalHandle> {
    this.out(`[approval] ${request.tool} (session ${request.sessionId}): ${request.verdict.reason}`);
    return Promise.resolve({ messageId: request.messageId });
  }

  awaitDecision(handle: ApprovalHandle): Promise<ApprovalDecision> {
    const approved = this.autoApprove;
    this.out(
      `[approval] ${approved ? "AUTO-APPROVED (AGP_AUTO_APPROVE=1)" : "DENIED (fail-closed; no human present)"}`,
    );
    return Promise.resolve({
      messageId: handle.messageId,
      approved,
      decidedBy: approved ? "AGP_AUTO_APPROVE" : "fail-closed-default",
    });
  }

  projectEvent(eventKind: string, summary: string): Promise<boolean> {
    this.out(`[projection] ${eventKind}: ${summary}`);
    return Promise.resolve(true);
  }
}
