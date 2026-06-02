// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See 000-docs/017-AT-CONT-sandbox-provider.md.
//
// SandboxProvider — the contract for running a sprite inside an isolated
// execution environment. v0 is Docker-based with HONEST isolation limits
// (a container is not a VM); the contract surfaces those limits rather than
// over-claiming, so callers reason about real guarantees.

import { z } from "zod";

export const SandboxSpec = z.object({
  /** Container image (or equivalent) to run the sprite in. */
  image: z.string().min(1),
  /** Session this sandbox serves. */
  sessionId: z.string().min(1),
  /** Whether outbound network is permitted (default: denied — fail-closed). */
  networkEnabled: z.boolean().default(false),
});
export type SandboxSpec = z.infer<typeof SandboxSpec>;

export const ExecResult = z.object({
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
});
export type ExecResult = z.infer<typeof ExecResult>;

/**
 * Honest isolation guarantees. v0 is a Docker container: process/filesystem
 * isolation, NOT a security boundary against a kernel exploit. The contract
 * states this so no caller (or marketing claim) over-promises.
 */
export const IsolationGuarantees = z.object({
  /** e.g. "docker-container". */
  kind: z.string().min(1),
  /** Plain-English statement of what is and is NOT isolated. */
  boundary: z.string().min(1),
  /** True only for a hardware/VM-grade boundary. False for a plain container. */
  vmGrade: z.boolean(),
});
export type IsolationGuarantees = z.infer<typeof IsolationGuarantees>;

/** Opaque handle to a running sandbox. */
export interface SandboxHandle {
  readonly id: string;
  readonly sessionId: string;
}

export interface SandboxProvider {
  /** Honest statement of the isolation this provider gives. */
  isolation(): IsolationGuarantees;
  /** Spawn an isolated sandbox for the spec. */
  spawn(spec: SandboxSpec): Promise<SandboxHandle>;
  /** Run a command inside the sandbox. */
  exec(handle: SandboxHandle, command: readonly string[]): Promise<ExecResult>;
  /** Tear the sandbox down; idempotent. */
  teardown(handle: SandboxHandle): Promise<void>;
}
