// InteractionSource — the seam delivering a human's Approve/Deny click back to
// the channel. The operational implementation is Slack Socket Mode (a websocket
// that streams `block_actions` payloads); that connect-step is wired when the
// daemon runs in Slack mode. The interface + the in-memory source below make the
// HITL flow fully testable without a live socket.

export interface SlackInteraction {
  /** The nonce carried on the clicked button (Block Kit button `value`). */
  nonce: string;
  /** Whether Approve (true) or Deny (false) was clicked. */
  approved: boolean;
  /** Slack user id of the clicker. */
  userId: string;
  /** True if the actor is a bot/app — such actors may never approve. */
  isBot: boolean;
}

export interface InteractionSource {
  /** Resolve with the interaction carrying the given nonce. */
  awaitInteraction(nonce: string): Promise<SlackInteraction>;
}

/** In-memory source: pre-seed interactions by nonce. Used by tests and any
 *  programmatic (non-Slack) decision path. */
export class InMemoryInteractionSource implements InteractionSource {
  private readonly byNonce = new Map<string, SlackInteraction>();

  push(interaction: SlackInteraction): void {
    this.byNonce.set(interaction.nonce, interaction);
  }

  awaitInteraction(nonce: string): Promise<SlackInteraction> {
    const found = this.byNonce.get(nonce);
    if (!found) return Promise.reject(new Error(`no interaction seeded for nonce ${nonce}`));
    return Promise.resolve(found);
  }
}
