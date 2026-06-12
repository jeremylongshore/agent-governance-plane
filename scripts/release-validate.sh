#!/usr/bin/env bash
# release-validate.sh — release-readiness gate for AGP (Epic 15 / agp-upt).
#
# Exits 0 only if the repo is in a releasable state: every hard CI gate passes,
# the version/changelog are present, and the release-discipline artifacts exist.
# Run before tagging a release; the release workflow (.github/workflows/release.yml)
# does the actual bump/tag, this script answers "is it safe to?".
#
# Usage: bash scripts/release-validate.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0
pass() { echo "  PASS  $1"; }
bad()  { echo "  FAIL  $1"; fail=1; }

run() { # run "<label>" <cmd...>
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$label"; else bad "$label"; fi
}

echo "== AGP release-validate =="

echo "-- hard gates --"
run "typecheck"        bun run typecheck
run "lint (Biome)"     bun run lint
run "coverage gate"    bash scripts/coverage-gate.sh
run "claim-scan"       bash scripts/claim-scan.sh
run "doc-drift"        bash scripts/doc-drift.sh
run "harness verify"   scripts/audit-harness verify
run "architecture"     scripts/audit-harness arch
run "markdownlint"     npx markdownlint-cli2 --config .markdownlint.json "**/*.md" "!node_modules/**" "!**/CHANGELOG.md"

echo "-- release artifacts --"
[ -f version.txt ]                                    && pass "version.txt present"                || bad "version.txt missing"
[ -f CHANGELOG.md ]                                   && pass "CHANGELOG.md present"               || bad "CHANGELOG.md missing"
ls 000-docs/*OD-TMPL-aar-template.md >/dev/null 2>&1  && pass "AAR template present"               || bad "AAR template missing (000-docs/*OD-TMPL-aar-template.md)"
ls 000-docs/*OD-PROC-release-checklist.md >/dev/null 2>&1 && pass "release checklist present"      || bad "release checklist missing"
ls 000-docs/*OD-SPEC-evidence-bundle-format.md >/dev/null 2>&1 && pass "evidence-bundle spec present" || bad "evidence-bundle spec missing"

echo "-- changelog references current version --"
if [ -f version.txt ] && [ -f CHANGELOG.md ]; then
  ver="$(tr -d '[:space:]' < version.txt)"
  if grep -qF "$ver" CHANGELOG.md; then pass "CHANGELOG mentions $ver"; else bad "CHANGELOG.md does not mention version $ver"; fi
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "release-validate: PASS — release-ready."
  exit 0
fi
echo "release-validate: FAIL — not release-ready (see FAIL lines above)."
exit 1
