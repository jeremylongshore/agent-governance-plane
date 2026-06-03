---
title: "Architecture: Audit Chain"
date: 2026-06-02
author: Jeremy Longshore
type: Architecture (ARCH)
epic: Epic 10 — signed audit journal + offline verifier (bead agp-qn7)
source: src/journal/
---

# Architecture: Audit Chain

The audit chain is a real primitive: a SHA-256 hash chain with per-event Ed25519
signatures and a signed head checkpoint, verifiable offline by anyone holding the
public key. It is what makes "signed audit log of every tool call" a true claim.

## What the offline verifier catches

`agp verify [journal-path]` (and `src/journal/verify.ts`) re-derive every hash
and signature with the **public key** (no private key needed) and check the
chain + the signed head. It catches:

| Attack | How it's caught |
|--------|-----------------|
| **Edit** a payload | re-derived `hash` no longer matches the stored hash |
| **Insertion** of an event | `seq` / `prevHash` linkage breaks |
| **Reorder** of events | `seq` / `prevHash` linkage breaks |
| **Invalid signature** | Ed25519 verify fails for that event |
| **Signed→unsigned rollback** | a downgraded (v1/unsigned) line fails the v2-only contract parse |
| **Truncation / extension** | the journal tail no longer matches the signed head checkpoint |

Forging the head to match a truncated tail fails too: the head is signed, and the
attacker does not hold the signing key.

## Public/private separation

`agp keygen` writes the private key (`0600`) **and** the public key. The verifier
uses the public key, so an exported journal + public key can be verified by a
third party who never sees the private key. (A local operator who hasn't exported
the public key falls back to deriving it from their private key.)

## Key rotation (v0)

`agp keygen --force` rotates: the existing keypair is archived (`.bak-<ts>`) and a
fresh keypair is written. Because `signing_key_id` is null at v0, events cannot be
tagged with which key signed them, so a rotation begins a **new signing era** — a
new key does not retro-verify a journal signed by the old key. Cross-era
verification (selecting the key per event via `signing_key_id`) lands when that
reserved field activates (v0.1+).

## Trust boundary

The journal is the **authoritative** record (the Slack channel is only a
projection — see `022-AT-ARCH-hitl-approval-flow.md`). The chain proves integrity
and authorship to anyone with the public key; it does **not** prove the operator
was not coerced, and it is not described with stronger assurance words than
"signed" (Epic 11 claim control).
