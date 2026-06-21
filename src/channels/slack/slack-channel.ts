// SlackChannel — the production ChannelAdapter. Posts a nonce-bound Block Kit
// approval prompt, awaits the human's click, and enforces the security
// invariants:
//   - the nonce is one-time (a replayed click is rejected)
//   - a peer bot / app actor can never approve
//   - projectEvent is best-effort and NEVER throws — Slack is a projection, the
//     local journal is authoritative, so a Slack failure cannot corrupt state.

import type {
  ApprovalDecision,
  ApprovalHandle,
  ApprovalRequest,
  ChannelAdapter,
} from "../../contracts/channel-adapter.ts";
import { buildApprovalBlocks, projectionBlocks } from "./blocks.ts";
import { NonceStore } from "./nonce-store.ts";
import type { SlackTransport } from "./transport.ts";
import type { InteractionSource } from "./interactions.ts";

export interface SlackChannelOptions {
  transport: SlackTransport;
  interactions: InteractionSource;
  channelId: string;
  nonceStore?: NonceStore;
  /**
   * Optional fail-closed outbound guard. Runs on a payload before it is posted to
   * Slack; if it throws (e.g. a known secret value would be posted) the gating
   * post (postApprovalRequest) refuses fail-closed, and the best-effort
   * projection (projectEvent) silently declines rather than leak. Wire
   * `assertNoSecretValues` here.
   */
  screen?: (payload: unknown) => void;
}

export class SlackChannel implements ChannelAdapter {
  private readonly transport: SlackTransport;
  private readonly interactions: InteractionSource;
  private readonly channelId: string;
  private readonly nonces: NonceStore;
  private readonly screen?: (payload: unknown) => void;
  private readonly pending = new Map<string, { nonce: string; ts: string }>();

  constructor(opts: SlackChannelOptions) {
    this.transport = opts.transport;
    this.interactions = opts.interactions;
    this.channelId = opts.channelId;
    this.nonces = opts.nonceStore ?? new NonceStore();
    this.screen = opts.screen;
  }

  async postApprovalRequest(request: ApprovalRequest): Promise<ApprovalHandle> {
    // Fail-closed: refuse to post a prompt that would leak a secret value. The
    // daemon then fails the call closed (deny) rather than exposing the credential.
    this.screen?.(request);
    const nonce = this.nonces.mint({ messageId: request.messageId, sessionId: request.sessionId });
    const { ts } = await this.transport.postMessage(
      this.channelId,
      buildApprovalBlocks(request, nonce),
      `Approval required: ${request.tool}`,
    );
    this.pending.set(request.messageId, { nonce, ts });
    return { messageId: request.messageId };
  }

  async awaitDecision(handle: ApprovalHandle): Promise<ApprovalDecision> {
    const pending = this.pending.get(handle.messageId);
    if (!pending) throw new Error(`no pending approval for message ${handle.messageId}`);

    const interaction = await this.interactions.awaitInteraction(pending.nonce);
    const deny = (reason: string): ApprovalDecision => {
      void this.safeUpdate(pending.ts, `Denied — ${reason}`);
      return { messageId: handle.messageId, approved: false, decidedBy: interaction.userId };
    };

    // A peer bot / app actor may never approve (does NOT consume the nonce, so a
    // bot can't burn a still-valid request a human could still act on).
    if (interaction.isBot) return deny("non-human actor cannot approve");

    const consumed = this.nonces.consume(interaction.nonce, handle.messageId);
    if (!consumed.ok) return deny(consumed.reason ?? "invalid nonce");

    const approved = interaction.approved;
    void this.safeUpdate(pending.ts, approved ? "Approved" : "Denied by operator");
    return { messageId: handle.messageId, approved, decidedBy: interaction.userId };
  }

  /** Best-effort projection: a Slack failure returns false and never throws. A
   *  payload that would leak a secret is declined (returns false), never posted. */
  async projectEvent(eventKind: string, summary: string): Promise<boolean> {
    try {
      this.screen?.({ eventKind, summary });
      await this.transport.postMessage(this.channelId, projectionBlocks(eventKind, summary), `${eventKind}: ${summary}`);
      return true;
    } catch {
      return false;
    }
  }

  private async safeUpdate(ts: string, text: string): Promise<void> {
    try {
      await this.transport.updateMessage(this.channelId, ts, text);
    } catch {
      // updating the prompt is cosmetic; never let it affect the decision
    }
  }
}
