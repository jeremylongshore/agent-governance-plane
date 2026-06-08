// FetchWebSocketDialer — the real Socket Mode dialer.
//
// Flow: POST apps.connections.open with the app-level token -> { url } -> open a
// WebSocket to that wss URL -> adapt its message/close events to SocketConnection.
//
// `fetch` and the socket constructor are injected (defaulting to the globals) so
// the response handling and the event-adapter logic are CI-testable; only the
// real-network defaults (the global fetch + `new WebSocket`) run off-CI under
// AGP_SLACK_LIVE, mirroring how the Docker runner's real spawn is the only
// uncovered line of that adapter.

import type { SocketConnection, SocketDialer, SocketFrame } from "./socket-mode.ts";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** The minimal socket surface the dialer needs — a structural subset of the
 *  WebSocket API so a fake can stand in for it in CI. */
export interface DialSocket {
  addEventListener(type: string, listener: (ev: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => DialSocket;

/** The one genuinely live-only seam: open a real WebSocket. Exercised under
 *  AGP_SLACK_LIVE, not in CI (like the Docker runner's real spawn). */
function openWebSocket(url: string): DialSocket {
  return new WebSocket(url) as unknown as DialSocket;
}

export interface DialerOptions {
  base?: string;
  fetchFn?: FetchFn;
  socketFactory?: SocketFactory;
}

/** Extract the wss URL from an apps.connections.open response, or throw. PURE. */
export function connectionUrlFromResponse(json: unknown): string {
  const j = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  if (j.ok !== true) {
    throw new Error(`slack apps.connections.open failed: ${String(j.error ?? "unknown")}`);
  }
  const url = j.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("slack apps.connections.open returned no url");
  }
  return url;
}

export class FetchWebSocketDialer implements SocketDialer {
  private readonly base: string;
  private readonly fetchFn: FetchFn;
  private readonly socketFactory: SocketFactory;

  constructor(opts: DialerOptions = {}) {
    this.base = opts.base ?? "https://slack.com/api";
    this.fetchFn = opts.fetchFn ?? fetch;
    this.socketFactory = opts.socketFactory ?? openWebSocket;
  }

  async open(appToken: string): Promise<SocketConnection> {
    const res = await this.fetchFn(`${this.base}/apps.connections.open`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const url = connectionUrlFromResponse(await res.json());
    return new SocketAdapter(this.socketFactory(url));
  }
}

/** Adapts a DialSocket (WebSocket-shaped) to the SocketConnection seam. */
export class SocketAdapter implements SocketConnection {
  private readonly socket: DialSocket;

  constructor(socket: DialSocket) {
    this.socket = socket;
  }

  onMessage(handler: (frame: SocketFrame) => void): void {
    this.socket.addEventListener("message", (ev: unknown) => {
      const data = (ev as { data?: unknown }).data;
      if (typeof data !== "string" || data.length === 0) return;
      let frame: SocketFrame;
      try {
        frame = JSON.parse(data) as SocketFrame;
      } catch {
        return; // drop a non-JSON frame
      }
      handler(frame);
    });
  }

  onClose(handler: () => void): void {
    this.socket.addEventListener("close", () => handler());
  }

  send(text: string): void {
    this.socket.send(text);
  }

  close(): void {
    this.socket.close();
  }
}
