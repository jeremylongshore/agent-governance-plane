import { test, expect } from "bun:test";
import { RefPolicyEvaluator, type PolicyRule } from "./policy.ts";

function evaluator(rules: PolicyRule[]): RefPolicyEvaluator {
  return new RefPolicyEvaluator(rules);
}

test("first matching rule wins; no match is default-deny", () => {
  const ev = evaluator([
    { id: "allow-read", effect: "allow", tool: "Read" },
    { id: "deny-bash", effect: "deny", tool: "Bash" },
  ]);
  expect(ev.evaluate({ tool: "Read", actor: "claude_process" }).decision).toBe("allow");
  expect(ev.evaluate({ tool: "Bash", actor: "claude_process" }).decision).toBe("deny");

  const noMatch = ev.evaluate({ tool: "Write", actor: "claude_process" });
  expect(noMatch.decision).toBe("deny");
  expect(noMatch.ruleId).toBeNull();
  expect(noMatch.reason).toContain("default-deny");
});

test("a 'require' rule names its rule (PolicyVerdict invariant holds)", () => {
  const ev = evaluator([{ id: "req-write", effect: "require", tool: "Write" }]);
  const v = ev.evaluate({ tool: "Write", actor: "claude_process" });
  expect(v.decision).toBe("require");
  expect(v.ruleId).toBe("req-write");
});

test("an actor constraint scopes a rule (non-matching actor falls through to deny)", () => {
  const ev = evaluator([{ id: "owner-bash", effect: "allow", tool: "Bash", actor: "session_owner" }]);
  expect(ev.evaluate({ tool: "Bash", actor: "session_owner" }).decision).toBe("allow");
  expect(ev.evaluate({ tool: "Bash", actor: "claude_process" }).decision).toBe("deny");
});

test("a wildcard tool rule matches anything", () => {
  const ev = evaluator([{ id: "allow-all", effect: "allow", tool: "*" }]);
  expect(ev.evaluate({ tool: "AnythingAtAll", actor: "claude_process" }).decision).toBe("allow");
});
