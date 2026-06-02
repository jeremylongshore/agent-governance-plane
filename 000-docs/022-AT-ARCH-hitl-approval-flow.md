---
title: "Architecture: HITL Approval Flow"
date: 2026-06-02
author: Jeremy Longshore
type: Architecture (ARCH)
epic: Epic 08 — Slack channel adapter + HITL (bead agp-yep)
---

# Architecture: HITL Approval Flow

How a policy `require` verdict becomes a human decision without ever letting
Slack become the source of truth.

## Sequence

```text
sprite → tool_call_request
  daemon: policy.evaluate → verdict = require
  daemon: journal.append("tool_call.require")          # authoritative, local, signed
  daemon: channel.postApprovalRequest(req)
    SlackChannel: nonceStore.mint(messageId, sessionId) # one-time nonce
    SlackChannel: transport.postMessage(Block Kit w/ nonce on Approve/Deny)
  operator clicks Approve/Deny in Slack
    InteractionSource (Socket Mode): block_actions → SlackInteraction{nonce,approved,userId,isBot}
  daemon: channel.awaitDecision(handle)
    SlackChannel: reject if isBot (no bot approvals)
    SlackChannel: nonceStore.consume(nonce, messageId)  # one-time; replay → reject
    → ApprovalDecision{approved, decidedBy}
  daemon: journal.append("approval.granted" | "approval.denied")  # authoritative
  daemon: if approved → sandbox.exec → journal "tool_call.executed"
```

## Trust boundaries

- **The journal is authoritative.** Every gating decision is journaled locally
  and signed before and after the Slack round-trip. The record of what happened
  does not depend on Slack succeeding.
- **Slack is a projection.** Posting the prompt and mirroring events are
  best-effort. A dropped message, a rate limit, or an outage degrades the UI, not
  the audit record — `projectEvent` returns `false` and never throws.
- **The nonce is the binding.** The Approve/Deny buttons carry a one-time nonce
  bound to the exact request. This is what makes a click trustworthy: it can't be
  replayed, can't be aimed at a different request, and expires.
- **Humans only.** A peer bot or app in the channel cannot click-to-approve; the
  adapter rejects non-human actors (inheriting CCSC's `gate()` invariant).

## What this does NOT defend

- A compromised operator Slack account can approve (the human IS the authority);
  binding stronger approval to a hardware key (WebAuthn) is a reserved future
  field (`approval_binding_type`) that lands later.
- Slack-side message spoofing is mitigated by the nonce (a forged button without
  the live nonce is rejected) but Slack workspace compromise is out of v0 scope.
