import { test, expect } from "bun:test";
import {
  connectionUrlFromResponse,
  type DialSocket,
  FetchWebSocketDialer,
  SocketAdapter,
} from "./slack-dialer.ts";
import type { SocketFrame } from "./socket-mode.ts";

// --- PURE: response parsing ---------------------------------------------------

test("connectionUrlFromResponse returns the wss url on success", () => {
  expect(connectionUrlFromResponse({ ok: true, url: "wss://slack/123" })).toBe("wss://slack/123");
});

test("connectionUrlFromResponse throws with the slack error when ok!==true", () => {
  expect(() => connectionUrlFromResponse({ ok: false, error: "invalid_auth" })).toThrow(/invalid_auth/);
  expect(() => connectionUrlFromResponse(null)).toThrow(/apps\.connections\.open/);
});

test("connectionUrlFromResponse throws when no url is returned", () => {
  expect(() => connectionUrlFromResponse({ ok: true })).toThrow(/no url/);
  expect(() => connectionUrlFromResponse({ ok: true, url: "" })).toThrow(/no url/);
});

// --- open() with injected fetch + socket factory (CI) -------------------------

class FakeSocket implements DialSocket {
  readonly sent: string[] = [];
  closed = false;
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  addEventListener(type: string, listener: (ev: unknown) => void): void {
    const list = this.listeners[type] ?? [];
    list.push(listener);
    this.listeners[type] = list;
  }
  emit(type: string, ev: unknown): void {
    for (const l of this.listeners[type] ?? []) l(ev);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
}

test("open() POSTs apps.connections.open with the app token and returns a connection", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const socket = new FakeSocket();
  const dialer = new FetchWebSocketDialer({
    fetchFn: (url, init) => {
      seen.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify({ ok: true, url: "wss://slack/abc" })));
    },
    socketFactory: () => socket,
  });

  const conn = await dialer.open("xapp-token");
  expect(seen[0]!.url).toBe("https://slack.com/api/apps.connections.open");
  expect((seen[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer xapp-token");
  expect(typeof conn.send).toBe("function");
});

test("open() rejects when slack returns ok:false", async () => {
  const dialer = new FetchWebSocketDialer({
    fetchFn: () => Promise.resolve(new Response(JSON.stringify({ ok: false, error: "invalid_auth" }))),
    socketFactory: () => new FakeSocket(),
  });
  await expect(dialer.open("xapp-bad")).rejects.toThrow(/invalid_auth/);
});

// --- SocketAdapter event wiring (CI) -----------------------------------------

test("SocketAdapter parses a JSON message frame and forwards it", () => {
  const socket = new FakeSocket();
  const adapter = new SocketAdapter(socket);
  const frames: SocketFrame[] = [];
  adapter.onMessage((f) => frames.push(f));
  socket.emit("message", { data: JSON.stringify({ type: "interactive", envelope_id: "e1" }) });
  expect(frames).toEqual([{ type: "interactive", envelope_id: "e1" }]);
});

test("SocketAdapter drops non-string and non-JSON messages", () => {
  const socket = new FakeSocket();
  const adapter = new SocketAdapter(socket);
  const frames: SocketFrame[] = [];
  adapter.onMessage((f) => frames.push(f));
  socket.emit("message", { data: 42 }); // non-string
  socket.emit("message", { data: "" }); // empty
  socket.emit("message", { data: "{not json" }); // malformed
  expect(frames).toHaveLength(0);
});

test("SocketAdapter forwards close, send, and close()", () => {
  const socket = new FakeSocket();
  const adapter = new SocketAdapter(socket);
  let closed = false;
  adapter.onClose(() => {
    closed = true;
  });
  socket.emit("close", undefined);
  expect(closed).toBe(true);

  adapter.send("ack");
  expect(socket.sent).toEqual(["ack"]);

  adapter.close();
  expect(socket.closed).toBe(true);
});

// --- LIVE: gated end-to-end (off-CI, like AGP_DOCKER_E2E) ---------------------

test.skipIf(process.env.AGP_SLACK_LIVE !== "1")(
  "real Socket Mode: apps.connections.open opens a connection",
  async () => {
    const appToken = process.env.AGP_SLACK_APP_TOKEN;
    expect(appToken, "AGP_SLACK_APP_TOKEN required for the live dialer test").toBeTruthy();
    const conn = await new FetchWebSocketDialer().open(appToken as string);
    expect(typeof conn.send).toBe("function");
    conn.close();
  },
);
