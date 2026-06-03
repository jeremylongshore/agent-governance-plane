---
title: "Examples: Policy Rules"
date: 2026-06-02
author: Jeremy Longshore
type: Operational Examples (EXAMP)
epic: Epic 09 — policy engine (bead agp-9r8)
source: src/policy/engine.ts
---

# Examples: Policy Rules

Drop these into `~/.agp/policy.json`. Each rule is
`{ id, effect, tool?, actor?, tier?, priority?, reason? }`:

- `effect`: `allow` | `deny` | `require` (require = human approval)
- `tool`: a tool name, or `"*"` for any (default `"*"`)
- `actor`: optional `session_owner` | `claude_process`
- `priority`: tie-breaker within the same effect (higher wins; default 0)

Combining is **strictest-wins** (`deny` > `require` > `allow`), and no matching
rule is **default-deny**. So you write what is *permitted*; everything else is
denied.

## Dogfooding (single operator, read-mostly)

```json
{
  "rules": [
    { "id": "read-ok", "effect": "allow", "tool": "Read", "reason": "reads are safe" },
    { "id": "search-ok", "effect": "allow", "tool": "Grep" },
    { "id": "writes-need-approval", "effect": "require", "tool": "Write", "reason": "confirm edits" },
    { "id": "edits-need-approval", "effect": "require", "tool": "Edit" },
    { "id": "no-shell", "effect": "deny", "tool": "Bash", "reason": "no unattended shell" }
  ]
}
```

Anything not listed (e.g. `WebFetch`) is denied by default.

## Small team (allow shell for the owner, gate the agent)

```json
{
  "rules": [
    { "id": "read-ok", "effect": "allow", "tool": "Read" },
    { "id": "owner-shell", "effect": "allow", "tool": "Bash", "actor": "session_owner" },
    { "id": "agent-shell-approve", "effect": "require", "tool": "Bash", "actor": "claude_process" },
    { "id": "writes-approve", "effect": "require", "tool": "Write" }
  ]
}
```

`Bash` from `session_owner` is allowed; from `claude_process` it requires
approval — the strictest matching rule per actor wins.

## What `agp doctor --check policy` warns about

A wildcard auto-approve is dangerously permissive and is flagged (the policy is
still accepted — the warning is for you):

```json
{ "rules": [ { "id": "yolo", "effect": "allow", "tool": "*" } ] }
```

→ `WARN: rule 'yolo' auto-approves ALL tools (tool: "*") — includes shell/write/network`.

A malformed policy (bad JSON or an unknown `effect`) is a **fatal** error, not a
warning: `doctor` fails and `agp run` refuses to start (fail-closed).
