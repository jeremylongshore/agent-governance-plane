// RecordingSandbox — AGP reference SandboxProvider. It RECORDS exec requests and
// returns a canned result; it executes NOTHING. That is deliberate: running
// arbitrary tool calls with no isolation is exactly what AGP exists to prevent,
// so the reference impl never does it.
//
// REFERENCE — the production sandbox (Epic 07, agp-yvo) replaces this with real
// Docker isolation. Its isolation() honestly reports the boundary.

import type {
  ExecResult,
  IsolationGuarantees,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "../contracts/sandbox-provider.ts";

export class RecordingSandbox implements SandboxProvider {
  readonly recorded: Array<{ handle: string; command: readonly string[] }> = [];

  isolation(): IsolationGuarantees {
    return {
      kind: "recording-reference",
      boundary: "none — records exec requests and runs nothing; not for production use",
      vmGrade: false,
    };
  }

  spawn(spec: SandboxSpec): Promise<SandboxHandle> {
    return Promise.resolve({ id: `ref-${spec.sessionId}`, sessionId: spec.sessionId });
  }

  exec(handle: SandboxHandle, command: readonly string[]): Promise<ExecResult> {
    this.recorded.push({ handle: handle.id, command });
    return Promise.resolve({
      exitCode: 0,
      stdout: `[recording-sandbox] would run: ${command.join(" ")}`,
      stderr: "",
    });
  }

  teardown(_handle: SandboxHandle): Promise<void> {
    return Promise.resolve();
  }
}
