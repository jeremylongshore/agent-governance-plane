#!/usr/bin/env bash
# scripts/doc-drift.sh — guard against path / numbering drift in docs.
#
# Once Epic 00 closes, these patterns must NOT appear in any doc on main:
#   - ~/000-projects/products-workspace/agp/   (pre-monorepo path)
#   - ~/000-projects/products/agp/             (pre-monorepo path variant)
#   - ~/000-projects/products/000-docs/        (pre-monorepo doc location)
#   - 006-AT-DECR-... 007-PP-PLAN-... etc.     (pre-renumbering doc IDs)
#
# This script is the C9 (path normalization) + C9-adjacent acceptance gate
# preserved as a permanent check so future contributors cannot reintroduce
# the drift.
#
# Exceptions (intentional retention of pattern):
#   - The script itself (this file) names the forbidden patterns to detect them.
#   - Validation/grep examples inside doc bodies that demonstrate "the gate
#     succeeds when this pattern is absent" — these use the patterns as STRINGS.
#     Such files must list themselves in EXCEPTIONS below.
#
# Exit codes:
#   0 = no drift
#   1 = drift detected

set -euo pipefail

# Files allowed to mention the forbidden patterns (because they're
# demonstrating the gate, not violating it).
EXCEPTIONS=(
  scripts/doc-drift.sh
  scripts/bead-validate.sh
)

# Build a sed expression to filter exception paths out of grep matches.
exception_filter=""
for ex in "${EXCEPTIONS[@]}"; do
  exception_filter+="|^$ex:"
done
exception_filter="${exception_filter#|}"

violations=0

echo "[doc-drift] Checking for forbidden path patterns..."
echo "[doc-drift] Patterns: products-workspace/agp, products/agp, products/000-docs"
echo "[doc-drift] Exceptions: ${EXCEPTIONS[*]}"
echo

if matches=$(grep -rEn --include='*.md' \
    'products-workspace/agp|~/000-projects/products/agp|/products/000-docs' \
    . 2>/dev/null | grep -vE "^./($exception_filter)" || true); then
  if [[ -n "$matches" ]]; then
    echo "FAIL: forbidden path patterns found"
    echo "$matches" | sed 's/^/  /'
    echo
    violations=$((violations + 1))
  fi
fi

echo "[doc-drift] Checking for pre-renumbering doc-ID references in foundation docs..."
# Allowed: in CHANGELOG entries referencing historical commits or the
# AGP repo's own .git history. Foundation docs (000-docs/001-004) must
# use their new numbering.
if matches=$(grep -rEn --include='000-docs/00[1-4]*.md' \
    '006-AT-DECR-isedc|007-PP-PLAN-agp-master|008-AA-AUDT-agp-operator|009-AR-CANN-agp-cannon' \
    . 2>/dev/null || true); then
  if [[ -n "$matches" ]]; then
    echo "FAIL: pre-renumbering doc references found in foundation docs"
    echo "$matches" | sed 's/^/  /'
    echo
    violations=$((violations + 1))
  fi
fi

if [[ $violations -gt 0 ]]; then
  echo "[doc-drift] BLOCKED: $violations category/categories of drift detected."
  echo "[doc-drift] See AGP Epic 00 child agp-5l8.4 (C9) for the path-normalization decision."
  exit 1
fi

echo "[doc-drift] PASS: no path or numbering drift detected."
exit 0
