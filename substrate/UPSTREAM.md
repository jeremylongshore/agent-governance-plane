# CCSC substrate — upstream pin, provenance, and drift review

Per ADR [`000-docs/040-AT-ADR-substrate-boundary-reconciliation-2026-06-12.md`](../000-docs/040-AT-ADR-substrate-boundary-reconciliation-2026-06-12.md)
(Accepted 2026-06-12), AGP consumes the CCSC governance kernel by
**independent reimplementation** ("adapt-and-harden") under AGP's own typed
contracts — **not** by vendoring a copy. This supersedes the vendor mechanism in
[`009-AT-ADR`](../000-docs/009-AT-ADR-ccsc-substrate-extraction-strategy.md)
(Option A) for v0; 009's Option-D shared-package end-state is retained,
trigger-gated on a second consumer (the second harness, `agp-cln`).

This file records *what AGP reimplemented*, *from which upstream pin*, and the
*drift-review process* that keeps the reimplementation honest against upstream.

## Pin

| Field | Value |
|-------|-------|
| Upstream | `claude-code-slack-channel` |
| Repo | `https://github.com/jeremylongshore/claude-code-slack-channel` |
| Local reference clone | `~/000-projects/claude-code-slack-channel/` |
| Pinned tag | `v0.10.0` |
| Pinned commit | `023cab3` |
| Upstream license | Apache-2.0 (relicensed from MIT in CCSC PR #194) |

The pin is the commit AGP's reimplementation is **level with** for drift review —
the baseline a periodic diff against CCSC `HEAD` is measured from. It is not a
vendored-copy source (nothing is copied byte-for-byte).

## Reimplemented primitives + provenance

The kernel subset AGP composes — reimplemented in `src/`, each module carrying an
"Adapted from CCSC ..." provenance header, hardened beyond the reference:

| AGP module | Adapted from (CCSC) | Hardening over reference |
|------------|---------------------|--------------------------|
| `src/policy/engine.ts` | `policy.ts` / `policy-dispatch.ts` | strictest-wins (deny > require > allow) vs first-match |
| `src/journal/journal.ts` + `src/runtime/crypto.ts` | `journal.ts` + `crypto.ts` + `audit-key-loader.ts` | signed HEAD checkpoint (truncation detection) |
| `src/channels/slack/nonce-store.ts` + `slack-channel.ts` | `nonce-hitl.ts` + `stream-reply.ts` | same one-shot invariant, AGP contract layer |
| `src/sandbox/docker/*` | (AGP-original; no CCSC counterpart) | `--cap-drop ALL`, no-new-privileges, network preflight |

The boundary is the typed contracts in `src/contracts/` plus these provenance
headers; there is no `substrate/ccsc/` tree and no import from one.

## Drift-review process

Because AGP reimplemented rather than vendored, there is no automatic re-sync.
Drift is tracked deliberately:

1. Periodically — and before each minor release — diff AGP's reimplemented
   primitives against CCSC `HEAD` for **security-relevant** changes.
2. Record findings in "Upstream changes since pin" below.
3. For each material gap, file a bead + GitHub issue; decide adopt / decline with
   rationale. Bump the **Pin** when AGP's reimplementation is brought level.

## License

AGP's governance modules are an Apache-2.0 derivative of CCSC's Apache-2.0 source
(design + semantics adapted). Attribution is recorded in the top-level
[`NOTICE`](../NOTICE). No relicensing is required (Apache-2.0 ↔ Apache-2.0).

## Upstream changes since pin (drift review)

Security-relevant CCSC changes landed after the `v0.10.0` pin, assessed against
AGP's as-built reality (full analysis in `040-AT-ADR`):

| Upstream change | CCSC PR | AGP posture | Action |
|-----------------|---------|-------------|--------|
| `SECRET_DECLARATIONS` table + helpers (`lib.ts`) | #216 | AGP uses a stronger model — `{{secret:NAME}}` placeholders resolved only post-gate; journal records names, never values | No adoption needed |
| `assertNoSecretValues()` fail-closed value-exfiltration guard (`lib.ts`) | #217 | AGP records only tool **names** + decisions (never args/values/stdout) in the journal, and posts `{tool, verdict}` to Slack — so no value leaks today, but the invariant was convention, not enforced | **Adopted** — `assertNoSecretValues` wired fail-closed at journal-append + channel-emit so the invariant cannot silently regress (defense-in-depth, not an active-leak fix) |

**Note:** these are drift-review findings, not vendored-copy re-sync items. The
`assertNoSecretValues` adoption is defense-in-depth — AGP's journal/channel are
already value-free by construction; the guard makes that property fail-closed code
so a future change adding a value-bearing field can't regress it silently.
