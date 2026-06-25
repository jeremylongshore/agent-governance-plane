// Topology C orchestration — the egress-allowlist sandbox (model-only egress).
//
// Design: 000-docs/049-AT-ADR-topology-c-egress-allowlist-design (Option A).
// Three Docker primitives, composed:
//   1. an INTERNAL Docker network (`--internal`, no default route) the harness
//      attaches to — so the harness has NO direct path off the box;
//   2. a forward-proxy SIDECAR on that internal network AND on a bridge for model
//      egress, configured with a HOST allowlist (the resolved EgressPolicy.allowlist)
//      + a CONNECT-tunnel allowlist (TLS to the model passes through);
//   3. the HARNESS container on the internal network with HTTPS_PROXY/HTTP_PROXY
//      pointed at the sidecar — its only egress path is through the allowlisting
//      proxy. Hardening (--cap-drop ALL / no-new-privileges / pinned image) is
//      preserved exactly as in the single-container path.
//
// This module ships NO live enforcement: the builders are PURE (return argv as
// `string[]`, asserted verbatim in tests) and the only live seam is the injected
// DockerRunner that `spawnTopologyC` drives. The fail-closed spawn-gate that runs
// the live allowlist preflight against this topology lives in docker-sandbox.ts
// (agp-3s4.4) and is gated behind AGP_TOPOLOGY_C_E2E + a validated proxy.
//
// LAYERING (invariant): a leaf sandbox module — imports ONLY runner.ts,
// egress-policy.ts, image-pin.ts, and the sandbox-provider contract. It must NOT
// import docker-sandbox.ts (docker-sandbox imports THIS — a cycle) nor the daemon.

import type { SandboxHandle } from "../../contracts/sandbox-provider.ts";
import type { DockerRunner } from "./runner.ts";
import { type EgressPolicy, parseModelAllowlist } from "./egress-policy.ts";
import { assertPinnedImage } from "./image-pin.ts";

/**
 * The forward-proxy image for the egress-allowlist sidecar.
 *
 * PROVISIONAL pending agp-3s4.3.2 real-infra validation: this is a pinned,
 * widely-used squid-cache build (a CONNECT-capable forward proxy that supports a
 * host/domain allowlist via `acl ... dstdomain` + `http_access`). The .3.2 build
 * step validates the exact image + the generated squid.conf against real egress;
 * the tag here MAY change to a @sha256 digest then. It is pinned (NOT a moving
 * tag) so it passes `assertPinnedImage` and the spawn cannot pull a swapped proxy.
 */
export const DEFAULT_EGRESS_PROXY_IMAGE = "ubuntu/squid:6.6-24.04_edge";

/** Per-session names for the internal network + proxy sidecar, derived from the harness id. */
export interface TopologyCNames {
  network: string;
  proxy: string;
}

/** Deterministic resource names for a Topology C session. Pure. */
export function topologyCNames(sessionId: string): TopologyCNames {
  return { network: `agp-egress-${sessionId}`, proxy: `agp-proxy-${sessionId}` };
}

/**
 * `docker network create --internal <name>` — an internal network has NO default
 * route to the host/world, so a container attached ONLY to it cannot egress
 * except through another container that bridges out (the proxy). Asserted verbatim.
 */
export function internalNetworkCreateArgv(name: string): string[] {
  return ["network", "create", "--internal", name];
}

/**
 * The proxy-sidecar `docker run` argv. The sidecar straddles two networks:
 *   - the INTERNAL network (so the harness can reach it), attached at run time;
 *   - a BRIDGE network (its default, for model egress) — `docker run --network
 *     bridge` is the first attachment; the internal net is joined via a second
 *     `network connect` (see proxyNetworkConnectArgv) because `docker run` takes
 *     only one `--network`.
 * The allowlist (model hosts) + CONNECT-tunnel allowlist are passed by ENV so the
 * proxy entrypoint renders its config from them (no host bind-mount needed). The
 * sidecar is hardened like every AGP container: pinned image, no-new-privileges.
 * NOTE: the proxy is NOT `--cap-drop ALL` — a forward proxy binds a listener and
 * some images drop privileges internally; capabilities for the proxy are an .3.2
 * real-infra decision. The HARNESS (the untrusted code) keeps full hardening.
 */
export function proxyRunArgv(opts: {
  name: string;
  image: string;
  allowlist: readonly string[];
  proxyPort: number;
}): string[] {
  assertPinnedImage(opts.image);
  const hosts = opts.allowlist.join(",");
  return [
    "run",
    "-d",
    "--name",
    opts.name,
    "--network",
    "bridge",
    "--security-opt",
    "no-new-privileges",
    "--label",
    "agp.role=egress-proxy",
    // The proxy entrypoint renders an allowlist from these. CONNECT-tunnel
    // allowlist == the same model-host set (HTTPS to the model passes via CONNECT).
    "--env",
    `AGP_EGRESS_ALLOWLIST=${hosts}`,
    "--env",
    `AGP_EGRESS_CONNECT_ALLOWLIST=${hosts}`,
    "--env",
    `AGP_EGRESS_PROXY_PORT=${String(opts.proxyPort)}`,
    opts.image,
  ];
}

/**
 * `docker network connect <network> <container>` — attaches the already-running
 * proxy to the internal network as its SECOND interface (the harness side). Pure.
 */
export function proxyNetworkConnectArgv(network: string, proxyName: string): string[] {
  return ["network", "connect", network, proxyName];
}

/**
 * The harness `docker run` argv: attached ONLY to the internal network (no
 * default route), with HTTPS_PROXY/HTTP_PROXY pointed at the proxy sidecar by
 * its container name (Docker DNS resolves it on the shared internal net). Full
 * hardening preserved: pinned image, --cap-drop ALL, no-new-privileges.
 */
export function harnessRunArgv(opts: {
  image: string;
  sessionId: string;
  network: string;
  proxyName: string;
  proxyPort: number;
  keepAlive: readonly string[];
}): string[] {
  assertPinnedImage(opts.image);
  const proxyUrl = `http://${opts.proxyName}:${String(opts.proxyPort)}`;
  return [
    "run",
    "-d",
    "--network",
    opts.network,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--label",
    `agp.session=${opts.sessionId}`,
    "--env",
    `HTTPS_PROXY=${proxyUrl}`,
    "--env",
    `HTTP_PROXY=${proxyUrl}`,
    // Lowercase forms too — many clients honor only one casing.
    "--env",
    `https_proxy=${proxyUrl}`,
    "--env",
    `http_proxy=${proxyUrl}`,
    opts.image,
    ...opts.keepAlive,
  ];
}

/** Options for spawning a Topology C session. */
export interface SpawnTopologyCOptions {
  image: string;
  sessionId: string;
  egress: EgressPolicy;
  keepAlive: readonly string[];
  proxyImage?: string;
  proxyPort?: number;
}

/** The handle plus the auxiliary resources Topology C created (for teardown). */
export interface TopologyCHandle {
  handle: SandboxHandle;
  names: TopologyCNames;
  proxyId: string;
}

const DEFAULT_PROXY_PORT = 3128;

/**
 * Orchestrate a Topology C spawn over the injected runner — the single live seam.
 * Sequence: create the internal network → run the proxy sidecar on bridge →
 * connect the proxy to the internal network → run the hardened harness on the
 * internal network with HTTPS_PROXY → the proxy. Any failed step throws (no
 * silent fallback to full egress); on a mid-sequence failure we tear down what
 * was created so we never leak a half-built, possibly-unrestricted topology.
 *
 * This ships NO verification — the caller (docker-sandbox.spawn, agp-3s4.4) runs
 * the fail-closed allowlist preflight against the returned handle and tears the
 * whole topology down if egress is not actually restricted.
 */
export async function spawnTopologyC(
  runner: DockerRunner,
  opts: SpawnTopologyCOptions,
): Promise<TopologyCHandle> {
  if (opts.egress.mode !== "allowlist") {
    throw new Error(`spawnTopologyC requires egress mode 'allowlist', got '${opts.egress.mode}'`);
  }
  if (opts.egress.allowlist.length === 0) {
    throw new Error("spawnTopologyC requires a non-empty model-host allowlist (fail closed)");
  }
  // Defense-in-depth: re-validate every allowlist host even when the EgressPolicy
  // was built programmatically (bypassing resolveEgressPolicy). A host carrying a
  // newline/quote/semicolon could otherwise corrupt the proxy's rendered config
  // via AGP_EGRESS_ALLOWLIST. Each entry must be EXACTLY one bare host: invalid
  // chars make parseModelAllowlist throw, and an embedded separator (whitespace/
  // comma) makes it split into != 1 token or not round-trip — both rejected.
  for (const host of opts.egress.allowlist) {
    const parsed = parseModelAllowlist(host);
    if (parsed.length !== 1 || parsed[0] !== host) {
      throw new Error(`invalid egress allowlist host '${host}' (must be a single bare hostname, no embedded whitespace)`);
    }
  }
  const names = topologyCNames(opts.sessionId);
  const proxyImage = opts.proxyImage ?? DEFAULT_EGRESS_PROXY_IMAGE;
  const proxyPort = opts.proxyPort ?? DEFAULT_PROXY_PORT;
  if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535) {
    throw new Error(`topology C: invalid proxy port ${String(proxyPort)} (must be an integer 1-65535)`);
  }

  const net = await runner.run(internalNetworkCreateArgv(names.network));
  if (net.exitCode !== 0) {
    throw new Error(`topology C: internal network create failed (exit ${net.exitCode}): ${errText(net)}`);
  }

  const proxy = await runner.run(
    proxyRunArgv({ name: names.proxy, image: proxyImage, allowlist: opts.egress.allowlist, proxyPort }),
  );
  if (proxy.exitCode !== 0) {
    await teardownTopologyC(runner, { names });
    throw new Error(`topology C: proxy sidecar run failed (exit ${proxy.exitCode}): ${errText(proxy)}`);
  }
  const proxyId = proxy.stdout.trim();

  const connect = await runner.run(proxyNetworkConnectArgv(names.network, names.proxy));
  if (connect.exitCode !== 0) {
    await teardownTopologyC(runner, { names, proxyId });
    throw new Error(`topology C: proxy network connect failed (exit ${connect.exitCode}): ${errText(connect)}`);
  }

  const harness = await runner.run(
    harnessRunArgv({
      image: opts.image,
      sessionId: opts.sessionId,
      network: names.network,
      proxyName: names.proxy,
      proxyPort,
      keepAlive: opts.keepAlive,
    }),
  );
  if (harness.exitCode !== 0) {
    await teardownTopologyC(runner, { names, proxyId });
    throw new Error(`topology C: harness run failed (exit ${harness.exitCode}): ${errText(harness)}`);
  }
  const id = harness.stdout.trim();
  if (id.length === 0) {
    await teardownTopologyC(runner, { names, proxyId });
    throw new Error("topology C: harness run returned no container id");
  }

  return { handle: { id, sessionId: opts.sessionId }, names, proxyId };
}

/**
 * Idempotent teardown of a Topology C session: remove the harness container
 * (if any), the proxy sidecar, and the internal network — in that order (the
 * network can only be removed once its attached containers are gone). Every step
 * is `rm -f` / best-effort: a missing resource is not an error, so this is safe
 * to call on a partially-built topology.
 */
export async function teardownTopologyC(
  runner: DockerRunner,
  res: { names: TopologyCNames; harnessId?: string; proxyId?: string },
): Promise<void> {
  if (res.harnessId !== undefined && res.harnessId.length > 0) {
    await runner.run(["rm", "-f", res.harnessId]);
  }
  // Remove the proxy by name (stable even if the id capture failed mid-build).
  await runner.run(["rm", "-f", res.names.proxy]);
  await runner.run(["network", "rm", res.names.network]);
}

function errText(r: { stderr: string; stdout: string }): string {
  return r.stderr.trim() || r.stdout.trim();
}
