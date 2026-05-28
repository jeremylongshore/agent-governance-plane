#!/usr/bin/env bash
# scripts/bead-validate.sh — informational bead-validation grep runner.
#
# Each Epic 00 child bead (C1-C10) carries a "Validation" section listing
# `grep` commands that prove the contradiction is resolved. This script runs
# them all and reports pass/fail. While Epic 00 is in flight (some children
# closed, others open), this script is INFORMATIONAL (continue-on-error in
# CI). Once Epic 00 fully closes, the CI workflow can flip the
# continue-on-error flag to false to make these gates hard-required.
#
# Bead-to-grep mapping is documented inline below so future contributors can
# trace back to the source-of-truth beads.

set -uo pipefail   # NOT -e — we want to run all checks even if some fail

passing=0
failing=0

# ────────────────────────────────────────────────────────────────────────
# Helper: run a grep that should produce ZERO results to pass.
# ────────────────────────────────────────────────────────────────────────
expect_zero() {
  local label="$1"
  local bead="$2"
  local pattern="$3"
  shift 3
  local files=("$@")
  if matches=$(grep -nE "$pattern" "${files[@]}" 2>/dev/null); then
    # Filter to actual VIOLATIONS (not in known supersession/rejection context)
    real=$(echo "$matches" | grep -vE 'REJECT|SUPERSED|REMOVED|HISTORICAL|NOT a|NOT an|does NOT|not a build driver|is dropped|>$' | grep -vE 'expect zero|expect non-zero' || true)
    if [[ -n "$real" ]]; then
      echo "FAIL [$bead] $label"
      echo "$real" | head -3 | sed 's/^/  /'
      failing=$((failing + 1))
      return 1
    fi
  fi
  echo "PASS [$bead] $label"
  passing=$((passing + 1))
}

# Run only if foundation docs exist.
if [[ ! -f 000-docs/001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md ]]; then
  echo "[bead-validate] foundation docs not present; nothing to validate"
  exit 0
fi

DOCS=(000-docs/001-AT-DECR-*.md 000-docs/002-PP-PLAN-*.md 000-docs/003-AA-AUDT-*.md)

echo "[bead-validate] Running Epic 00 acceptance-criteria greps..."
echo

# C1 — Forrester timing as a build driver
expect_zero "C1: no 'Forrester...April 2026' as build driver" "agp-5l8.2" \
  'Forrester.*April 2026|mid.March 2026' "${DOCS[@]}" || true

# C2 — Hosted demo as v0.2 goal
expect_zero "C2: no 'hosted demo' as a goal" "agp-5l8.1" \
  'hosted demo' "${DOCS[@]}" || true

# C7 — Anthropic API key auth assumption
expect_zero "C7: no 'Anthropic API key' as live auth model" "agp-5l8.8" \
  'Anthropic API key' "${DOCS[@]}" || true

# C8 — Direct-import lift-and-shift assumption
expect_zero "C8: no 'direct import' or unqualified 'monorepo refs' for CCSC" "agp-5l8.9" \
  'direct import|monorepo refs' "${DOCS[@]}" || true

# C9 — Pre-monorepo paths
expect_zero "C9: no products-workspace/agp or products/agp paths" "agp-5l8.4" \
  'products-workspace/agp|/products/agp|products/000-docs' "${DOCS[@]}" || true

# C10 — Decision-authority finality
expect_zero "C10: no 'hereby ratify' Claude-as-board finality phrasing" "agp-5l8.5/6" \
  'hereby ratify' "${DOCS[@]}" || true

# C4 — Stale CCSC LoC numbers
expect_zero "C4: no stale CCSC LoC figures (~13,000 / ~12,000 raw)" "agp-5l8.7" \
  '~13,000|~12,000' "${DOCS[@]}" || true

echo
echo "[bead-validate] Summary: $passing passing, $failing failing"
if [[ $failing -gt 0 ]]; then
  echo "[bead-validate] Epic 00 is in flight — some failures expected until all 10 children close."
fi
exit 0
