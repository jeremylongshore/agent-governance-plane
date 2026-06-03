# CCSC substrate — upstream pin and vendor record

Per ADR [`000-docs/009-AT-ADR-ccsc-substrate-extraction-strategy.md`](../000-docs/009-AT-ADR-ccsc-substrate-extraction-strategy.md)
(Accepted 2026-06-01, Option A), AGP consumes the CCSC governance kernel by
**vendoring a pinned subset** into `substrate/ccsc/`. This file is the binding
record of *what* is vendored and *from where*. It is authoritative until the
physical copy lands (see "Status" below).

## Pin

| Field | Value |
|-------|-------|
| Upstream | `claude-code-slack-channel` |
| Repo | `https://github.com/jeremylongshore/claude-code-slack-channel` |
| Local reference clone | `~/000-projects/claude-code-slack-channel/` |
| Pinned tag | `v0.10.0` |
| Pinned commit | `023cab3` |
| Upstream license | Apache-2.0 (relicensed from MIT in CCSC PR #194) |

The pin is exact: vendored files are copied from this commit and not edited
in-place. Upstream fixes are pulled by re-syncing to a new pin (below), never by
divergent local edits.

## Vendored module subset

The kernel subset AGP composes (the gate, the signed journal, and the Slack HITL
relay). All paths are repo-root files in CCSC at the pinned commit:

| Module | Purpose in AGP |
|--------|----------------|
| `policy.ts`, `policy-dispatch.ts` | `gate()` policy evaluation (fail-closed decision) |
| `journal.ts`, `crypto.ts`, `audit-key-loader.ts` | hash-chained, Ed25519-signed audit journal + key loading |
| `nonce-hitl.ts` | nonce-bound human-in-the-loop approval |
| `stream-reply.ts` | Slack thread / Block-Kit relay |
| `manifest.ts` | manifest / config surface the above depend on |

`server.ts` (3250 LoC) and `lib.ts` (1894 LoC) are **not** vendored wholesale —
they mix app wiring with kernel logic. The specific helpers AGP needs from them
are carved out when Epic 04 wires the daemon, and recorded here at that time.

## Re-sync procedure

1. Choose a new upstream pin (tag + commit) in the CCSC clone.
2. Re-copy the module subset above from that commit into `substrate/ccsc/`,
   preserving CCSC's Apache-2.0 headers.
3. Update the **Pin** table here (tag + commit) and note the bump in the AGP
   bead + the changelog.
4. Run the CCSC→AGP substrate-compatibility tests (Epic 04+) and fix any drift
   before merging.

## License

Vendored files retain CCSC's copyright and Apache-2.0 license; AGP is also
Apache-2.0. Attribution is recorded in the top-level [`NOTICE`](../NOTICE).

## Status

- **Decision:** recorded (ADR Accepted, Option A).
- **Boundary contract:** this file + `NOTICE` — established.
- **Physical copy of `substrate/ccsc/`:** deferred to **Epic 04**, when the AGP
  CLI/daemon first imports the kernel. Vendoring ~5k LoC before any consumer
  exists would only invite drift; this record is the binding commitment until
  then.
- **Substrate-compatibility tests:** Epic 04 (need the Bun/TS test harness it
  introduces).

## Upstream changes since pin (pending re-sync)

Tracked here so the Epic-04 carve-out picks them up. These are upstream-only
(landed in CCSC `main` after the `v0.10.0` pin); AGP has not physically vendored
`lib.ts` yet, so nothing is broken — this is a forward record, not a drift fix.

| Upstream change | CCSC bead / PR | Why AGP wants it |
|-----------------|----------------|------------------|
| `SECRET_DECLARATIONS` table + `secretPlaceholder` / `buildSecretValueSet` / `allowedSinkFor` in `lib.ts` — one declaration is the source of placeholder, guard, and routing | `ccsc-z0n.1`, CCSC PR #216 | The declaration-as-enforcement source the value-exfiltration guard below derives from. |
| `assertNoSecretValues()` in `lib.ts` — value-exfiltration guard, **additive companion** to `assertSendable` (signature unchanged) | `ccsc-z0n.3`, CCSC PR #217 | Blocks a live credential value leaving in any outbound payload (message text / file body / attachment), not just secret *files* by path. AGP's sandbox sprite handles real credentials, so it wants the stronger guard. |

**Re-sync note:** this is a deliberate kernel strengthening, not a divergence —
when Epic 04 carves the `lib.ts` helpers into `substrate/ccsc/`, include both
`SECRET_DECLARATIONS` (+ its derivation helpers) and `assertNoSecretValues`, and
bump the **Pin** table to the CCSC commit that carries them. The additive shape
(`assertSendable` untouched) is intentional so this re-sync is a pure add, never
a signature migration.
