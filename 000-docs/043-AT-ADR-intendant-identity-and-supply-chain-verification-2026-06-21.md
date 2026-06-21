---
title: ADR — Intendant Identity and Supply-Chain Verification (Ed25519 v0, Sigstore seam by v0.6)
date: 2026-06-21
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted
epic: agp-z26 — Build intendant identity and supply-chain verification for AGP adapters (GitHub #16, Epic 13)
decision: Pluggable Verifier seam + Ed25519 v0 backend; identity URI threaded into the signed journal; full Sigstore deferred to v0.6
---

# ADR — Intendant Identity and Supply-Chain Verification

## Status

Accepted (CTO, 2026-06-21). Supersedes the open question left by the reserved
`intendant_identity_uri` slot in `src/contracts/journal-event.ts` and the reserved
`uri` member of `IntendantIdentity` in `src/contracts/intendant-adapter.ts`.
Implements Epic 13 (bead `agp-z26`, GitHub `#16`), tracked in `039-PP-ROAD`
(item #3, P2). Council constraints from `001-AT-DECR` (Sigstore-signed intendant
releases + identity registry are CISO non-negotiable by v0.6, triggered at 10+
users) and `002-PP-PLAN` (the v0 threat model explicitly does not defend against a
supply-chain attack on a third-party intendant; that defense ships at v0.6) are
honored, not weakened.

## Context

AGP drives an agent harness (the **intendant**, per `038-AT-ADR` — never "sprite")
through the frozen `IntendantAdapter` contract (`016-AT-CONT`). Two facts from the
contract layer set the boundary:

1. `IntendantIdentity` (`src/contracts/intendant-adapter.ts`) already carries
   `name`, `version`, and a `uri` member reserved for supply-chain verification and
   `null` at v0.
2. `JournalEvent` (`src/contracts/journal-event.ts`, `013-AT-CONT` / `023-AT-SPEC`)
   carries `intendant_identity_uri` as one of four CISO-locked reserved-future
   fields — present in the schema from commit 1, hardcoded `null` at v0
   (`src/journal/journal.ts`). Reserving it means populating it later is not a
   breaking change.

The single most important orienting fact is the **single-operator v0 framing**
(`001-AT-DECR` Q3): v0 is built for one operator who directly controls which
intendant binary is loaded. There is no supply-chain attack surface when the
operator is the only principal — which is exactly why `agp-z26` is P2, not P1. It
is built ahead of the user base and ahead of the second harness, because a new
third-party intendant adapter is precisely the artifact that needs identity and
verification.

The hard requirement from the council: by v0.6 (10+ users), intendant releases are
Sigstore-signed and an identity registry maps each `intendant_identity_uri` to its
provenance metadata. We must not ship full keyless Sigstore now (OIDC + Fulcio +
Rekor adds a network dependency that cannot run in the offline single-host v0
environment per `029-AT-ADR`), and we must not ship nothing (the reserved slots
would stay vestigial and the v0.6 migration would look like a mid-product pivot).

## Decision

### 1. Identity model — how a session records which intendant ran

A structured intendant identity URI, threaded through the journal so every session
is provenance-tagged at `session.started`.

**URI shape.** `IntendantIdentity.uri` is an opaque-but-structured string the
verifier produces, never a free-form label. v0 uses a self-describing local scheme
that carries the same fields a Sigstore identity will later carry, so the journal
column means the same thing across the version boundary:

- v0 (Ed25519 backend): `agp-intendant:ed25519/{name}@{version}/{fingerprint}`,
  where the fingerprint is `sha256Hex` of the SPKI public-key PEM, truncated to 16
  hex chars. Self-contained: a reader can match it against the verifying public key
  without a registry.
- v0.6 (Sigstore backend): `sigstore://github:{org}/{repo}@{tag}`, resolved through
  the identity registry.

The URI is produced by the verifier (see §2), not hardcoded in each adapter — so an
unverified or self-asserted identity never reaches the journal as if it were
verified. At v0, an adapter that has not been through verification records
`uri: null` (honest: "ran, but provenance not asserted"), and the daemon may be
configured to refuse such adapters (see §3).

**Journal threading.** The daemon already journals `intendant.identity` inside the
`session.started` payload — descriptive only, in `payload`, not in the locked
top-level `intendant_identity_uri` column. This ADR makes the daemon also set the
top-level `intendant_identity_uri` field on `session.started` to
`intendant.identity.uri`, moving that field from "always null" to "the verified
identity URI for this session, or null if none." Because the field is already in
the schema and contract-tested, populating it is non-breaking — exactly as the
council reservation intended. The offline verifier (`src/journal/verify.ts`)
continues to verify the chain and signatures unchanged; it now additionally
surfaces the per-session identity URI.

### 2. Supply-chain verification design — pluggable Verifier seam, Ed25519 backend at v0

A single pluggable `Verifier` interface (the seam) with one concrete backend at v0
and a documented second backend at v0.6 — option (C): ship real, offline,
production-grade verification now using the Ed25519 primitives already in
`src/runtime/crypto.ts`, with the interface unchanged when the Sigstore backend
lands.

```ts
interface Verifier {
  // Verify a detached signature over the intendant's manifest bytes; on success
  // return the resolved IntendantIdentity (uri populated); on failure return a
  // typed failure. Never throws for an untrusted artifact — returns a verdict.
  verify(manifest: IntendantManifest, signatureB64: string): Promise<VerifyResult>;
  // The scheme this backend speaks ("ed25519" at v0, "sigstore" at v0.6).
  readonly scheme: string;
}
```

- **v0 backend — `Ed25519Verifier`.** Wraps `verifyEd25519` / `loadPublicKey` /
  `sha256Hex` / `canonicalJson` from `src/runtime/crypto.ts`. An intendant ships a
  small canonical-JSON **manifest** (`{ name, version, ... }`) and a detached
  base64 Ed25519 signature over `canonicalJson(manifest)`, signed by a trusted
  intendant-author key. The verifier checks the signature against an
  operator-trusted public key (default `~/.agp/intendants/ed25519.pub`, mirroring
  the journal-key convention in `src/cli/commands/keygen.ts`). On success it derives
  the pubkey fingerprint and returns the populated `agp-intendant:ed25519/...` URI.
  Fully offline, no network, no new dependency.
- **v0.6 backend — `SigstoreVerifier` (deferred, §4).** Same interface; verifies a
  Sigstore bundle and resolves the identity through the registry. Callers unchanged.

Because the URI is minted by the verifier, the identity that lands in the journal is
always one that passed verification — the journal is honest about provenance by
construction.

### 3. Refuse-to-run-unverified behavior

The daemon gains a configurable identity policy with three modes, fail-closed by
default once a second intendant exists:

- `off` — do not verify (current v0 behavior; the single CCSC-shipped Claude Code
  intendant). The journal records `intendant_identity_uri: null`.
- `warn` — verify, journal an `intendant.verify.failed` event on failure, but allow
  the run. Useful while onboarding a new intendant author.
- `enforce` — verify before `intendant.start()`; on failure, journal an
  `intendant.verify.failed` denial and **refuse to start the session** (no sandbox
  spawn, no tool calls). This is the supply-chain gate: an unsigned or mismatched
  intendant cannot run.

The gate runs at the top of `runLive` / `runScripted`, before the
`session.started` append for a successful verify, so the very first event of any
enforced session already carries the verified URI. Default mode at v0 is `off`
(single trusted CCSC intendant); the moment Epic 12's second intendant (Codex)
lands, the default for non-CCSC intendants becomes `enforce`.

### 4. Deferred to v0.6 (CISO non-negotiable, trigger = 10+ users)

- **Sigstore keyless backend** (`SigstoreVerifier`): Fulcio cert + Rekor
  transparency log, GitHub OIDC for release signing. Slots behind the same
  `Verifier` interface — no caller change.
- **Intendant identity registry**: maps `intendant_identity_uri` → provenance
  metadata. v0 needs no registry because the Ed25519 URI is self-describing against
  a trusted local key.
- **Migration is additive, not a pivot.** Old Ed25519-signed intendants keep
  verifying via `Ed25519Verifier`; new ones verify via `SigstoreVerifier`; both URI
  schemes coexist in the same journal column.
- **Marketing claims stay locked.** `scripts/claim-scan.sh` permits exactly one v0
  security claim — "signed audit log of every tool call." This ADR ships
  verification but unlocks **no new public claim**; `MARKETING_CLAIMS.md` is updated
  only when v0.6 actually ships Sigstore. Internally we describe the capability
  plainly ("the daemon can refuse to run an intendant whose manifest signature does
  not verify"), never with any denylisted assurance term.

## Consequences

- The reserved `intendant_identity_uri` slot and the reserved `IntendantIdentity.uri`
  member finally carry meaning, exactly as the council reservation anticipated — and
  populating them is non-breaking because the schema reserved them at commit 1.
- v0 ships honest, offline, real verification with the crypto already in the tree —
  no new runtime dependency, no network, no over-engineering.
- The `Verifier` interface is the single seam: the v0.6 Sigstore work swaps an
  implementation, not the architecture, satisfying the CISO non-negotiable without a
  visible pivot.
- Adding the `IntendantManifest` type touches the frozen contract surface; per
  `016-AT-CONT` a contract change requires a Bead + ADR — satisfied here. The
  `IntendantAdapter` interface methods (`start`/`onToolCall`/`deliver`/`stop`) are
  unchanged.
- `agp verify` gains the ability to surface which intendant identity ran each
  session, strengthening the audit trail without changing the chain/signature
  contract.

## Alternatives considered

- **Full Sigstore keyless now.** Rejected: requires OIDC + Fulcio + Rekor, cannot
  run offline single-host, premature for one operator, and the seam is untestable
  at v0 (no OIDC issuer present).
- **cosign key-pair now.** Rejected: the v0→v0.6 migration from key-pair to keyless
  is a visible architectural pivot with a re-signing problem, not a clean seam.
- **Do nothing until v0.6.** Rejected: leaves the reserved slots vestigial, leaves
  the second-intendant supply-chain gate unbuilt when Codex lands, and makes the
  eventual Sigstore work look like a new system rather than a backend swap.

## Decomposition

Built as `agp-z26.1`–`.4`: (1) thread the identity URI into the journal; (2) the
`Verifier` interface + `IntendantManifest` contract seam; (3) the Ed25519 v0
backend; (4) the daemon off/warn/enforce gate.

## References

`016-AT-CONT` (IntendantAdapter), `013-AT-CONT` / `023-AT-SPEC` (journal event),
`001-AT-DECR` (v0.6 Sigstore non-negotiable), `002-PP-PLAN` (Epic 13 / threat
model), `029-AT-ADR` (offline Unix-socket gateway), `038-AT-ADR` (rename),
`039-PP-ROAD` (item #3). Bead: `agp-z26` (GitHub #16).
