// Allowlist-egress preflight — actively PROVE a Topology-C sandbox restricts
// egress to the model API only, rather than trust the proxy/network config. The
// footgun this closes: an egress-allowlist that LOOKS enforced (proxy
// configured, internal network declared) but silently lets a non-model host
// through is FALSE isolation — strictly worse than Topology B's honest full
// egress (000-docs/020-AT-THRT-docker-isolation-limits.md). The preflight runs
// two real probes inside the just-spawned container and FAILS CLOSED:
// enforcement is confirmed only when a non-model endpoint is demonstrably
// BLOCKED *and* the model endpoint is reachable.
//
// Mirrors network-preflight.ts: the verdict (`classifyAllowlistProbe`) is a pure
// function unit-tested without Docker; the single live seam (exec the probes via
// the injected runner) lands with the enforcement wiring (agp-3s4.3) and the
// spawn-gate (agp-3s4.4), behind real-infra validation. This module ships the
// deterministic core only — no enforcement, no public claim.
//
// Design: 000-docs/049-AT-ADR-topology-c-egress-allowlist-design section 2.

import type { RunResult } from "./runner.ts";

/** Verdict of an allowlist-egress check: is model-only egress actually enforced? */
export interface AllowlistVerdict {
  /** True only when a non-model host is demonstrably blocked AND the model host is reachable. */
  enforced: boolean;
  /** Human-readable why. */
  detail: string;
}

const PROBE_TIMEOUT_SECS = "3";

/**
 * A default non-model probe target: a stable, normally-reachable public host an
 * egress allowlist MUST block. Reachability of THIS host is the breach signal.
 * The live wiring (agp-3s4.4) may override it; the model host always comes from
 * the resolved allowlist, never hard-coded here.
 */
export const DEFAULT_NON_MODEL_PROBE = { host: "example.com", port: "443" } as const;

/**
 * The in-container egress probe argv for a single host:port. Uses only
 * busybox-guaranteed primitives: `nc` (netcat) with a connect timeout. A clean
 * connect (exit 0) means the host was REACHED. Asserted verbatim in tests.
 */
export function allowlistProbeArgv(host: string, port: string): string[] {
  return ["nc", "-w", PROBE_TIMEOUT_SECS, "-z", host, port];
}

// Recognized network/allowlist-block failure modes — mirrors network-preflight's
// REACHABILITY_STDERR, plus proxy-deny phrasing (a CONNECT proxy refusing a
// non-allowlisted host, 049 section 1 Option A).
const BLOCKED_STDERR =
  /(connection refused|no route|network is unreachable|bad address|name does not resolve|timed out|timeout|forbidden|denied|403)/i;

/**
 * PURE verdict over the two probe results. Fail-closed by construction:
 *   - model probe FAILED (non-zero) ⇒ not enforced — the harness cannot reach
 *     the model; surfaced as a clear error (allowlist mis-set / wrong host).
 *   - non-model probe SUCCEEDED (exit 0) ⇒ not enforced — egress is NOT
 *     restricted (the silent-degrade breach).
 *   - non-model probe could not run (exit 127) ⇒ not enforced (cannot prove).
 *   - non-model probe failed with an UNRECOGNIZED error ⇒ not enforced (cannot
 *     prove it was an allowlist block).
 *   - only non-model demonstrably blocked AND model reachable ⇒ enforced.
 */
export function classifyAllowlistProbe(nonModel: RunResult, model: RunResult): AllowlistVerdict {
  // The model MUST be reachable, else the harness is broken regardless of isolation.
  if (model.exitCode !== 0) {
    const why = model.stderr.trim() || `exit ${model.exitCode}`;
    return {
      enforced: false,
      detail: `model endpoint probe failed (${why}) — harness cannot reach the model; allowlist mis-set or model host wrong`,
    };
  }
  // A reachable non-model host is the silent-degrade breach: egress not restricted.
  if (nonModel.exitCode === 0) {
    return {
      enforced: false,
      detail: "non-model endpoint reachable (exit 0) — egress allowlist NOT enforced",
    };
  }
  if (nonModel.exitCode === 127) {
    return {
      enforced: false,
      detail: "non-model probe could not run (nc absent, exit 127); cannot prove allowlist enforcement — fail closed",
    };
  }
  // A non-zero exit with a non-empty, UNRECOGNIZED stderr is ambiguous: it may not
  // be an allowlist block (e.g. a broken probe), so we cannot prove enforcement.
  // (Empty stderr is treated as a block — `nc -z` is silent on a refused connect.)
  const stderr = nonModel.stderr.trim();
  if (stderr.length > 0 && !BLOCKED_STDERR.test(stderr)) {
    return {
      enforced: false,
      detail: `non-model probe failed with an unrecognized error (exit ${nonModel.exitCode}): ${stderr}; cannot prove enforcement — fail closed`,
    };
  }
  return {
    enforced: true,
    detail: `non-model endpoint blocked (exit ${nonModel.exitCode}) and model endpoint reachable — egress allowlist enforced`,
  };
}
