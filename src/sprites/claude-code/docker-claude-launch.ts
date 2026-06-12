// docker-claude-launch — Topology B (000-docs/037-AT-ADR): run the real `claude`
// harness INSIDE a Docker container so its tool execution is isolated (FS +
// process), while the PreToolUse hook still gates every call through AGP's gate
// on the host control plane via a bind-mounted Unix socket.
//
// Honest v0 limitation (per the ADR): the container runs with network ENABLED
// (claude must reach the model API) — full egress, not a model-only allowlist.
// Topology C (egress allowlist) is the north star (bead agp-3s4).
//
// Layout inside the container:
//   /work       the repo (rw)        — claude's cwd
//   /agp-sock   the socket dir (rw)  — holds gate.sock + settings.json (host-shared)
//   /agp        the AGP repo (ro)    — so `bun /agp/src/cli/index.ts bridge` runs
// The credential is passed by NAME (-e ANTHROPIC_API_KEY) so it never appears in
// the argv / host process table; the value rides the spawn env.

import { resolve } from "node:path";

export const CONTAINER_WORK = "/work";
export const CONTAINER_SOCK_DIR = "/agp-sock";
export const CONTAINER_AGP_DIR = "/agp";
export const CONTAINER_SOCKET = `${CONTAINER_SOCK_DIR}/gate.sock`;
export const CONTAINER_SETTINGS = `${CONTAINER_SOCK_DIR}/settings.json`;

/** The PreToolUse hook command, in CONTAINER paths: `agp bridge` over the mounted
 *  socket. `bun` is on PATH in the sandbox image. */
export function buildContainerBridgeCommand(): string {
  return `bun ${CONTAINER_AGP_DIR}/src/cli/index.ts bridge --socket ${CONTAINER_SOCKET}`;
}

export interface DockerClaudeArgvOptions {
  image: string;
  /** Host repo claude works on → mounted rw at /work. */
  repoPath: string;
  /** Host dir holding the gate socket + settings → mounted rw at /agp-sock. */
  socketDir: string;
  /** Host AGP repo → mounted ro at /agp (so `agp bridge` runs in-container). */
  agpRepoPath: string;
  /** The task prompt. */
  task: string;
  /** Container has full egress (claude → model API). Topology B default true. */
  networkEnabled?: boolean;
  /** When true, add `-e ANTHROPIC_API_KEY` (name only; value rides the spawn env). */
  withApiKey?: boolean;
  /** Override the in-container claude binary (default "claude"). */
  claudeBin?: string;
}

/**
 * Build the `docker run` argv that launches claude in the sandbox. PURE +
 * unit-tested — the security flags, mounts, network, and the no-leak credential
 * passing are the drift-prone surface.
 */
export function buildDockerClaudeArgv(opts: DockerClaudeArgvOptions): string[] {
  const argv: string[] = [
    "run",
    "--rm",
    "--network",
    opts.networkEnabled === false ? "none" : "bridge",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-v",
    `${resolve(opts.repoPath)}:${CONTAINER_WORK}`,
    "-v",
    `${resolve(opts.socketDir)}:${CONTAINER_SOCK_DIR}`,
    "-v",
    `${resolve(opts.agpRepoPath)}:${CONTAINER_AGP_DIR}:ro`,
    "-w",
    CONTAINER_WORK,
  ];
  if (opts.withApiKey === true) {
    // Name only — the value is supplied via the spawn env, never the argv.
    argv.push("-e", "ANTHROPIC_API_KEY");
  }
  argv.push(
    opts.image,
    opts.claudeBin ?? "claude",
    "--settings",
    CONTAINER_SETTINGS,
    "--permission-mode",
    "default",
    "--print",
    opts.task,
  );
  return argv;
}

export interface DockerLaunchHandle {
  exited: Promise<number>;
  kill: () => void;
}

/** Run claude in the container (foreground; --rm cleans up). The API key, if any,
 *  is injected into the docker-client env so it is referenced by name in argv. */
export function dockerClaudeLaunch(opts: DockerClaudeArgvOptions & { apiKey?: string }): DockerLaunchHandle {
  const argv = buildDockerClaudeArgv({ ...opts, withApiKey: opts.apiKey !== undefined });
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  if (opts.apiKey !== undefined) env.ANTHROPIC_API_KEY = opts.apiKey;
  const proc = Bun.spawn(["docker", ...argv], { env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  return { exited: proc.exited, kill: () => proc.kill() };
}
