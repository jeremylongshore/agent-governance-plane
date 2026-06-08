import { test, expect } from "bun:test";
import {
  type RejectedInteraction,
  type SocketConnection,
  type SocketDialer,
  type SocketFrame,
  SocketModeInteractionSource,
} from "./socket-mode.ts";
import { ACTION_APPROVE, ACTION_DENY } from "./blocks.ts";

class FakeConnection implements SocketConnection {
  readonly sent: string[] = [];
  closed = false;
  private msg?: (f: SocketFrame) => void;
  private close_?: () => void;
  onMessage(h: (f: SocketFrame) => void): void {
    this.msg = h;
  }
  onClose(h: () => void): void {
    this.close_ = h;
  }
  send(text: string): void {
    this.sent.push(text);
  }
  close(): void {
    this.closed = true;
  }
  deliver(f: SocketFrame): void {
    this.msg?.(f);
  }
  triggerClose(): void {
    this.close_?.();
  }
}

class FakeDialer implements SocketDialer {
  readonly conn = new FakeConnection();
  open(): Promise<SocketConnection> {
    return Promise.resolve(this.conn);
  }
}

function clickFrame(actionId: string, nonce: string, envelopeId?: string): SocketFrame {
  return {
    type: "interactive",
    envelope_id: envelopeId,
    payload: {
      type: "block_actions",
      user: { id: "U-operator", is_bot: false },
      actions: [{ type: "button", action_id: actionId, value: nonce }],
    },
  };
}

const ack = (id: string): string => JSON.stringify({ envelope_id: id });

test("a matching approve click resolves the awaiting nonce and acks the envelope", async () => {
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "xapp", dialer });
  await src.start();

  const pending = src.awaitInteraction("n1");
  dialer.conn.deliver(clickFrame(ACTION_APPROVE, "n1", "e1"));

  const interaction = await pending;
  expect(interaction).toEqual({ nonce: "n1", approved: true, userId: "U-operator", isBot: false });
  expect(dialer.conn.sent).toContain(ack("e1"));
  await src.stop();
});

test("a deny click resolves approved:false", async () => {
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "x", dialer });
  await src.start();
  const pending = src.awaitInteraction("n2");
  dialer.conn.deliver(clickFrame(ACTION_DENY, "n2", "e1"));
  expect((await pending).approved).toBe(false);
  await src.stop();
});

test("a click with no envelope_id is not acked but still resolves", async () => {
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "x", dialer });
  await src.start();
  const pending = src.awaitInteraction("n1");
  dialer.conn.deliver(clickFrame(ACTION_APPROVE, "n1"));
  expect((await pending).approved).toBe(true);
  expect(dialer.conn.sent).toHaveLength(0);
  await src.stop();
});

test("an unanswered approval fails closed by timing out", async () => {
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "x", dialer, awaitTimeoutMs: 10 });
  await src.start();
  await expect(src.awaitInteraction("n1")).rejects.toThrow(/timed out/);
  await src.stop();
});

test("a click matching no pending approval is acked and reported as unknown nonce", async () => {
  const rejected: RejectedInteraction[] = [];
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "x", dialer, onRejected: (r) => rejected.push(r) });
  await src.start();

  dialer.conn.deliver(clickFrame(ACTION_APPROVE, "stray", "e9"));

  expect(dialer.conn.sent).toContain(ack("e9"));
  expect(rejected).toEqual([{ reason: "unknown nonce", nonce: "stray", userId: "U-operator" }]);
  await src.stop();
});

test("a second click on an already-resolved nonce is reported as a replay", async () => {
  const rejected: RejectedInteraction[] = [];
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "x", dialer, onRejected: (r) => rejected.push(r) });
  await src.start();

  const pending = src.awaitInteraction("n1");
  dialer.conn.deliver(clickFrame(ACTION_APPROVE, "n1", "e1"));
  await pending;

  dialer.conn.deliver(clickFrame(ACTION_APPROVE, "n1", "e2"));
  expect(rejected).toEqual([{ reason: "nonce already used (replay)", nonce: "n1", userId: "U-operator" }]);
  await src.stop();
});

test("a malformed/non-AGP frame is acked and ignored — no resolution, no rejection report", async () => {
  const rejected: RejectedInteraction[] = [];
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "x", dialer, onRejected: (r) => rejected.push(r) });
  await src.start();

  const pending = src.awaitInteraction("n1");
  const guard = pending.catch(() => "rejected");
  dialer.conn.deliver({ type: "hello", envelope_id: "e1" });

  expect(dialer.conn.sent).toContain(ack("e1"));
  expect(rejected).toHaveLength(0);

  await src.stop();
  expect(await guard).toBe("rejected");
});

test("stop() fails closed on every pending approval and closes the socket", async () => {
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "x", dialer });
  await src.start();
  const guard = src.awaitInteraction("n1").catch((e: Error) => e.message);
  await src.stop();
  expect(await guard).toMatch(/stopped/);
  expect(dialer.conn.closed).toBe(true);
});

test("a socket close mid-await fails closed (does not hang the gate)", async () => {
  const dialer = new FakeDialer();
  const src = new SocketModeInteractionSource({ appToken: "x", dialer });
  await src.start();
  const guard = src.awaitInteraction("n1").catch((e: Error) => e.message);
  dialer.conn.triggerClose();
  expect(await guard).toMatch(/closed/);
  await src.stop();
});
