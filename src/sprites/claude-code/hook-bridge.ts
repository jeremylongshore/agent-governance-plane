// hook-bridge — the PreToolUse hook bridge. Claude Code runs this for EVERY tool
// call (a PreToolUse hook, matcher "*"); it reads the hook event from stdin, asks
// AGP's gate over the session Unix socket, and translates the verdict into the
// hook's allow/deny protocol.
//
// The contract here was MEASURED from claude 2.1.172, not guessed — see
// 000-docs/037-AT-ADR-live-harness-topology.md (D4). PreToolUse stdin carries
// {session_id, tool_name, tool_input, tool_use_id, hook_event_name, ...}; the
// hook signals allow with exit 0 and deny with exit 2 + a reason on stderr, which
// Claude surfaces and respects.
//
// Fail-closed by construction: an unparseable event, an unreachable gate, a
// timeout, or any non-allow verdict all DENY. A missing verdict is never an allow.

import type { ToolCallRequest } from "../../contracts/gateway-message.ts";
import { GatewayClient } from "../../gateway/client.ts";

/** The subset of Claude Code's PreToolUse hook stdin that AGP needs. */
export interface HookEvent {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: string;
}

/** allow → exit 0; deny → exit 2 with the reason on stderr (the measured contract). */
export interface BridgeResult {
  exitCode: 0 | 2;
  stderr?: string;
}

const ALLOW: BridgeResult = { exitCode: 0 };
const deny = (reason: string): BridgeResult => ({ exitCode: 2, stderr: reason });

/**
 * Parse the PreToolUse hook stdin JSON. Returns null for anything that is not a
 * usable PreToolUse event (the caller fails closed on null).
 */
export function parseHookEvent(stdin: string): HookEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.hook_event_name !== "PreToolUse") return null;

  const sessionId = o.session_id;
  const toolName = o.tool_name;
  const toolUseId = o.tool_use_id;
  if (typeof sessionId !== "string" || sessionId.length === 0) return null;
  if (typeof toolName !== "string" || toolName.length === 0) return null;
  if (typeof toolUseId !== "string" || toolUseId.length === 0) return null;
  const toolInput =
    typeof o.tool_input === "object" && o.tool_input !== null ? (o.tool_input as Record<string, unknown>) : {};

  return { sessionId, toolName, toolInput, toolUseId };
}

/**
 * Ask AGP's gate for a verdict on one parsed hook event. Fail-closed: connection
 * failure, timeout, a deny verdict, or any non-allow response all return a deny.
 */
export async function bridgeHookEvent(
  event: HookEvent,
  socketPath: string,
  timeoutMs = 30_000,
): Promise<BridgeResult> {
  const client = new GatewayClient({ socketPath, timeoutMs });
  try {
    await client.connect();
  } catch (err) {
    return deny(`AGP gate unreachable (fail-closed): ${(err as Error).message}`);
  }
  try {
    const req: ToolCallRequest = {
      kind: "tool_call_request",
      id: event.toolUseId,
      sessionId: event.sessionId,
      tool: event.toolName,
      args: event.toolInput,
      actor: "claude_process",
    };
    const res = await client.request(req);
    if (res.kind === "policy_verdict" && res.verdict.decision === "allow") {
      return ALLOW;
    }
    const reason =
      res.kind === "policy_verdict"
        ? res.verdict.reason
        : res.kind === "error"
          ? res.message
          : "no allow verdict";
    return deny(`AGP gate denied: ${reason}`);
  } catch (err) {
    return deny(`AGP gate error (fail-closed): ${(err as Error).message}`);
  } finally {
    await client.close();
  }
}

/** Parse + gate in one step. Unparseable stdin fails closed (deny). */
export async function runBridge(stdin: string, socketPath: string, timeoutMs = 30_000): Promise<BridgeResult> {
  const event = parseHookEvent(stdin);
  if (event === null) {
    return deny("AGP gate: unparseable PreToolUse event (fail-closed)");
  }
  return bridgeHookEvent(event, socketPath, timeoutMs);
}
