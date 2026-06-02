// DockerRunner — the thin seam between DockerSandbox and the `docker` CLI.
// DockerSandbox builds argument vectors and asks a runner to execute them; the
// real runner shells out via Bun, while tests inject a fake runner. This keeps
// the sandbox's logic (flags, fail-closed defaults, pin/mount validation) fully
// unit-testable without Docker, and without mocking the sandbox itself.

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface DockerRunner {
  /** Run `docker <args>` and return the result. Never throws on a non-zero exit. */
  run(args: readonly string[]): Promise<RunResult>;
}

/** Real runner: executes the docker CLI via Bun.spawn. */
export class BunDockerRunner implements DockerRunner {
  async run(args: readonly string[]): Promise<RunResult> {
    const proc = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr };
  }
}
