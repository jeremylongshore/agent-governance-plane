import { test, expect } from "bun:test";
import { Actor } from "../../contracts/_common.ts";

// Frozen-contract guard (044-AT-ADR): the Actor enum stays exactly
// [session_owner, agent-process]. A second harness must NOT introduce a
// codex-specific actor — that is a breaking core-contract change AND would fork
// the policy surface (the per-harness backdoor this epic forbids). Because `actor`
// is typed as this enum, TS already blocks a non-enum actor value at the call
// site; this guard catches the only way to sneak one in — widening the enum.
test("the Actor enum stays frozen — no per-harness actor (no codex-specific value)", () => {
  expect(Actor.options).toEqual(["session_owner", "claude_process"]);
});
