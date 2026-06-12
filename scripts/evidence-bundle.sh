#!/usr/bin/env bash
# evidence-bundle.sh — assemble the closure evidence bundle for a governed run,
# per 000-docs/036-OD-SPEC-evidence-bundle-format.md. Collects the signed journal,
# the public key, the offline `agp verify` output, the event summary, and a filled
# AAR into one directory (uploaded as a CI artifact by the dogfood workflow).
#
# Usage:
#   scripts/evidence-bundle.sh --home <AGP_HOME> --out <dir> --task "<task>" --bead <id> [--repo <name>]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="" OUT="" TASK="" BEAD="" REPO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --home) HOME_DIR="$2"; shift 2;;
    --out)  OUT="$2"; shift 2;;
    --task) TASK="$2"; shift 2;;
    --bead) BEAD="$2"; shift 2;;
    --repo) REPO="$2"; shift 2;;
    *) echo "evidence-bundle: unknown arg '$1'" >&2; exit 2;;
  esac
done
[ -n "$HOME_DIR" ] && [ -n "$OUT" ] || { echo "evidence-bundle: --home and --out required" >&2; exit 2; }

journal="$HOME_DIR/audit.log"
pub="$HOME_DIR/signing/journal-ed25519.pub"
[ -f "$journal" ] || { echo "evidence-bundle: no journal at $journal (did the run produce one?)" >&2; exit 1; }

mkdir -p "$OUT"
cp "$journal" "$OUT/journal.log"
[ -f "$pub" ] && cp "$pub" "$OUT/journal-ed25519.pub"

# Offline verification, captured verbatim.
AGP_HOME="$HOME_DIR" bun "$ROOT/src/cli/index.ts" verify > "$OUT/verify.txt" 2>&1
verify_rc=$?

# Event summary (the governed timeline).
grep -oE '"kind":"[^"]+"' "$journal" | sed 's/"kind"://;s/"//g' > "$OUT/events.txt"
event_count=$(wc -l < "$OUT/events.txt" | tr -d ' ')
gated=$(grep -cE 'gate\.(allow|deny)' "$OUT/events.txt" 2>/dev/null || echo 0)

# Filled AAR (process evidence).
cat > "$OUT/AAR.md" <<AAR
# AAR — Governed dogfood run

- **Bead:** ${BEAD:-n/a}
- **Target repo:** ${REPO:-n/a}
- **Task:** ${TASK:-n/a}
- **Journal events:** ${event_count} (${gated} tool call(s) gated)
- **Offline verification:** $([ "$verify_rc" -eq 0 ] && echo "PASS — chain, signatures, and signed head verified" || echo "FAIL (see verify.txt)")

## Governed timeline

\`\`\`
$(cat "$OUT/events.txt")
\`\`\`

## Evidence

- \`journal.log\` — the signed, hash-chained audit log of the run.
- \`journal-ed25519.pub\` — the public key for offline verification.
- \`verify.txt\` — \`agp verify\` output.
- \`events.txt\` — the event-kind timeline.

Verify offline yourself:

\`\`\`bash
AGP_HOME=<dir-with-this-journal-and-pubkey> agp verify
\`\`\`
AAR

# A dogfood that gated nothing proves nothing — fail closed (no fake-green).
if [ "${gated:-0}" -eq 0 ]; then
  echo "evidence-bundle: FAIL — 0 tool calls gated; the governed run did not exercise the gate" >&2
  exit 1
fi
echo "evidence-bundle: wrote $OUT ($event_count events, $gated gated, verify rc=$verify_rc)"
[ "$verify_rc" -eq 0 ] || exit 1
