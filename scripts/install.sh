#!/usr/bin/env bash
# One-command install for the agent-governance-plane CLI (`agp`) — the extraction
# gate's DevRel condition (#4, intent-os 030-AT-DECR): "one-command install works
# on a clean machine". Idempotent + fail-closed: it never clobbers an existing
# signing key or config, and it refuses rather than half-installs on a missing
# prerequisite.
#
#   curl -fsSL https://raw.githubusercontent.com/jeremylongshore/agent-governance-plane/main/scripts/install.sh | bash
#
# or, from a clone:   bash scripts/install.sh
#
# What it does: check prereqs (bun required; docker + gh recommended) → fetch the
# repo if not already in one → bun install → `agp init` + `agp keygen` (both
# skip-if-present) → offline journal verify → print next steps. Installs NOTHING
# that runs on its own. This installs the governance PLANE (the kernel); the
# governed background agents (the GitHub watcher etc.) ship in the composing
# product repo, jeremylongshore/bob-the-intendant.

set -euo pipefail

REPO_URL="https://github.com/jeremylongshore/agent-governance-plane.git"
CLONE_DIR="${AGP_INSTALL_DIR:-$HOME/000-projects/agent-governance-plane}"
BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YEL=$'\033[33m'; RED=$'\033[31m'; RST=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RST" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL" "$RST" "$*"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

say "${BOLD}Intendants / agent-governance-plane — installer${RST}"

# 1. Prerequisites. Bun is required (this is a Bun toolchain, not Node). Docker +
#    gh are needed for a LIVE watcher run but not for install/verify, so warn only.
command -v bun >/dev/null 2>&1 || die "bun is required — install it first: https://bun.sh  (curl -fsSL https://bun.sh/install | bash)"
ok "bun $(bun --version)"
if command -v docker >/dev/null 2>&1; then ok "docker $(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"; else warn "docker not found — needed for a LIVE sandboxed run (not for install/verify)"; fi
if command -v gh    >/dev/null 2>&1; then ok "gh $(gh --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"; else warn "gh (GitHub CLI) not found — needed for the GitHub watcher's reads"; fi

# 2. Land in the repo. Identify THIS repo by a unique file (src/cli/index.ts), not
#    a "agp" string in package.json — a consumer project that DEPENDS on agp would
#    otherwise be mistaken for the repo and get modified in place.
if [ -f "package.json" ] && [ -f "src/cli/index.ts" ]; then
  REPO_DIR="$(pwd)"; ok "using the current checkout ($REPO_DIR)"
elif [ -d "$CLONE_DIR/.git" ]; then
  REPO_DIR="$CLONE_DIR"; ok "found an existing clone ($REPO_DIR)"
else
  command -v git >/dev/null 2>&1 || die "git is required to clone the repo"
  say "${DIM}cloning $REPO_URL → $CLONE_DIR${RST}"
  git clone --depth 1 "$REPO_URL" "$CLONE_DIR" >/dev/null || die "clone failed (see the git error above)"
  REPO_DIR="$CLONE_DIR"; ok "cloned to $REPO_DIR"
fi
cd "$REPO_DIR"

# 3. Dependencies. Keep stderr visible so a resolution/network failure is legible.
say "${DIM}bun install…${RST}"; bun install >/dev/null || die "bun install failed (see the error above)"; ok "dependencies installed"

# 4. Operator config + signing key — run ONLY when absent (never clobber an existing
#    key), and DIE on a genuine failure of the run (fail-closed — no `|| true` mask).
if [ ! -f "$HOME/.agp/policy.json" ]; then
  bun run agp -- init >/dev/null || die "agp init failed (see the error above)"
fi
[ -f "$HOME/.agp/policy.json" ] && ok "config home ~/.agp ready" || warn "~/.agp/policy.json not created — run: bun run agp -- init"
if [ ! -f "$HOME/.agp/signing/journal-ed25519.key" ]; then
  bun run agp -- keygen >/dev/null || die "agp keygen failed (see the error above)"
fi
[ -f "$HOME/.agp/signing/journal-ed25519.key" ] && ok "journal signing key present" || warn "signing key missing — run: bun run agp -- keygen"

# 5. Prove it works with zero side effects: offline journal verify.
say "${DIM}verifying the signed journal (offline)…${RST}"
bun run agp -- verify >/dev/null 2>&1 && ok "agp verify: journal intact" || warn "agp verify: no journal yet (expected on a fresh install)"

cat <<EOF

${BOLD}Installed the governance plane.${RST} Next:
  ${DIM}# 1. sanity-check prerequisites${RST}
  cd $REPO_DIR && bun run agp -- doctor
  ${DIM}# 2. drive a reference session through the governance loop (executes nothing):${RST}
  bun run agp -- run
  ${DIM}# 3. verify the signed audit journal, offline:${RST}
  bun run agp -- verify

To run a GOVERNED BACKGROUND AGENT (the GitHub watcher etc.) on top of this
plane, install the product repo that composes it:
  ${DIM}https://github.com/jeremylongshore/bob-the-intendant${RST}
EOF
