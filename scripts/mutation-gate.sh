#!/usr/bin/env bash
# scripts/mutation-gate.sh — Stryker mutation gate (policy module scope).
#
# Scope: src/policy/engine.ts + src/policy/dangerous.ts only.
# These are the behavior-critical, deterministic pure-function modules;
# scoping avoids the slow gated paths (Docker sandbox, Slack, live bun spawn)
# that would inflate run time and timeout in CI.
#
# Posture: INFORMATIONAL until a baseline kill rate is measured from the first
# CI execution. thresholds.break is null in stryker.config.json — no hard
# failure. After the first CI run establishes the baseline (expected 65–80%
# for the policy module given strong assertions), a follow-on PR sets
# thresholds.break and raises mutation.kill_rate in tests/TESTING.md.
#
# Fail-closed: if Stryker cannot be invoked (missing deps after install
# failure) this script exits 1 — it does NOT silently pass.
#
# Exit codes:
#   0 — Stryker ran (any kill rate; informational posture)
#   1 — Stryker could not be invoked (missing binary / crash before run)
set -euo pipefail

# Resolve repo root regardless of caller cwd
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Verify @stryker-mutator/core is available (installed via devDependencies)
if ! bun run --elide-lines=0 - <<'EOF' 2>/dev/null
import { createRequire } from "node:module";
createRequire(import.meta.url).resolve("@stryker-mutator/core");
EOF
then
  echo "[mutation-gate] ERROR: @stryker-mutator/core not found in node_modules." >&2
  echo "[mutation-gate] Run 'bun install' to install devDependencies." >&2
  exit 1
fi

echo "[mutation-gate] Starting Stryker mutation tests (policy module scope)..."
echo "[mutation-gate] Mutating: src/policy/engine.ts + src/policy/dangerous.ts"
echo "[mutation-gate] Posture: informational (thresholds.break=null; baseline TBD from first CI run)"

# Run Stryker; capture output; exit 0 regardless of kill rate (informational)
if ! stryker_out=$(bunx --bun stryker run --logLevel error 2>&1); then
  stryker_rc=$?
  # Distinguish: non-zero due to score < break threshold (null → shouldn't happen)
  # vs genuine crash. If Stryker printed a score we can still emit the metric.
  if echo "$stryker_out" | grep -qE '[0-9]+/[0-9]+ mutants killed'; then
    echo "$stryker_out"
    # Extract kill rate from the output
    kill_rate=$(echo "$stryker_out" | grep -oE '[0-9]+\.[0-9]+%' | head -1 || echo "unknown")
    echo "[mutation-gate] kill_rate=${kill_rate} (informational; floor TBD from first CI run)"
    exit 0
  fi
  echo "[mutation-gate] Stryker failed to complete (exit $stryker_rc)." >&2
  echo "$stryker_out" >&2
  exit 1
fi

echo "$stryker_out"

# Extract kill rate from the clear-text reporter output
# Stryker prints a line like: "Killed: 42/55 (76.36%)" or the score table
kill_rate=$(echo "$stryker_out" | grep -oE '[0-9]+\.[0-9]+%' | head -1 || echo "unknown")
echo "[mutation-gate] kill_rate=${kill_rate} (informational; floor TBD from first CI run)"
