#!/usr/bin/env bash
# scripts/claim-scan.sh — banned-claim hygiene check for AGP public surfaces.
#
# Seeds Epic 11 ("AGP claim-control enforcement"). The full MARKETING_CLAIMS.md +
# version-gated registry lands when Epic 11 closes; this script is the start.
#
# What it does:
#   Greps the AGP-public surfaces (README, AGENTS, CLAUDE, CONTRIBUTING, SECURITY,
#   SUPPORT, CHANGELOG, .github/) for security claims that are NOT allowed at v0.
#
# What it deliberately DOES NOT scan:
#   - 000-docs/ — these are internal planning + audit + review docs. They legitimately
#     DISCUSS what claims are banned (e.g. "we will NOT claim tamper-evident") which
#     would false-positive on a naive scan. Epic 11's MARKETING_CLAIMS.md will handle
#     internal-doc tagging once it lands.
#   - Foundation council docs (006/007/008/009 or their AGP-renumbered 001-004
#     versions) — same reason.
#
# Allowed at v0: "signed audit log of every tool call" (and equivalents).
# Banned at v0: tamper-evident, tamper-proof, nonrepudiable, forensic-grade,
#               audit-grade, compliance-grade.
#
# Exit codes:
#   0 = no banned claims found in scanned surfaces
#   1 = banned claim(s) detected — PR blocked

set -euo pipefail

BANNED_PATTERNS='tamper.?evident|tamper.?proof|nonrepudiat|forensic.?grade|audit.?grade|compliance.?grade'

SURFACES=(
  README.md
  AGENTS.md
  CLAUDE.md
  CONTRIBUTING.md
  SECURITY.md
  SUPPORT.md
  CODE_OF_CONDUCT.md
)

# Also scan top-level .github/ files (PR template, issue templates, FUNDING, etc.)
mapfile -t GH_FILES < <(find .github -type f \( -name '*.md' -o -name '*.yml' \) 2>/dev/null || true)

ALL_FILES=("${SURFACES[@]}" "${GH_FILES[@]}")

violations=0
echo "[claim-scan] Scanning ${#ALL_FILES[@]} public-surface files for v0-banned claims..."
echo "[claim-scan] Banned patterns: $BANNED_PATTERNS"
echo "[claim-scan] Scope: AGP-public surfaces (README/AGENTS/CLAUDE/etc. + .github/)"
echo "[claim-scan] Out of scope: 000-docs/ (internal planning); CHANGELOG (auto-generated)"
echo

for f in "${ALL_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    if matches=$(grep -nE "$BANNED_PATTERNS" "$f" 2>/dev/null); then
      echo "FAIL: $f"
      echo "$matches" | sed 's/^/  /'
      echo
      violations=$((violations + 1))
    fi
  fi
done

if [[ $violations -gt 0 ]]; then
  echo "[claim-scan] BLOCKED: $violations file(s) contain v0-banned claims."
  echo "[claim-scan] Allowed v0 claim: \"signed audit log of every tool call\""
  echo "[claim-scan] See AGP Epic 11 (agp-6mq) for the full claim-control rationale."
  exit 1
fi

echo "[claim-scan] PASS: no v0-banned claims found on public surfaces."
exit 0
