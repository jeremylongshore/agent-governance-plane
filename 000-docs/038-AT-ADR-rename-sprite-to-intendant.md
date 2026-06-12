# 038 — ADR: Rename "sprite" → "intendant" (the per-harness adapter)

**Status:** Accepted (CTO decision, 2026-06-12).

## Context

AGP's per-harness adapter — the unit the governance plane spawns, drives, gates, and
tears down — was called a **sprite** (contract `SpriteAdapter`, `016-AT-CONT`). Two
problems surfaced:

1. **Direct product collision in our exact lane.** [Fly.io](https://fly.io) ships
   **Sprites** ([sprites.dev](https://sprites.dev/), launched ~Jan 2026): *"stateful
   sandbox environments with checkpoint & restore"* for running AI/coding agents —
   **Claude Code named as an explicit use case.** That is the sandbox/infra layer
   directly *below* AGP (the layer AGP governs, per `030-AA-LAND`). Same word, same
   market, same flagship harness. It also made AGP's own prose incoherent ("run the
   sprite in the sandbox" → "run the Sprite in the Sprite"), and AGP could plausibly
   run a harness *on* a Fly Sprite.
2. **No brand tie.** "Sprite" (graphics/games) carried none of the product's meaning.

## Decision

Rename the adapter to **intendant**.

**Etymology (the point):** *intent* ← Latin ***intendere*** ("to stretch/direct toward,
to administer attention toward"); ***intendant*** is the agent-noun of that same verb —
"one who administers/executes on behalf of an authority." It is therefore (a) built from
the same root as **Intent** Solutions, and (b) a precise description of the governed
harness: it carries out the operator's intent under the plane's gated, delegated,
accountable authority. The throughline: *Intent Solutions' governance plane gates
intendants that carry out intent — gated, and signed.*

### Renames

| Was | Now |
|-----|-----|
| `SpriteAdapter` | `IntendantAdapter` |
| `SpriteIdentity` | `IntendantIdentity` |
| `RunnableSprite` | `RunnableIntendant` |
| `ClaudeCodeSprite` | `ClaudeCodeIntendant` |
| `ScriptedSprite` | `ScriptedIntendant` |
| `src/sprites/` | `src/intendants/` |
| `src/contracts/sprite-adapter.ts` | `src/contracts/intendant-adapter.ts` |
| `src/runtime/sprite.ts` | `src/runtime/intendant.ts` |
| `016-AT-CONT-sprite-adapter.md` | `016-AT-CONT-intendant-adapter.md` |
| `027-AT-SPEC-claude-code-sprite.md` | `027-AT-SPEC-claude-code-intendant.md` |
| `--sprite` / `AGP_SPRITE` | `--intendant` / `AGP_INTENDANT` |

The frozen `SpriteAdapter` contract (`016`) is renamed pre-public; this ADR is the record.

## Frozen foundation docs (001–004)

The ISEDC decision record (`001`), master blueprint (`002`), operator audit (`003`), and
adversarial review (`004`) are **frozen historical records** and are NOT edited. They
retain the term "sprite" as written at the time. **Term mapping: every "sprite" in
001–004 means "intendant" as renamed here.** Do not edit those files to chase the rename.

## Consequences

- Pre-public, so no external breakage. CLI flag/env renamed (`--intendant` / `AGP_INTENDANT`).
- The Fly.io Sprites collision is eliminated; "intendant" has no AI/dev-tool product owner.
- Future public surfaces use "intendant" exclusively.

## References

`016-AT-CONT-intendant-adapter`, `027-AT-SPEC-claude-code-intendant`, `030-AA-LAND`
(layer map placing Fly Sprites at the sandbox layer). External: [sprites.dev](https://sprites.dev/),
[Simon Willison on Sprites](https://simonwillison.net/2026/Jan/9/sprites-dev/).
