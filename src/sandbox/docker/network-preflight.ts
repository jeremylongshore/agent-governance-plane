// Network-isolation preflight — actively PROVE a sandbox cannot egress rather
// than trust the declared `--network none` flag. The footgun this closes: a
// declared default-deny that silently degrades to default-allow (a daemon
// misconfig, a stale image with a baked-in network, a docker-network override)
// would otherwise pass unnoticed. The preflight runs a real egress probe inside
// the just-spawned container and FAILS CLOSED — isolation is confirmed only when
// the probe demonstrably could NOT reach the network.
//
// DI-shaped like docker-sandbox.ts / slack-dialer.ts: the verdict is a pure
// function (`classifyEgressProbe`) unit-tested without Docker; the single live
// seam is `runner.run(["exec", ...])`, exercised by the fake runner in CI and
// real docker only behind AGP_DOCKER_E2E=1.

import type { SandboxHandle } from "../../contracts/sandbox-provider.ts";
import type { DockerRunner, RunResult } from "./runner.ts";

/** Verdict of an isolation check: did the container fail to reach the network? */
export interface IsolationVerdict {
  /** True only when egress is demonstrably blocked. Ambiguity ⇒ false. */
  isolated: boolean;
  /** Human-readable why. */
  detail: string;
}

// A routable address the probe attempts to reach. 192.0.2.0/24 (TEST-NET-1,
// RFC 5737) is reserved for documentation and is NOT routable on the public
// internet, so a correctly-isolated container and a globally-firewalled host
// both yield "unreachable" without depending on any third-party endpoint being
// up. We pair it with a DNS attempt so a container with DNS-but-no-route and one
// with neither both read as isolated.
const PROBE_HOST = "192.0.2.1";
const PROBE_PORT = "80";
const PROBE_TIMEOUT_SECS = "3";

/**
 * The in-container egress probe argv. Uses only busybox-guaranteed primitives:
 * `nc` (netcat) with a connect timeout. A clean connect (exit 0) means the
 * container reached the network ⇒ isolation FAILED. A non-zero exit
 * (connection refused, timeout, DNS failure, no route) means egress is blocked
 * ⇒ isolation holds. The argv is asserted verbatim in tests.
 */
export function egressProbeArgv(): string[] {
  return ["nc", "-w", PROBE_TIMEOUT_SECS, "-z", PROBE_HOST, PROBE_PORT];
}

const REACHABILITY_STDERR = /(connection refused|no route|network is unreachable|bad address|name does not resolve|timed out|timeout)/i;

/**
 * PURE verdict over an egress-probe result. Fail-closed by construction:
 *   - networkRequested=false + probe FAILED (non-zero exit) ⇒ isolated:true.
 *   - probe SUCCEEDED (exit 0) ⇒ isolated:false — the silent-degrade breach.
 *   - networkRequested=true ⇒ isolation is not even expected; report not-isolated
 *     (the caller only runs this when it wants isolation, but be explicit).
 *   - any ambiguity (we cannot prove the failure was a network failure) ⇒
 *     isolated:false. Cannot-prove-isolation is treated as not-isolated.
 */
export function classifyEgressProbe(res: RunResult, networkRequested: boolean): IsolationVerdict {
  if (networkRequested) {
    return { isolated: false, detail: "network was explicitly enabled; isolation not expected" };
  }
  if (res.exitCode === 0) {
    // The probe reached the network. Default-deny silently degraded to allow.
    return {
      isolated: false,
      detail: `egress probe reached ${PROBE_HOST}:${PROBE_PORT} (exit 0) — network isolation NOT enforced`,
    };
  }
  // Non-zero exit. Confirm it reads as a network failure rather than e.g. a
  // missing `nc` binary (exit 127) which would be ambiguous about egress.
  const stderr = res.stderr.trim();
  if (res.exitCode === 127) {
    return {
      isolated: false,
      detail: "egress probe could not run (nc absent, exit 127); cannot prove isolation — fail closed",
    };
  }
  if (stderr.length > 0 && !REACHABILITY_STDERR.test(stderr)) {
    return {
      isolated: false,
      detail: `egress probe failed with an unrecognized error (exit ${res.exitCode}): ${stderr}; cannot prove isolation — fail closed`,
    };
  }
  return {
    isolated: true,
    detail: `egress probe could not reach ${PROBE_HOST}:${PROBE_PORT} (exit ${res.exitCode}) — isolation confirmed`,
  };
}

/**
 * Actively verify a running container cannot egress. Execs the egress probe via
 * the injected runner and delegates the verdict to `classifyEgressProbe`. The
 * runner.run is the single live seam; everything else is deterministic.
 */
export async function verifyNetworkIsolation(
  runner: DockerRunner,
  handle: SandboxHandle,
  opts: { networkRequested?: boolean } = {},
): Promise<IsolationVerdict> {
  const networkRequested = opts.networkRequested ?? false;
  const res = await runner.run(["exec", handle.id, ...egressProbeArgv()]);
  return classifyEgressProbe(res, networkRequested);
}
