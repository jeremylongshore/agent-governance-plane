# 037 — ADR: Live Harness Topology + Measured PreToolUse Hook Contract

**Status:** Accepted (CTO decision, 2026-06-12). Implements the live path of Epic 06 (`agp-92v` / `agp-3g0`).

## Context

The live dogfood (`agp-3g0`) runs real `claude` under AGP governance on a real CCSC
bug. `027-AT-SPEC` sketched the harness running **"inside the sandbox itself."** But
the Docker sandbox is `--network none` — and `4na.4` (shipped v0.1.46) hardened that
to an actively-verified, fail-closed default. **Real `claude` needs network egress to
the model API**, so "claude inside the `--network none` sandbox" is self-contradictory,
and AGP has no model-only egress-allowlist capability. The spec left this unresolved.

This ADR resolves the topology and records the **measured** Claude Code PreToolUse hook
contract (the integration seam, which is drift-prone and must be pinned).

## Decisions

### D1 — Proof is cryptographic, never service-dependent

AGP's proof of what a governed run did is the Ed25519-signed, hash-chained journal,
verifiable offline via the published public key (`agp verify`). No third party
(Hugging Face, a hosted log, an LLM provider) is ever in the trust path. Independence
is the moat; making provability depend on an external service would weaken it.

### D2 — Topology B now, Topology C as the north star

| Option | Tool-exec isolation | Harness model access | Verdict |
|--------|---------------------|----------------------|---------|
| A: harness on host, calls gated | none | yes | **Rejected** — a governance plane that demonstrates no isolation is not credible |
| **B: harness in a network-enabled container, repo mounted, calls gated** | real container FS/process isolation | yes (full egress) | **Accepted for v0** |
| C: harness in a model-only egress-allowlist sandbox | full | yes (restricted) | **North star** — filed as a follow-on bead |

B ships real container isolation of tool execution and lets `claude` reach the model,
with **one honest, documented limitation**: the container has full network egress, not
a model-only allowlist (same class of honest limitation as "Docker, not Firecracker").
C (egress allowlist) is a real networking subsystem — its own bead, not a v0 blocker.

### D3 — Staged delivery (each increment is independently shippable + validated)

1. **Increment 1 — gate-wiring validation (control plane).** Implement the
   PreToolUse-hook bridge + `BunClaudeProcess` and prove end-to-end that real
   `claude` → hook → session socket → `daemon.gate` → signed journal works, validated
   with the real binary. This proves the *governance* property (Epic 06's heart).
2. **Increment 2 — Topology B.** Run the harness in a network-enabled Docker container
   with the repo + socket mounted (real isolation of tool execution).
3. **Increment 3 — reproducible witnessed run.** A `workflow_dispatch` CI job using an
   **API-key** harness (not a personal login session) that publishes the signed journal,
   the `agp verify` output, and an AAR as the evidence bundle (`036-OD-SPEC`). "Trust me"
   becomes "re-run it yourself."

### D4 — Measured PreToolUse hook contract (PIN THIS)

Empirically captured from `claude` 2.1.172 (not from docs). The hook receives this JSON
on **stdin**:

```json
{
  "session_id": "<uuid>",
  "transcript_path": "<path>.jsonl",
  "cwd": "<dir>",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Read",
  "tool_input": { "file_path": "..." },
  "tool_use_id": "toolu_..."
}
```

Mapping to AGP's `ToolCallRequest`: `id = tool_use_id`, `sessionId = session_id`,
`tool = tool_name`, `args = tool_input`, `actor = "claude_process"`.

Decision protocol back to the hook: **allow → exit 0**; **deny → exit 2 with the reason
on stderr** (Claude surfaces the reason and respects the denial).

**Validated property:** real Claude Code **obeys** a hook denial and explicitly refuses
to route around it — the interception is honored by the production harness, not merely
advisory. This is the governance guarantee Epic 06 exists to establish.

## Consequences

- The bridge maps the measured contract above; if Anthropic changes the hook schema, the
  bridge's parser and this ADR are the single point of update.
- v0 live runs use a network-enabled container (Topology B); the full-egress limitation
  is stated in `020-AT-THRT` and the run output.
- No public security claim changes; only the v0-allowed claim is used.

## Follow-on beads

- Topology C: model-only egress-allowlist sandbox (enables the spec's fully-isolated harness).
- Increment 3: reproducible `workflow_dispatch` dogfood CI job with an API-key harness.

## References

`027-AT-SPEC` (sprite + live-path sketch), `029-AT-ADR` (Unix-socket gateway),
`020-AT-THRT` (isolation limits), `036-OD-SPEC` (evidence bundle), `001-AT-DECR` Q4
(honest claims). Bead: `agp-3g0` under epic `agp-92v`.
