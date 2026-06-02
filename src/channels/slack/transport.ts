// SlackTransport — the seam between SlackChannel and the Slack Web API.
// FetchSlackTransport posts/updates messages via chat.postMessage /
// chat.update; tests inject a fake so the channel's HITL logic is testable
// without a live workspace.

import type { SlackBlock } from "./blocks.ts";

export interface PostResult {
  /** Message timestamp id (Slack `ts`), used to update the message later. */
  ts: string;
}

export interface SlackTransport {
  postMessage(channel: string, blocks: SlackBlock[], fallbackText: string): Promise<PostResult>;
  updateMessage(channel: string, ts: string, text: string): Promise<void>;
}

/** Real transport: Slack Web API over fetch with a bot token. */
export class FetchSlackTransport implements SlackTransport {
  private readonly token: string;
  private readonly base: string;

  constructor(botToken: string, base = "https://slack.com/api") {
    this.token = botToken;
    this.base = base;
  }

  private async call(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (json.ok !== true) {
      throw new Error(`slack ${method} failed: ${String(json.error ?? "unknown")}`);
    }
    return json;
  }

  async postMessage(channel: string, blocks: SlackBlock[], fallbackText: string): Promise<PostResult> {
    const json = await this.call("chat.postMessage", { channel, blocks, text: fallbackText });
    return { ts: String(json.ts ?? "") };
  }

  async updateMessage(channel: string, ts: string, text: string): Promise<void> {
    await this.call("chat.update", { channel, ts, text, blocks: [] });
  }
}
