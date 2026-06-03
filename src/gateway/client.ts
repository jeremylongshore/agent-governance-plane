// GatewayClient — the sandbox-side end of the Gateway protocol. It connects to
// the control plane's Unix domain socket, sends a tool-call request, and awaits
// the verdict/result correlated by message id.
//
// Fail-closed by construction: a request whose response does not arrive within
// the timeout rejects (a missing verdict must never be read as an allow), and a
// dropped connection (control-plane crash / sandbox teardown mid-call) rejects
// every in-flight request rather than hanging.

import { connect, type Socket } from "node:net";
import type { GatewayMessage, ToolCallRequest } from "../contracts/gateway-message.ts";
import { encodeMessage, FrameDecoder, GatewayProtocolError } from "./protocol.ts";

export interface GatewayClientOptions {
  socketPath: string;
  /** How long to wait for a correlated response before failing closed. */
  timeoutMs?: number;
}

interface Pending {
  resolve: (msg: GatewayMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GatewayClient {
  private readonly socketPath: string;
  private readonly timeoutMs: number;
  private sock: Socket | null = null;
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<string, Pending>();

  constructor(opts: GatewayClientOptions) {
    this.socketPath = opts.socketPath;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = connect(this.socketPath);
      sock.setEncoding("utf8");
      sock.once("connect", () => {
        this.sock = sock;
        sock.on("data", (chunk: string) => this.onData(chunk));
        // A closed/errored link fails closed: reject everything still in flight.
        sock.on("close", () => this.failAll(new Error("gateway connection closed")));
        sock.on("error", (err) => this.failAll(err));
        resolve();
      });
      sock.once("error", reject);
    });
  }

  private onData(chunk: string): void {
    let messages: GatewayMessage[];
    try {
      messages = this.decoder.push(chunk);
    } catch (err) {
      // A malformed reply from the peer fails closed for everything in flight.
      this.failAll(err instanceof GatewayProtocolError ? err : (err as Error));
      this.sock?.destroy();
      return;
    }
    for (const msg of messages) {
      const waiter = this.pending.get(msg.id);
      if (!waiter) continue; // unsolicited / already-settled id — ignore
      clearTimeout(waiter.timer);
      this.pending.delete(msg.id);
      waiter.resolve(msg);
    }
  }

  private failAll(err: Error): void {
    for (const [, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
    this.pending.clear();
  }

  /** Send a tool-call request and await its correlated response (fail-closed). */
  request(req: ToolCallRequest): Promise<GatewayMessage> {
    if (!this.sock) return Promise.reject(new Error("gateway client not connected"));
    if (this.pending.has(req.id)) {
      return Promise.reject(new Error(`request id '${req.id}' already in flight`));
    }
    return new Promise<GatewayMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req.id);
        reject(new Error(`gateway request '${req.id}' timed out after ${this.timeoutMs}ms (fail-closed)`));
      }, this.timeoutMs);
      this.pending.set(req.id, { resolve, reject, timer });
      this.sock!.write(encodeMessage(req));
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.failAll(new Error("gateway client closing"));
      if (!this.sock) return resolve();
      this.sock.end(() => resolve());
    });
  }
}
