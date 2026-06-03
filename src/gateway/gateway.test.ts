import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GatewayServer, type MediationHandler } from "./server.ts";
import { GatewayClient } from "./client.ts";
import { encodeMessage, decodeMessage, FrameDecoder, GatewayProtocolError, MAX_FRAME_BYTES } from "./protocol.ts";
import type { GatewayMessage, ToolCallRequest } from "../contracts/gateway-message.ts";
import type { SpriteAdapter } from "../contracts/sprite-adapter.ts";
import { Daemon } from "../daemon/daemon.ts";
import { Journal } from "../journal/journal.ts";
import { PolicyEngine, type PolicyRule } from "../policy/engine.ts";
import { RecordingSandbox } from "../runtime/sandbox.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { generateSigningKeyPem, loadPrivateKey } from "../runtime/crypto.ts";
import { connect } from "node:net";

function req(id: string, tool = "Read", args: Record<string, unknown> = {}): ToolCallRequest {
  return { kind: "tool_call_request", id, sessionId: "s1", tool, args, actor: "claude_process" };
}

function allowVerdict(r: ToolCallRequest): GatewayMessage {
  return {
    kind: "policy_verdict",
    id: r.id,
    sessionId: r.sessionId,
    verdict: { decision: "allow", reason: "ok", ruleId: "test", tier: null },
  };
}

function sockPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "agp-gw-"));
  return { dir, path: join(dir, "g.sock") };
}

async function withServer(handler: MediationHandler, fn: (path: string) => Promise<void>): Promise<void> {
  const { dir, path } = sockPath();
  const server = new GatewayServer({ socketPath: path, handler });
  await server.listen();
  try {
    await fn(path);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── protocol framing ───────────────────────────────────────────────────────

test("encode/decode round-trips a GatewayMessage", () => {
  const r = req("a1");
  expect(decodeMessage(encodeMessage(r).trimEnd())).toEqual(r);
});

test("decodeMessage fails closed on invalid JSON and on schema-invalid frames", () => {
  expect(() => decodeMessage("{not json")).toThrow(GatewayProtocolError);
  expect(() => decodeMessage(JSON.stringify({ kind: "nope" }))).toThrow(GatewayProtocolError);
});

test("FrameDecoder splits multiple newline-delimited frames and buffers partials", () => {
  const dec = new FrameDecoder();
  expect(dec.push(`${JSON.stringify(req("a"))}\n${JSON.stringify(req("b"))}\n`)).toHaveLength(2);
  expect(dec.push(JSON.stringify(req("c")))).toHaveLength(0); // no newline yet
  expect(dec.push("\n")).toHaveLength(1);
});

test("FrameDecoder fails closed on an oversize unterminated frame", () => {
  const dec = new FrameDecoder();
  expect(() => dec.push("x".repeat(MAX_FRAME_BYTES + 1))).toThrow(GatewayProtocolError);
});

// ── transport round-trip ─────────────────────────────────────────────────────

test("a request gets its correlated verdict back over the Unix socket", async () => {
  await withServer(
    async (r) => allowVerdict(r),
    async (path) => {
      const client = new GatewayClient({ socketPath: path });
      await client.connect();
      const resp = await client.request(req("call-1"));
      expect(resp.kind).toBe("policy_verdict");
      expect(resp.id).toBe("call-1");
      await client.close();
    },
  );
});

test("responses are correlated by id across interleaved requests", async () => {
  await withServer(
    // Reply out of order: delay the first so the second returns first.
    async (r) => {
      if (r.id === "slow") await new Promise((res) => setTimeout(res, 30));
      return allowVerdict(r);
    },
    async (path) => {
      const client = new GatewayClient({ socketPath: path });
      await client.connect();
      const [a, b] = await Promise.all([client.request(req("slow")), client.request(req("fast"))]);
      expect(a.id).toBe("slow");
      expect(b.id).toBe("fast");
      await client.close();
    },
  );
});

// ── replay / duplicate guard ─────────────────────────────────────────────────

test("a replayed/duplicate request id is rejected (not re-mediated)", async () => {
  let mediations = 0;
  await withServer(
    async (r) => {
      mediations++;
      return allowVerdict(r);
    },
    async (path) => {
      const client = new GatewayClient({ socketPath: path });
      await client.connect();
      const first = await client.request(req("dup"));
      expect(first.kind).toBe("policy_verdict");
      const second = await client.request(req("dup"));
      expect(second.kind).toBe("error");
      expect((second as { message: string }).message).toContain("duplicate");
      expect(mediations).toBe(1); // handler ran only once
      await client.close();
    },
  );
});

test("the server rejects a non-request message kind", async () => {
  await withServer(
    async (r) => allowVerdict(r),
    async (path) => {
      const client = new GatewayClient({ socketPath: path });
      await client.connect();
      // Send a verdict (server should only accept requests).
      const resp = await client.request({
        // deliberately the wrong kind, but shaped enough to frame + correlate by id
        ...(allowVerdict(req("x1")) as object),
      } as unknown as ToolCallRequest);
      expect(resp.kind).toBe("error");
      await client.close();
    },
  );
});

// ── fail-closed: malformed, timeout, disconnect ──────────────────────────────

test("a malformed frame from the client gets an error and the link is dropped", async () => {
  await withServer(
    async (r) => allowVerdict(r),
    async (path) => {
      // Raw socket so we can send garbage the typed client would never emit.
      const raw = connect(path);
      raw.setEncoding("utf8");
      const got = await new Promise<string>((resolve) => {
        raw.on("connect", () => raw.write("{ this is not json }\n"));
        raw.on("data", (d: string) => resolve(d));
      });
      expect(decodeMessage(got.trimEnd()).kind).toBe("error");
      raw.destroy();
    },
  );
});

test("a missing verdict fails closed via timeout", async () => {
  await withServer(
    // Never respond.
    () => new Promise<GatewayMessage>(() => {}),
    async (path) => {
      const client = new GatewayClient({ socketPath: path, timeoutMs: 50 });
      await client.connect();
      await expect(client.request(req("never"))).rejects.toThrow(/timed out.*fail-closed/);
      await client.close();
    },
  );
});

test("a control-plane crash mid-call rejects the in-flight request (fail closed)", async () => {
  const { dir, path } = sockPath();
  const server = new GatewayServer({ socketPath: path, handler: () => new Promise<GatewayMessage>(() => {}) });
  await server.listen();
  const client = new GatewayClient({ socketPath: path, timeoutMs: 5_000 });
  await client.connect();
  const inflight = client.request(req("crash"));
  await server.close(); // simulate the control plane going away mid-call
  await expect(inflight).rejects.toThrow(/connection closed/);
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

// ── composition with the real daemon gate loop ───────────────────────────────

test("the Gateway carries a real daemon.gate decision: deny is delivered as a deny verdict", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-gw-d-"));
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "deny-bash", effect: "deny", tool: "Bash" }] as PolicyRule[]),
    journal: new Journal(join(dir, "audit.log"), priv, () => "2026-06-03T00:00:00.000Z"),
    sandbox: new RecordingSandbox(),
    channel: new ConsoleChannel({}, () => {}),
  });

  // Server handler = run daemon.gate, capturing the verdict it delivers.
  const handler: MediationHandler = async (r) => {
    let delivered: GatewayMessage | null = null;
    const capturing: SpriteAdapter = {
      identity: { name: "gateway", version: "0", uri: null },
      start: () => Promise.resolve(),
      onToolCall: () => {},
      deliver: (m) => {
        delivered = m;
        return Promise.resolve();
      },
      stop: () => Promise.resolve(),
    };
    await daemon.gate(r, capturing);
    return delivered ?? { kind: "error", id: r.id, sessionId: r.sessionId, message: "no verdict" };
  };

  const path = join(dir, "g.sock");
  const server = new GatewayServer({ socketPath: path, handler });
  await server.listen();
  const client = new GatewayClient({ socketPath: path });
  await client.connect();
  const resp = await client.request(req("c1", "Bash", { command: "rm -rf /" }));
  expect(resp.kind).toBe("policy_verdict");
  expect((resp as { verdict: { decision: string } }).verdict.decision).toBe("deny");
  await client.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});
