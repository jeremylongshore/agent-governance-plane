import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PolicyEngine, loadPolicyEngine, type PolicyRule } from "./engine.ts";

function engine(rules: PolicyRule[]): PolicyEngine {
  return new PolicyEngine(rules);
}

test("no matching rule is default-deny (fail-closed) — dangerous tools never default-allow", () => {
  const e = engine([{ id: "allow-read", effect: "allow", tool: "Read", priority: 0 }]);
  const v = e.evaluate({ tool: "Bash", actor: "claude_process" });
  expect(v.decision).toBe("deny");
  expect(v.ruleId).toBeNull();
});

test("STRICTEST effect wins regardless of rule order (deny beats allow)", () => {
  // allow comes first, but a matching deny must still win
  const e = engine([
    { id: "allow-all", effect: "allow", tool: "*", priority: 0 },
    { id: "deny-bash", effect: "deny", tool: "Bash", priority: 0 },
  ]);
  const v = e.evaluate({ tool: "Bash", actor: "claude_process" });
  expect(v.decision).toBe("deny");
  expect(v.ruleId).toBe("deny-bash");
});

test("require beats allow but loses to deny", () => {
  const e = engine([
    { id: "allow", effect: "allow", tool: "Write", priority: 0 },
    { id: "require", effect: "require", tool: "Write", priority: 0 },
  ]);
  expect(e.evaluate({ tool: "Write", actor: "claude_process" }).decision).toBe("require");
});

test("priority breaks ties within the same effect", () => {
  const e = engine([
    { id: "low", effect: "allow", tool: "Read", priority: 1 },
    { id: "high", effect: "allow", tool: "Read", priority: 5 },
  ]);
  expect(e.evaluate({ tool: "Read", actor: "claude_process" }).ruleId).toBe("high");
});

test("actor constraint scopes a rule", () => {
  const e = engine([{ id: "owner-bash", effect: "allow", tool: "Bash", actor: "session_owner", priority: 0 }]);
  expect(e.evaluate({ tool: "Bash", actor: "session_owner" }).decision).toBe("allow");
  expect(e.evaluate({ tool: "Bash", actor: "claude_process" }).decision).toBe("deny");
});

test("loadPolicyEngine is FATAL on a malformed policy (never silently ignored)", () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-pol-"));
  const path = join(dir, "policy.json");
  writeFileSync(path, "{ not json");
  expect(() => loadPolicyEngine(path)).toThrow();
  writeFileSync(path, JSON.stringify({ rules: [{ id: "x", effect: "banana" }] }));
  expect(() => loadPolicyEngine(path)).toThrow();
  writeFileSync(path, JSON.stringify({ rules: [{ id: "ok", effect: "allow", tool: "Read" }] }));
  expect(loadPolicyEngine(path).evaluate({ tool: "Read", actor: "session_owner" }).decision).toBe("allow");
  rmSync(dir, { recursive: true, force: true });
});
