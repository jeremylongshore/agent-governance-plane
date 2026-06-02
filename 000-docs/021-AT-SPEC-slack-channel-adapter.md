---
title: "Spec: Slack Channel Adapter"
date: 2026-06-02
author: Jeremy Longshore
type: Specification (SPEC)
epic: Epic 08 — Slack channel adapter + HITL (bead agp-yep)
source: src/channels/slack/
---

# Spec: Slack Channel Adapter

The production `ChannelAdapter` (contract: `018-AT-CONT`) backed by Slack. It is
the operator UI for human-in-the-loop approvals — **not** the trust anchor. The
local hash-chained journal stays authoritative; Slack is a projection.

## Components

| Module | Role |
|--------|------|
| `slack-channel.ts` — `SlackChannel` | implements `postApprovalRequest` / `awaitDecision` / `projectEvent` |
| `nonce-store.ts` — `NonceStore` | one-time approval nonces (mint / consume) |
| `blocks.ts` | Block Kit approval prompt (Approve/Deny buttons carry the nonce) |
| `transport.ts` — `SlackTransport` | Slack Web API seam; `FetchSlackTransport` is the live impl |
| `interactions.ts` — `InteractionSource` | delivers the human's click; Socket Mode is the live connect-step |

Both the transport and the interaction source are injected, so the adapter's
security logic is fully unit-tested without a live workspace.

## Flow

1. A `require` verdict → `postApprovalRequest`: mint a nonce bound to
   (`messageId`, `sessionId`, expiry); post a Block Kit prompt whose Approve/Deny
   buttons carry the nonce.
2. `awaitDecision`: receive the click via the `InteractionSource`, enforce the
   invariants below, and return an `ApprovalDecision`.
3. `projectEvent`: best-effort mirror of journal events to the channel.

## Security invariants (tested)

- **One-time nonce.** A nonce is consumed on first use; a replay is rejected
  (`replay-attack.test.ts`). Expired or wrong-request nonces are also rejected.
- **No bot approvals.** A bot/app actor (`isBot`) can never approve, and its
  attempt does not consume the nonce (so it can't DoS a still-valid request).
- **Projection, not authority.** `projectEvent` is best-effort: it returns
  `false` on a Slack failure and **never throws**, so a Slack outage or rate
  limit cannot corrupt the authoritative journal.

## Configuration

- Bot token + target channel (env `AGP_SLACK_*` or `~/.agp/config.json`).
- The live click stream is Slack **Socket Mode** (`block_actions` payloads); that
  connect-step is the operational wiring for running the daemon in Slack mode.
  The adapter, Block Kit, and nonce HITL are complete and tested independently of
  it.
