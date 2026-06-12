# AGP dogfood sandbox image — Topology B (000-docs/037-AT-ADR).
#
# Runs the real `claude` harness under AGP governance INSIDE a container, with the
# repo at /work, the gate socket dir bind-mounted at /agp-sock, and the AGP repo
# (read-only) at /agp so the PreToolUse hook can run `bun /agp/src/cli/index.ts
# bridge`. Network is ENABLED at runtime (claude → model API) — the honest v0
# full-egress limitation; the model-only egress allowlist is Topology C (agp-3s4).
#
# Build (pin a real tag, never :latest — AGP rejects unpinned images):
#   docker build -t agp-claude-sandbox:v0 -f docker/claude-sandbox.Dockerfile .
#
# Auth is via ANTHROPIC_API_KEY at runtime (passed by name, never baked in).

FROM oven/bun:1.2.23-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

# Claude Code native standalone installer (self-contained; uses ANTHROPIC_API_KEY,
# no interactive login). `bun` (for the bridge) is already on PATH in the base image.
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /work
