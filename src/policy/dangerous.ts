// Dangerous-operation classification + policy linting.
//
// At v0 the engine evaluates on verified signals only (tool + actor), so danger
// is classified by tool name. The point is not to block the operator's choices
// but to surface when a policy is dangerously permissive — e.g. a broad
// auto-approve that covers shell/write/network/secret tools (CCSC's
// detectBroadAutoApprove).

import type { PolicyRule, PolicyFile } from "./engine.ts";

export type DangerCategory = "shell" | "write" | "network" | "secret" | "vcs";

const DANGEROUS_TOOLS: Record<string, DangerCategory> = {
  Bash: "shell",
  Shell: "shell",
  Exec: "shell",
  sh: "shell",
  Write: "write",
  Edit: "write",
  MultiEdit: "write",
  NotebookEdit: "write",
  WebFetch: "network",
  WebSearch: "network",
  Fetch: "network",
};

export function classifyTool(tool: string): DangerCategory | null {
  return DANGEROUS_TOOLS[tool] ?? null;
}

export function isDangerous(tool: string): boolean {
  return classifyTool(tool) !== null;
}

export interface PolicyValidation {
  errors: string[];
  warnings: string[];
}

/** Warn on dangerously permissive auto-approve patterns. */
export function detectBroadAutoApprove(rules: PolicyRule[]): string[] {
  const warnings: string[] = [];
  for (const rule of rules) {
    if (rule.effect !== "allow") continue;
    if (rule.tool === "*") {
      warnings.push(`rule '${rule.id}' auto-approves ALL tools (tool: "*") — includes shell/write/network`);
    } else {
      const category = classifyTool(rule.tool);
      if (category) {
        warnings.push(`rule '${rule.id}' auto-approves dangerous tool '${rule.tool}' (${category})`);
      }
    }
  }
  return warnings;
}

/** Structural validation beyond the schema (which is enforced fatally at load). */
export function validatePolicy(file: PolicyFile): PolicyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const seen = new Set<string>();
  for (const rule of file.rules) {
    if (seen.has(rule.id)) errors.push(`duplicate rule id '${rule.id}'`);
    seen.add(rule.id);
  }

  warnings.push(...detectBroadAutoApprove(file.rules));
  return { errors, warnings };
}
