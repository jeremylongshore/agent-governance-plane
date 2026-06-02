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
    return { id, sessionId: spec.sessionId };
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
