// GatewayServer — the control-plane end of the Gateway protocol. It listens on
// a Unix domain socket (network transport is forbidden at v0 — see
// 000-docs/029-AT-ADR-gateway-unix-socket-only.md), reads framed tool-call
// requests from a sandboxed sprite, runs an injected mediation handler (the
// daemon's gate loop), and writes the correlated response.
//
// Security posture (v0): the sandbox is a confused-deputy factory. The single-
// host Unix-socket topology is the mitigation — there is no network surface to
// reach the socket. On top of that this server is fail-closed:
//   - malformed / oversize / non-request frames are rejected, never processed;
//   - a request id already processed is rejected (replay / duplicate guard);
//   - a handler that throws yields an error response, never a silent allow.

import { createServer, type Server, type Socket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import type { GatewayMessage, ToolCallRequest } from "../contracts/gateway-message.ts";
import { encodeMessage, FrameDecoder, GatewayProtocolError } from "./protocol.ts";

/** Mediation: turn a tool-call request into the response to send back. */
export type MediationHandler = (req: ToolCallRequest) => Promise<GatewayMessage>;

export interface GatewayServerOptions {
  socketPath: string;
  handler: MediationHandler;
}

function errorMessage(id: string, sessionId: string, message: string): GatewayMessage {
  return { kind: "error", id, sessionId, message };
}

export class GatewayServer {
  private readonly socketPath: string;
  private readonly handler: MediationHandler;
  private server: Server | null = null;
  /** Live connections, so close() can drop them (a real crash closes sockets). */
  private readonly sockets = new Set<Socket>();
  /** Request ids already processed — replay/duplicate guard, server-wide so it
   *  also catches a replay arriving on a fresh connection. */
  private readonly processed = new Set<string>();

  constructor(opts: GatewayServerOptions) {
    this.socketPath = opts.socketPath;
    this.handler = opts.handler;
  }

  listen(): Promise<void> {
    if (existsSync(this.socketPath)) unlinkSync(this.socketPath); // clear a stale socket
    this.server = createServer((sock) => this.onConnection(sock));
    return new Promise((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.socketPath, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
  }

  private onConnection(sock: Socket): void {
    sock.setEncoding("utf8");
    this.sockets.add(sock);
    sock.on("close", () => this.sockets.delete(sock));
    const decoder = new FrameDecoder();
    sock.on("data", (chunk: string) => {
      let messages: GatewayMessage[];
      try {
        messages = decoder.push(chunk);
      } catch (err) {
        // Malformed / oversize → fail closed: tell the peer and drop the link.
        if (err instanceof GatewayProtocolError) {
          sock.write(encodeMessage(errorMessage("unknown", "unknown", err.message)));
          sock.end();
          return;
        }
        throw err;
      }
      for (const msg of messages) void this.dispatch(msg, sock);
    });
    sock.on("error", () => sock.destroy());
  }

  private async dispatch(msg: GatewayMessage, sock: Socket): Promise<void> {
    // The server only accepts requests; anything else is a protocol misuse.
    if (msg.kind !== "tool_call_request") {
      sock.write(encodeMessage(errorMessage(msg.id, msg.sessionId, `server expects tool_call_request, got '${msg.kind}'`)));
      return;
    }
    // Replay / duplicate guard.
    if (this.processed.has(msg.id)) {
      sock.write(encodeMessage(errorMessage(msg.id, msg.sessionId, "duplicate/replayed request id rejected")));
      return;
    }
    this.processed.add(msg.id);

    let response: GatewayMessage;
    try {
      response = await this.handler(msg);
    } catch (err) {
      // A mediation failure is fail-closed: an error response, never a silent allow.
      response = errorMessage(msg.id, msg.sessionId, `mediation failed: ${(err as Error).message}`);
    }
    sock.write(encodeMessage(response));
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      // Drop live connections so in-flight peers fail closed (crash semantics).
      for (const sock of this.sockets) sock.destroy();
      this.sockets.clear();
      this.server.close(() => {
        if (existsSync(this.socketPath)) {
          try {
            unlinkSync(this.socketPath);
          } catch {
            /* best effort */
          }
        }
        resolve();
      });
    });
  }
}
