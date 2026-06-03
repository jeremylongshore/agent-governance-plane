---
title: "Spec: Journal Event Schema (on-disk)"
date: 2026-06-02
author: Jeremy Longshore
type: Specification (SPEC)
epic: Epic 10 — signed audit journal + offline verifier (bead agp-qn7)
source: src/journal/, contract src/contracts/journal-event.ts
---

# Spec: Journal Event Schema (on-disk)

The audit journal is JSONL: one signed `JournalEvent` per line, in append order.
The event shape is the frozen Epic 03 contract
([`013-AT-CONT-journal-event.md`](013-AT-CONT-journal-event.md)); this spec covers
how it is sealed and stored on disk.

## Sealing

For each event, in order:

1. Build the event sans `hash` and `signature` (with `prevHash` = the prior
   event's `hash`, or `null` for the genesis event; `seq` = prior + 1).
2. `bytes = prevHash ‖ canonicalJson(event sans hash+signature)` — canonical JSON
   sorts keys recursively so the bytes are stable.
3. `hash = sha256_hex(bytes)`.
4. `signature = Ed25519(bytes)` — the signature signs the **same bytes** the hash
   covers, so a hash check and a signature check cover identical content.

## Files

| File | Contents |
|------|----------|
| `audit.log` | the JSONL event chain |
| `audit.log.head` | signed head checkpoint: `{ seq, hash, signature }` over `canonicalJson({seq,hash})` |

The head checkpoint is what makes truncation detectable: the hash chain alone
still verifies after a tail is removed, but the signed head pins the expected
`(seq, hash)` of the real tail.

## Reserved fields (council non-negotiable, AT-DECR Q4)

`tenant_id`, `signing_key_id`, `approval_binding_type`, `sprite_identity_uri` are
present in every event and **null at v0**. They are reserved so activating them
later is not a breaking change. `signing_key_id` being null is why v0 is a
single signing-key era (see audit-chain ARCH).

## Claim discipline

The accurate description is **"signed audit log of every tool call."** The terms
"tamper-evident," "nonrepudiable," "compliance-grade," and "forensic" are **not**
used (Epic 11 enforces this via the claim registry).
