// Block Kit construction for approval prompts. Each Approve/Deny button carries
// the nonce as its value, binding the click to a specific, one-time request
// (the nonce is also bound to messageId + sessionId in the NonceStore).

import type { ApprovalRequest } from "../../contracts/channel-adapter.ts";

export const ACTION_APPROVE = "agp_approve";
export const ACTION_DENY = "agp_deny";

export type SlackBlock = Record<string, unknown>;

export function buildApprovalBlocks(request: ApprovalRequest, nonce: string): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Approval required* — \`${request.tool}\`\nsession \`${request.sessionId}\`\n${request.verdict.reason}`,
      },
    },
    {
      type: "actions",
      block_id: `agp_approval:${request.messageId}`,
      elements: [
        {
          type: "button",
          action_id: ACTION_APPROVE,
          style: "primary",
          text: { type: "plain_text", text: "Approve" },
          value: nonce,
        },
        {
          type: "button",
          action_id: ACTION_DENY,
          style: "danger",
          text: { type: "plain_text", text: "Deny" },
          value: nonce,
        },
      ],
    },
  ];
}

export function projectionBlocks(eventKind: string, summary: string): SlackBlock[] {
  return [{ type: "section", text: { type: "mrkdwn", text: `\`${eventKind}\` — ${summary}` } }];
}
