// INTERNAL — unstable — no public RFC.
//
// Canonical fixtures for the AGP core contracts: a known-valid example of each
// (and the building blocks tests mutate to produce known-invalid cases). Kept
// in one place so contract tests and, later, runtime code share the same
// reference shapes.

import type { JournalEvent } from "./journal-event.ts";
import type { PolicyVerdict } from "./policy-verdict.ts";
import type { GatewayMessage } from "./gateway-message.ts";
import type { IntendantIdentity } from "./intendant-adapter.ts";
import type { SandboxSpec, IsolationGuarantees } from "./sandbox-provider.ts";
import type { ApprovalRequest } from "./channel-adapter.ts";

const HASH = "a".repeat(64);
const SIG = "A".repeat(86) + "==";

export const validJournalEvent: JournalEvent = {
  v: 2,
  seq: 1,
  ts: "2026-06-01T00:00:00.000Z",
  prevHash: null,
  hash: HASH,
  kind: "tool_call.allow",
  actor: "session_owner",
  payload: { tool: "Read", path: "/work/x" },
  signature: SIG,
  // reserved future fields — present and null at v0 (council lock)
  tenant_id: null,
  signing_key_id: null,
  approval_binding_type: null,
  intendant_identity_uri: null,
  on_behalf_of: null,
};

export const validAllowVerdict: PolicyVerdict = {
  decision: "allow",
  reason: "read within workspace",
  ruleId: null,
  tier: null,
};

export const validRequireVerdict: PolicyVerdict = {
  decision: "require",
  reason: "writes outside workspace need approval",
  ruleId: "no-writes-outside-workspace",
  tier: "workspace",
};

export const validToolCallRequest: GatewayMessage = {
  kind: "tool_call_request",
  id: "msg-1",
  sessionId: "sess-1",
  tool: "Bash",
  args: { command: "ls" },
  actor: "claude_process",
};

export const validIntendantIdentity: IntendantIdentity = {
  name: "claude-code",
  version: "1.0.0",
  uri: null,
};

export const validSandboxSpec: SandboxSpec = {
  image: "agp-sandbox:v0",
  sessionId: "sess-1",
  networkEnabled: false,
};

export const containerIsolation: IsolationGuarantees = {
  kind: "docker-container",
  boundary: "process + filesystem isolation; NOT a VM/kernel boundary",
  vmGrade: false,
};

export const validApprovalRequest: ApprovalRequest = {
  messageId: "msg-1",
  sessionId: "sess-1",
  tool: "Bash",
  verdict: validRequireVerdict,
};
