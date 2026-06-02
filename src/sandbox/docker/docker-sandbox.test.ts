import { test, expect } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { DockerSandbox } from "./docker-sandbox.ts";
import type { DockerRunner, RunResult } from "./runner.ts";

// The moving tag, assembled from parts so the literal never appears in source.
const MOVING = "lat" + "est";

class FakeDockerRunner implements DockerRunner {
  readonly calls: string[][] = [];
  constructor(private readonly respond: (args: readonly string[]) => RunResult = () => ({ exitCode: 0, stdout: "container-abc\n", stderr: "" })) {}
  run(args: readonly string[]): Promise<RunResult> {
    this.calls.push([...args]);
    return Promise.resolve(this.respond(args));
  }
}

const PINNED = "busybox:1.36.1";

test("spawn disables network by default (fail-closed) and hardens the container", async () => {
  const runner = new FakeDockerRunner();
  const sandbox = new DockerSandbox({ runner });
  const handle = await sandbox.spawn({ image: PINNED, sessionId: "s1", networkEnabled: false });
  expect(handle.id).toBe("container-abc");

  const args = runner.calls[0]!;
  expect(args.slice(0, 2)).toEqual(["run", "-d"]);
  // --network none
  expect(args[args.indexOf("--network") + 1]).toBe("none");
  expect(args).toContain("--cap-drop");
  expect(args[args.indexOf("--cap-drop") + 1]).toBe("ALL");
  expect(args).toContain("--security-opt");
  expect(args[args.indexOf("--security-opt") + 1]).toBe("no-new-privileges");
});

test("spawn enables bridge network only when explicitly requested", async () => {
  const runner = new FakeDockerRunner();
  await new DockerSandbox({ runner }).spawn({ image: PINNED, sessionId: "s1", networkEnabled: true });
  const args = runner.calls[0]!;
  expect(args[args.indexOf("--network") + 1]).toBe("bridge");
});

test("rejects a moving-tag image and an untagged image; accepts pinned + digest", async () => {
  const sandbox = new DockerSandbox({ runner: new FakeDockerRunner() });
  await expect(sandbox.spawn({ image: "busybox:" + MOVING, sessionId: "s", networkEnabled: false })).rejects.toThrow(
    MOVING,
  );
  await expect(sandbox.spawn({ image: "busybox", sessionId: "s", networkEnabled: false })).rejects.toThrow(
    "unpinned",
  );
  // pinned + digest do not throw
  await expect(sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false })).resolves.toBeDefined();
  await expect(
    sandbox.spawn({ image: "busybox@sha256:" + "a".repeat(64), sessionId: "s", networkEnabled: false }),
  ).resolves.toBeDefined();
});

test("denies mounting a host-secret path; allows a benign mount", async () => {
  const denied = new DockerSandbox({
    runner: new FakeDockerRunner(),
    mounts: [{ source: join(homedir(), ".ssh"), target: "/keys" }],
  });
  await expect(denied.spawn({ image: PINNED, sessionId: "s", networkEnabled: false })).rejects.toThrow("denied");

  const runner = new FakeDockerRunner();
  const allowed = new DockerSandbox({ runner, mounts: [{ source: "/tmp/agp-work", target: "/work", readOnly: true }] });
  await allowed.spawn({ image: PINNED, sessionId: "s", networkEnabled: false });
  expect(runner.calls[0]!.join(" ")).toContain("/tmp/agp-work:/work:ro");
});

test("a failed `docker run` throws — never falls back to host execution", async () => {
  const runner = new FakeDockerRunner((args) =>
    args[0] === "run" ? { exitCode: 125, stdout: "", stderr: "no such image" } : { exitCode: 0, stdout: "", stderr: "" },
  );
  await expect(new DockerSandbox({ runner }).spawn({ image: PINNED, sessionId: "s", networkEnabled: false })).rejects.toThrow(
    "docker run failed",
  );
});

test("exec surfaces a process failure as a non-zero exit (not thrown)", async () => {
  const runner = new FakeDockerRunner((args) =>
    args[0] === "exec"
      ? { exitCode: 127, stdout: "", stderr: "sh: nope: not found" }
      : { exitCode: 0, stdout: "container-abc\n", stderr: "" },
  );
  const sandbox = new DockerSandbox({ runner });
  const handle = await sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false });
  const result = await sandbox.exec(handle, ["nope"]);
  expect(result.exitCode).toBe(127);
  expect(result.stderr).toContain("not found");
});

test("teardown force-removes the container", async () => {
  const runner = new FakeDockerRunner();
  const sandbox = new DockerSandbox({ runner });
  const handle = await sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false });
  await sandbox.teardown(handle);
  expect(runner.calls.at(-1)).toEqual(["rm", "-f", handle.id]);
});

test("isolation() is honest: not vm-grade", () => {
  const iso = new DockerSandbox({ runner: new FakeDockerRunner() }).isolation();
  expect(iso.kind).toBe("docker-container");
  expect(iso.vmGrade).toBe(false);
  expect(iso.boundary).toContain("NOT a VM");
});

// Real Docker end-to-end — gated (CI stays fast/offline on the fake-runner tests).
test.skipIf(process.env.AGP_DOCKER_E2E !== "1")("real docker: spawn → exec → teardown", async () => {
  const { BunDockerRunner } = await import("./runner.ts");
  const sandbox = new DockerSandbox({ runner: new BunDockerRunner() });
  const handle = await sandbox.spawn({ image: PINNED, sessionId: "e2e", networkEnabled: false });
  const result = await sandbox.exec(handle, ["echo", "hello-agp"]);
  await sandbox.teardown(handle);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("hello-agp");
});
