// Real DoctorProbe: answers each prerequisite against the live environment —
// Docker daemon, operator config + Slack env, the signing key file, the policy
// file. Constructed from resolved paths + an env map so it stays deterministic
// and unit-testable in isolation from runDoctor.

import { existsSync, readFileSync } from "node:fs";
import type { DoctorProbe } from "./checks.ts";
import { type AgpConfig, type AgpPaths, resolvePaths } from "../config.ts";
import { loadPolicyFile } from "../policy/engine.ts";
import { validatePolicy } from "../policy/dangerous.ts";
import { classifyEgressProbe, egressProbeArgv } from "../sandbox/docker/network-preflight.ts";
import type { RunResult } from "../sandbox/docker/runner.ts";

// A pinned image with busybox `nc` for the throwaway isolation probe.
const SANDBOX_PROBE_IMAGE = "busybox:1.36.1";

export class FsDoctorProbe implements DoctorProbe {
  private readonly paths: AgpPaths;
  private readonly env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
    this.paths = resolvePaths(env);
  }

  private loadConfig(): AgpConfig {
    if (!existsSync(this.paths.config)) return {};
    try {
      return JSON.parse(readFileSync(this.paths.config, "utf8")) as AgpConfig;
    } catch {
      return {};
    }
  }

  docker(): { ok: boolean; detail: string } {
    const bin = Bun.which("docker");
    if (!bin) return { ok: false, detail: "docker CLI not found on PATH" };
    const proc = Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" });
    if (proc.exitCode !== 0) {
      return { ok: false, detail: "docker daemon not reachable (`docker info` failed)" };
    }
    return { ok: true, detail: `docker present (${bin})` };
  }

  slack(): { ok: boolean; detail: string } {
    const cfg = this.loadConfig();
    const botToken = this.env.AGP_SLACK_BOT_TOKEN ?? cfg.slack?.botToken;
    const appToken = this.env.AGP_SLACK_APP_TOKEN ?? cfg.slack?.appToken;
    const channel = this.env.AGP_SLACK_CHANNEL ?? cfg.slack?.channel;
    const missing = [
      ["bot token", botToken],
      ["app token", appToken],
      ["channel", channel],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length > 0) {
      return { ok: false, detail: `slack config missing: ${missing.join(", ")}` };
    }
    return { ok: true, detail: "slack bot token, app token, and channel configured" };
  }

  signing(): { ok: boolean; detail: string } {
    if (!existsSync(this.paths.signingKey)) {
      return { ok: false, detail: `signing key not found at ${this.paths.signingKey}` };
    }
    return { ok: true, detail: "journal signing key present" };
  }

  /** Synchronous docker invocation for the sandbox probe (mirrors docker()). */
  private dockerSync(args: readonly string[]): RunResult {
    const proc = Bun.spawnSync(["docker", ...args]);
    return {
      exitCode: proc.exitCode,
      stdout: proc.stdout.toString(),
      stderr: proc.stderr.toString(),
    };
  }

  sandbox(): { ok: boolean; detail: string } {
    // Short-circuit: no point probing isolation if docker itself is unavailable.
    if (!this.docker().ok) {
      return { ok: false, detail: "skipped: docker unavailable" };
    }
    const sessionId = `agp-doctor-${Date.now()}`;
    const run = this.dockerSync([
      "run",
      "-d",
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--label",
      `agp.session=${sessionId}`,
      SANDBOX_PROBE_IMAGE,
      "sleep",
      "30",
    ]);
    if (run.exitCode !== 0) {
      return { ok: false, detail: `sandbox spawn failed: ${run.stderr.trim() || run.stdout.trim()}` };
    }
    const id = run.stdout.trim();
    if (id.length === 0) {
      return { ok: false, detail: "sandbox spawn returned no container id" };
    }
    try {
      const probe = this.dockerSync(["exec", id, ...egressProbeArgv()]);
      const verdict = classifyEgressProbe(probe, false);
      return verdict.isolated
        ? { ok: true, detail: "sandbox network isolation verified (active egress probe blocked)" }
        : { ok: false, detail: `sandbox isolation unverified: ${verdict.detail}` };
    } finally {
      // Always tear the throwaway container down, even on a thrown verdict.
      this.dockerSync(["rm", "-f", id]);
    }
  }

  policy(): { ok: boolean; detail: string } {
    if (!existsSync(this.paths.policy)) {
      return { ok: false, detail: `policy file not found at ${this.paths.policy}` };
    }
    // Fatal parse: a malformed policy fails the check (it would otherwise fail open).
    let file: ReturnType<typeof loadPolicyFile>;
    try {
      file = loadPolicyFile(this.paths.policy);
    } catch (err) {
      return { ok: false, detail: `invalid policy: ${(err as Error).message}` };
    }
    const { errors, warnings } = validatePolicy(file);
    if (errors.length > 0) {
      return { ok: false, detail: `policy errors: ${errors.join("; ")}` };
    }
    const base = `policy valid (${file.rules.length} rule${file.rules.length === 1 ? "" : "s"})`;
    // Warnings (e.g. broad auto-approve) do not fail the check, but are surfaced.
    return { ok: true, detail: warnings.length > 0 ? `${base} — WARN: ${warnings.join("; ")}` : base };
  }
}
