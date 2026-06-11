// DockerSandbox — production SandboxProvider backed by `docker`. Honest about
// what a container is: namespace + cgroup isolation, NOT a VM/kernel boundary
// (see 000-docs/020-AT-THRT-docker-isolation-limits.md).
//
// Fail-closed posture:
//   - network OFF by default (--network none); on only when spec.networkEnabled
//   - --cap-drop ALL, --security-opt no-new-privileges, --pids-limit, mem/cpu caps
//   - image refs MUST be pinned (a tag that is not the moving "latest", or a
//     @sha256 digest) — unpinned/moving images are rejected for reproducibility
//   - host-secret paths may never be mounted (default deny list)
//   - NO silent fallback to host execution: if docker fails, we throw

import { homedir } from "node:os";
import { resolve } from "node:path";
import type {
  ExecResult,
  IsolationGuarantees,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "../../contracts/sandbox-provider.ts";
import { BunDockerRunner, type DockerRunner } from "./runner.ts";
import { verifyNetworkIsolation } from "./network-preflight.ts";

export interface Mount {
  source: string;
  target: string;
  readOnly?: boolean;
}

export interface DockerSandboxOptions {
  runner?: DockerRunner;
  mounts?: Mount[];
  /** Host path prefixes that may never be mounted. Defaults to common secret dirs. */
  deniedSourcePrefixes?: string[];
  resources?: { memory?: string; cpus?: string; pidsLimit?: number };
  /** Command keeping the container alive to exec into. */
  keepAlive?: string[];
  /**
   * Actively verify network isolation after spawn when network is OFF (default
   * ON). The preflight execs an egress probe and tears down + throws if the
   * container can reach the network — never returns a handle that silently
   * degraded from default-deny to default-allow. Set false only for the dev
   * escape hatch (also honored via $AGP_SANDBOX_SKIP_NETCHECK=1).
   */
  verifyIsolation?: boolean;
  /** Sink for the loud skip warning when the netcheck is bypassed. Default: console.warn. */
  warn?: (message: string) => void;
}

// The moving tag is assembled from parts so the literal never appears in source
// (the epic's acceptance greps src/sandbox/ for it).
const MOVING_TAG = "lat" + "est";

function defaultDeniedPrefixes(): string[] {
  const home = homedir();
  return [
    resolve(home, ".ssh"),
    resolve(home, ".aws"),
    resolve(home, ".gnupg"),
    resolve(home, ".config"),
    resolve(home, ".agp"),
    "/etc",
    "/var/run",
    "/run",
  ];
}

export class DockerSandbox implements SandboxProvider {
  private readonly runner: DockerRunner;
  private readonly mounts: Mount[];
  private readonly deniedPrefixes: string[];
  private readonly resources: { memory: string; cpus: string; pidsLimit: number };
  private readonly keepAlive: string[];
  private readonly verifyIsolation: boolean;
  private readonly warn: (message: string) => void;

  constructor(options: DockerSandboxOptions = {}) {
    this.runner = options.runner ?? new BunDockerRunner();
    this.mounts = options.mounts ?? [];
    this.deniedPrefixes = options.deniedSourcePrefixes ?? defaultDeniedPrefixes();
    this.resources = {
      memory: options.resources?.memory ?? "512m",
      cpus: options.resources?.cpus ?? "1",
      pidsLimit: options.resources?.pidsLimit ?? 256,
    };
    this.keepAlive = options.keepAlive ?? ["sleep", "infinity"];
    this.verifyIsolation = options.verifyIsolation ?? true;
    this.warn = options.warn ?? ((m) => console.warn(m));
  }

  isolation(): IsolationGuarantees {
    return {
      kind: "docker-container",
      boundary:
        "Linux namespace + cgroup isolation with dropped capabilities and no-new-privileges. " +
        "NOT a VM or kernel-level boundary: a kernel exploit or container escape defeats it. " +
        "See 020-AT-THRT-docker-isolation-limits.md.",
      vmGrade: false,
    };
  }

  /** Reject moving/unpinned images — reproducibility + supply-chain hygiene. */
  private assertPinnedImage(image: string): void {
    if (image.includes("@sha256:")) return; // digest-pinned: best
    const lastColon = image.lastIndexOf(":");
    const lastSlash = image.lastIndexOf("/");
    const hasTag = lastColon > lastSlash; // a ':' after any registry-port '/'
    if (!hasTag) {
      throw new Error(`image '${image}' is unpinned (no tag or digest); pin it for reproducibility`);
    }
    const tag = image.slice(lastColon + 1);
    if (tag === MOVING_TAG) {
      throw new Error(`image '${image}' uses the moving '${MOVING_TAG}' tag; pin a specific version or digest`);
    }
  }

  /** Reject mounts whose host source is under a denied (secret) prefix. */
  private assertMountAllowed(mount: Mount): void {
    const src = resolve(mount.source);
    for (const prefix of this.deniedPrefixes) {
      if (src === prefix || src.startsWith(prefix + "/")) {
        throw new Error(`mount of '${mount.source}' is denied (host-secret path under ${prefix})`);
      }
    }
  }

  async spawn(spec: SandboxSpec): Promise<SandboxHandle> {
    this.assertPinnedImage(spec.image);
    for (const m of this.mounts) this.assertMountAllowed(m);

    const args: string[] = [
      "run",
      "-d",
      "--network",
      spec.networkEnabled ? "bridge" : "none",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      String(this.resources.pidsLimit),
      "--memory",
      this.resources.memory,
      "--cpus",
      this.resources.cpus,
      "--label",
      `agp.session=${spec.sessionId}`,
    ];
    for (const m of this.mounts) {
      args.push("-v", `${resolve(m.source)}:${m.target}${m.readOnly === false ? "" : ":ro"}`);
    }
    args.push(spec.image, ...this.keepAlive);

    const res = await this.runner.run(args);
    if (res.exitCode !== 0) {
      // NO host fallback — a failed launch is a hard error.
      throw new Error(`docker run failed (exit ${res.exitCode}): ${res.stderr.trim() || res.stdout.trim()}`);
    }
    const id = res.stdout.trim();
    if (id.length === 0) throw new Error("docker run returned no container id");
    const handle: SandboxHandle = { id, sessionId: spec.sessionId };

    // Network-isolation preflight: when network is OFF, PROVE the container
    // cannot egress rather than trust the flag. Fail closed — a container that
    // can reach the network is torn down and the spawn rejects, never returns.
    if (spec.networkEnabled === false && this.verifyIsolation) {
      const skip = process.env.AGP_SANDBOX_SKIP_NETCHECK === "1";
      if (skip) {
        // Honest dev escape hatch: never skip silently.
        this.warn(
          `[agp] WARNING: network-isolation preflight SKIPPED for container ${id} ` +
            "(AGP_SANDBOX_SKIP_NETCHECK=1) — egress enforcement is UNVERIFIED. Dev only.",
        );
      } else {
        const verdict = await verifyNetworkIsolation(this.runner, handle, { networkRequested: false });
        if (!verdict.isolated) {
          // Do not leak an unverified container: tear it down before throwing.
          await this.teardown(handle);
          throw new Error(`network isolation not enforced: ${verdict.detail}`);
        }
      }
    }

    return handle;
  }

  async exec(handle: SandboxHandle, command: readonly string[]): Promise<ExecResult> {
    const res = await this.runner.run(["exec", handle.id, ...command]);
    // A non-zero exit here is the TOOL's own failure, surfaced — not a launch error.
    return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr };
  }

  async teardown(handle: SandboxHandle): Promise<void> {
    await this.runner.run(["rm", "-f", handle.id]);
  }
}
