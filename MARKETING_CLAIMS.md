# MARKETING_CLAIMS.md — AGP claim-control registry

> **This file is enforcement, not prose.** `scripts/claim-scan.sh` reads the
> machine-readable block below as its single source of truth and fails CI on any
> AGP-public surface that uses a banned term. Per council decision Q4
> (`001-AT-DECR`), marketing/security claims are **code**: a claim does not exist
> until it is registered here and backed by a shipped primitive. The CISO seat
> holds veto authority over every entry.

## Why this exists

Security wording must never outrun shipped primitives. AGP's public surface is
deliberately **stricter** than the CCSC substrate's casual wording — the
substrate's stronger words must not leak into AGP-public copy (Epic 00
contradiction C6). Every claim below maps to a primitive that actually ships at
the stated version.

## Allowed claims by version

A claim may appear on an AGP-public surface only if it is listed for the current
version tag (or an earlier one).

| Version | Allowed claim | Backing primitive |
|---------|---------------|-------------------|
| v0 | "signed audit log of every tool call" | Ed25519-signed, hash-chained journal (CCSC `journal.ts` substrate) — local authoritative log |
| v0 | "governs multiple agent harnesses (Claude Code and Codex) identically through one policy gate and signed journal" | The `IntendantAdapter` contract + the contract-conformance test (`agp-cln.1`) and the concurrent-session test (`agp-cln.3`): both harnesses produce identical governance with **no harness-specific path** in the gate. Scope: a *contract-genericity* claim proven deterministically; it does **not** assert the live Codex path is validated (that path is operator-validated / provisional per `045-AT-ADR`). |

Nothing else is an approved security claim at v0. When a new primitive ships, add
its claim here in the same PR that ships the primitive — never before. (The
multi-harness row was added only after `agp-cln.1` + `agp-cln.3` shipped green —
claims-as-code, never ahead of the primitive.)

## Banned terms (v0)

These assurance terms over-promise relative to what v0 ships (single-operator,
local signed log — **not** a multi-party, externally-verifiable, or
compliance-audited guarantee). They are forbidden on AGP-public surfaces until a
primitive that earns them ships and a corresponding allowed-claim row is added
above.

The scanner consumes the regex between the markers below. Edit the registry here;
do **not** hardcode the list anywhere else.

<!-- CLAIM-SCAN:BANNED-REGEX:V0:START -->
<!-- regex: tamper.?evident|tamper.?proof|nonrepudiat|forensic.?grade|audit.?grade|compliance.?grade -->
<!-- CLAIM-SCAN:BANNED-REGEX:V0:END -->

In human-readable form, the banned terms are: tamper&#8203;-evident,
tamper&#8203;-proof, non&#8203;repudiable / non&#8203;repudiation,
forensic&#8203;-grade, audit&#8203;-grade, and compliance&#8203;-grade. (The
zero-width breaks keep this list from tripping the scanner against this registry
itself; the authoritative pattern is the regex in the marked block above.)

## Scope

`scripts/claim-scan.sh` scans the AGP-public surfaces — `README.md`, `AGENTS.md`,
`CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`,
and the `.github/` templates — plus is run on demand against `000-docs/`.

**Deliberately out of scope:** this file (`MARKETING_CLAIMS.md`) is the registry
and must enumerate the banned terms, so the scanner does not scan it; and
`000-docs/` planning/audit docs legitimately discuss banned claims while
designing the control (e.g. `007-OD-AUDT`).

## Emergency override

Removing a term from the banned list, or shipping a claim ahead of its primitive,
requires explicit operator (Jeremy) approval recorded against a Bead, per
[`000-docs/010-OD-PROC-emergency-claim-override.md`](000-docs/010-OD-PROC-emergency-claim-override.md).
The CISO seat may veto any addition regardless.
