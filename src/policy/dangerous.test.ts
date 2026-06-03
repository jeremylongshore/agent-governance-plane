import { test, expect } from "bun:test";
import { classifyTool, isDangerous, detectBroadAutoApprove, validatePolicy } from "./dangerous.ts";
import { PolicyFile } from "./engine.ts";

test("classifies shell / write / network tools as dangerous", () => {
  expect(classifyTool("Bash")).toBe("shell");
  expect(classifyTool("Write")).toBe("write");
  expect(classifyTool("WebFetch")).toBe("network");
  expect(classifyTool("Read")).toBeNull();
  expect(isDangerous("Bash")).toBe(true);
  expect(isDangerous("Read")).toBe(false);
});

test("detectBroadAutoApprove warns on a wildcard allow", () => {
  const warnings = detectBroadAutoApprove([{ id: "yolo", effect: "allow", tool: "*", priority: 0 }]);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("ALL tools");
});

test("detectBroadAutoApprove warns on auto-approving a dangerous tool", () => {
  const warnings = detectBroadAutoApprove([{ id: "shell-ok", effect: "allow", tool: "Bash", priority: 0 }]);
  expect(warnings[0]).toContain("dangerous tool 'Bash'");
});

test("a deny/require rule on a dangerous tool is NOT flagged", () => {
  expect(detectBroadAutoApprove([{ id: "no-bash", effect: "deny", tool: "Bash", priority: 0 }])).toHaveLength(0);
});

test("validatePolicy flags duplicate rule ids and surfaces broad-approve warnings", () => {
  const file = PolicyFile.parse({
    rules: [
      { id: "dup", effect: "allow", tool: "Read" },
      { id: "dup", effect: "deny", tool: "Bash" },
      { id: "broad", effect: "allow", tool: "*" },
    ],
  });
  const { errors, warnings } = validatePolicy(file);
  expect(errors.some((e) => e.includes("duplicate rule id 'dup'"))).toBe(true);
  expect(warnings.some((w) => w.includes("ALL tools"))).toBe(true);
});
