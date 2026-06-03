---
title: "Architecture: Policy Integration"
date: 2026-06-02
author: Jeremy Longshore
type: Architecture (ARCH)
epic: Epic 09 — policy engine + fail-closed decision flow (bead agp-9r8)
source: src/policy/
---

# Architecture: Policy Integration

How a tool call moves from "observed" to "governed". The policy engine
(`src/policy/`) evaluates every tool call the daemon mediates and returns a
`PolicyVerdict` ([`014-AT-CONT`](014-AT-CONT-policy-verdict.md)). Adapted from
CCSC `policy.ts`.

## Verified signals only

A decision uses only **verified** signals: the `tool` name and the `actor`
(`session_owner` | `claude_process`). It does not branch on arbitrary tool args,
which an agent could shape to dodge a rule.

## Combining algorithm — strictest wins, default-deny

Among all rules that match (`tool` equals the call's tool or `*`, and `actor`
matches if constrained):

1. The **strictest** effect wins: `deny` > `require` > `allow`.
2. Ties within an effect break by `priority` (higher first), then declaration order.
3. **No matching rule → deny** (fail-closed).

Strictest-wins (not first-match) means rule ordering can never accidentally allow
what a `deny` rule forbids.

## Dangerous operations never default to allow

Shell (`Bash`/`Shell`/…), write (`Write`/`Edit`/…), and network (`WebFetch`/…)
tools are classified dangerous. They are not special-cased into allow — the base
is default-deny, so a dangerous tool with no rule is denied. What the engine adds
is **linting**: `detectBroadAutoApprove` warns when a policy auto-approves all
tools (`tool: "*"` allow) or a specific dangerous tool.

## Fatal parse

`loadPolicyFile` throws on malformed JSON or a schema violation — a broken policy
is never silently ignored (that would fail open). The same loader powers
`agp doctor` (and `agp doctor --check policy`), which reports errors as a failed
check and surfaces broad-auto-approve warnings.

## Journaling

Every decision the daemon makes is written to the signed journal as
`tool_call.{allow,deny,require}` with the matching `ruleId`, so the audit chain
records not just what happened but which rule decided it.
