import { test, expect } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { DockerSandbox } from "./docker-sandbox.ts";
import type { DockerRunner, RunResult } from "./runner.ts";

// The moving tag, assembled from parts so the literal never appears in source.
const MOVING = "lat" + "est";

// Default responder: a successful `docker run` returning a container id, and any
// `docker exec` (the network-isolation preflight) reading as ISOLATED
// (connection refused). Tests that exercise the preflight breach override this.
function defaultRespond(args: readonly string[]): RunResult {
  if (args[0] === "exec") return { exitCode: 1, stdout: "", stderr: "nc: connection refused" };
  return { exitCode: 0, stdout: "container-abc\n", stderr: "" };
}

class FakeDockerRunner implements DockerRunner {
  readonly calls: string[][] = [];
  constructor(private readonly respond: (args: readonly string[]) => RunResult = defaultRespond) {}
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
  // verifyIsolation off: this test is about exec error surfacing, not the preflight.
  const sandbox = new DockerSandbox({ runner, verifyIsolation: false });
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

test("spawn runs the network-isolation preflight and resolves when egress is blocked", async () => {
  const runner = new FakeDockerRunner(); // default exec ⇒ connection refused ⇒ isolated
  const sandbox = new DockerSandbox({ runner });
  const handle = await sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false });
  expect(handle.id).toBe("container-abc");
  // run, then the preflight exec probe.
  expect(runner.calls[0]![0]).toBe("run");
  expect(runner.calls[1]!.slice(0, 2)).toEqual(["exec", "container-abc"]);
  expect(runner.calls[1]).toContain("nc");
});

test("spawn REJECTS and tears down when the preflight finds the container can egress", async () => {
  // The silent-degrade case: --network none requested but the probe connects.
  const runner = new FakeDockerRunner((args) =>
    args[0] === "exec" ? { exitCode: 0, stdout: "open", stderr: "" } : { exitCode: 0, stdout: "container-abc\n", stderr: "" },
  );
  const sandbox = new DockerSandbox({ runner });
  await expect(sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false })).rejects.toThrow(
    "network isolation not enforced",
  );
  // The just-spawned container must be torn down — no orphan that can egress.
  expect(runner.calls.at(-1)).toEqual(["rm", "-f", "container-abc"]);
});

test("AGP_SANDBOX_SKIP_NETCHECK=1 skips the probe with a loud warning (dev escape hatch)", async () => {
  const prev = process.env.AGP_SANDBOX_SKIP_NETCHECK;
  process.env.AGP_SANDBOX_SKIP_NETCHECK = "1";
  try {
    const runner = new FakeDockerRunner();
    const warnings: string[] = [];
    const sandbox = new DockerSandbox({ runner, warn: (m) => warnings.push(m) });
    const handle = await sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false });
    expect(handle.id).toBe("container-abc");
    // No exec probe was issued — only the run.
    expect(runner.calls.every((c) => c[0] !== "exec")).toBe(true);
    expect(warnings.some((w) => w.includes("SKIPPED") && w.includes("UNVERIFIED"))).toBe(true);
  } finally {
    if (prev === undefined) delete process.env.AGP_SANDBOX_SKIP_NETCHECK;
    else process.env.AGP_SANDBOX_SKIP_NETCHECK = prev;
  }
});

test("verifyIsolation:false disables the preflight entirely (no probe exec)", async () => {
  const runner = new FakeDockerRunner();
  const sandbox = new DockerSandbox({ runner, verifyIsolation: false });
  await sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false });
  expect(runner.calls.every((c) => c[0] !== "exec")).toBe(true);
});

test("the preflight does not run when network is explicitly enabled", async () => {
  const runner = new FakeDockerRunner();
  const sandbox = new DockerSandbox({ runner });
  await sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: true });
  expect(runner.calls.every((c) => c[0] !== "exec")).toBe(true);
});

test("egress policy 'allowlist' fails CLOSED in CI/normal use — no AGP_TOPOLOGY_C_E2E ⇒ no container created", async () => {
  // Default (no AGP_TOPOLOGY_C_E2E): Topology C has no validated proxy yet, so
  // allowlist mode REFUSES rather than fall back to full egress. Preserves the
  // pre-wiring fail-closed posture (invariants #1 + #5: default behavior intact).
  const prev = process.env.AGP_TOPOLOGY_C_E2E;
  delete process.env.AGP_TOPOLOGY_C_E2E;
  try {
    const runner = new FakeDockerRunner();
    const sandbox = new DockerSandbox({ runner, egress: { mode: "allowlist", allowlist: ["api.model.test"] } });
    await expect(sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false })).rejects.toThrow(
      "requires AGP_TOPOLOGY_C_E2E",
    );
    // Fail-closed BEFORE any docker call — never leave an unrestricted-egress container running.
    expect(runner.calls).toHaveLength(0);
  } finally {
    if (prev === undefined) delete process.env.AGP_TOPOLOGY_C_E2E;
    else process.env.AGP_TOPOLOGY_C_E2E = prev;
  }
});

// --- Topology C spawn-gate (agp-3s4.4) ----------------------------------------

// A responder for the Topology C orchestration sequence: network create, proxy
// run (returns a proxy id), network connect, harness run (returns the harness id),
// then the two preflight exec probes. By default the preflight reads as ENFORCED:
// the non-model probe is refused (exit 1) and the model probe connects (exit 0).
function topologyCRespond(args: readonly string[]): RunResult {
  if (args[0] === "exec") {
    // args: ["exec", <id>, "nc", "-w", "3", "-z", <host>, <port>]
    const host = args[6];
    if (host === "example.com") return { exitCode: 1, stdout: "", stderr: "nc: connection refused" }; // non-model BLOCKED
    return { exitCode: 0, stdout: "open", stderr: "" }; // model REACHABLE
  }
  if (args[0] === "run") {
    const isProxy = args.includes("agp.role=egress-proxy");
    return { exitCode: 0, stdout: isProxy ? "proxy-xyz\n" : "harness-abc\n", stderr: "" };
  }
  // network create / network connect / rm / network rm
  return { exitCode: 0, stdout: "", stderr: "" };
}

function withTopologyCEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const keys = ["AGP_TOPOLOGY_C_E2E", "AGP_TOPOLOGY_C_SKIP"] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    const next = env[k];
    if (next === undefined) delete process.env[k];
    else process.env[k] = next;
  }
  const restore = () => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
  return fn().finally(restore);
}

test("Topology C with AGP_TOPOLOGY_C_E2E: spawns net+proxy+harness, runs the preflight, returns the verified handle", async () => {
  await withTopologyCEnv({ AGP_TOPOLOGY_C_E2E: "1", AGP_TOPOLOGY_C_SKIP: undefined }, async () => {
    const runner = new FakeDockerRunner(topologyCRespond);
    const sandbox = new DockerSandbox({ runner, egress: { mode: "allowlist", allowlist: ["api.model.test"] } });
    const handle = await sandbox.spawn({ image: PINNED, sessionId: "s1", networkEnabled: false });
    expect(handle.id).toBe("harness-abc");

    // Orchestration order: internal network create → proxy run → network connect → harness run.
    expect(runner.calls[0]!).toEqual(["network", "create", "--internal", "agp-egress-s1"]);
    const proxyRun = runner.calls[1]!;
    expect(proxyRun.slice(0, 2)).toEqual(["run", "-d"]);
    expect(proxyRun).toContain("agp.role=egress-proxy");
    expect(proxyRun).toContain("AGP_EGRESS_ALLOWLIST=api.model.test");
    expect(runner.calls[2]!).toEqual(["network", "connect", "agp-egress-s1", "agp-proxy-s1"]);
    const harnessRun = runner.calls[3]!;
    expect(harnessRun[harnessRun.indexOf("--network") + 1]).toBe("agp-egress-s1");
    expect(harnessRun).toContain("--cap-drop");
    expect(harnessRun[harnessRun.indexOf("--cap-drop") + 1]).toBe("ALL");
    expect(harnessRun).toContain("HTTPS_PROXY=http://agp-proxy-s1:3128");

    // Then the two preflight probes (non-model, then model).
    expect(runner.calls[4]!.slice(0, 2)).toEqual(["exec", "harness-abc"]);
    expect(runner.calls[4]!).toContain("example.com");
    expect(runner.calls[5]!).toContain("api.model.test");
  });
});

test("Topology C E2E: a NOT-enforced preflight verdict tears down EVERYTHING and throws (no unverified handle)", async () => {
  await withTopologyCEnv({ AGP_TOPOLOGY_C_E2E: "1", AGP_TOPOLOGY_C_SKIP: undefined }, async () => {
    // The silent-degrade breach: the non-model host is REACHABLE ⇒ egress not restricted.
    const runner = new FakeDockerRunner((args) => {
      if (args[0] === "exec") return { exitCode: 0, stdout: "open", stderr: "" }; // both reachable ⇒ NOT enforced
      if (args[0] === "run") {
        const isProxy = args.includes("agp.role=egress-proxy");
        return { exitCode: 0, stdout: isProxy ? "proxy-xyz\n" : "harness-abc\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const sandbox = new DockerSandbox({ runner, egress: { mode: "allowlist", allowlist: ["api.model.test"] } });
    await expect(sandbox.spawn({ image: PINNED, sessionId: "s2", networkEnabled: false })).rejects.toThrow(
      "egress allowlist not enforced",
    );
    // The harness, the proxy, and the internal network must all be removed.
    const flat = runner.calls.map((c) => c.join(" "));
    expect(flat).toContain("rm -f harness-abc");
    expect(flat).toContain("rm -f agp-proxy-s2");
    expect(flat).toContain("network rm agp-egress-s2");
  });
});

test("Topology C E2E: a failed proxy run tears down the network and throws (no half-built topology leaks)", async () => {
  await withTopologyCEnv({ AGP_TOPOLOGY_C_E2E: "1", AGP_TOPOLOGY_C_SKIP: undefined }, async () => {
    const runner = new FakeDockerRunner((args) => {
      if (args[0] === "run" && args.includes("agp.role=egress-proxy")) {
        return { exitCode: 125, stdout: "", stderr: "no such proxy image" };
      }
      if (args[0] === "exec") return { exitCode: 1, stdout: "", stderr: "nc: connection refused" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const sandbox = new DockerSandbox({ runner, egress: { mode: "allowlist", allowlist: ["api.model.test"] } });
    await expect(sandbox.spawn({ image: PINNED, sessionId: "s3", networkEnabled: false })).rejects.toThrow(
      "proxy sidecar run failed",
    );
    // No harness was ever spawned; the network we created must be torn down.
    const flat = runner.calls.map((c) => c.join(" "));
    expect(flat).toContain("network rm agp-egress-s3");
    expect(flat.some((c) => c.startsWith("run -d") && c.includes("agp.session=s3"))).toBe(false);
  });
});

test("Topology C SKIP=1: spawns the topology, skips the preflight, loud-warns, returns an UNVERIFIED handle", async () => {
  await withTopologyCEnv({ AGP_TOPOLOGY_C_E2E: "1", AGP_TOPOLOGY_C_SKIP: "1" }, async () => {
    const runner = new FakeDockerRunner(topologyCRespond);
    const warnings: string[] = [];
    const sandbox = new DockerSandbox({
      runner,
      egress: { mode: "allowlist", allowlist: ["api.model.test"] },
      warn: (m) => warnings.push(m),
    });
    const handle = await sandbox.spawn({ image: PINNED, sessionId: "s4", networkEnabled: false });
    expect(handle.id).toBe("harness-abc");
    // The topology was built, but NO preflight exec probe ran.
    expect(runner.calls.every((c) => c[0] !== "exec")).toBe(true);
    expect(warnings.some((w) => w.includes("SKIPPED") && w.includes("UNVERIFIED"))).toBe(true);
  });
});

test("Topology C SKIP=1 still fails closed WITHOUT AGP_TOPOLOGY_C_E2E (skip does not bypass the E2E gate)", async () => {
  await withTopologyCEnv({ AGP_TOPOLOGY_C_E2E: undefined, AGP_TOPOLOGY_C_SKIP: "1" }, async () => {
    const runner = new FakeDockerRunner(topologyCRespond);
    const sandbox = new DockerSandbox({ runner, egress: { mode: "allowlist", allowlist: ["api.model.test"] } });
    await expect(sandbox.spawn({ image: PINNED, sessionId: "s5", networkEnabled: false })).rejects.toThrow(
      "requires AGP_TOPOLOGY_C_E2E",
    );
    expect(runner.calls).toHaveLength(0);
  });
});

test("egress policy 'full' ⇒ bridge network and no isolation preflight (overrides spec.networkEnabled)", async () => {
  const runner = new FakeDockerRunner();
  const sandbox = new DockerSandbox({ runner, egress: { mode: "full", allowlist: [] } });
  // Even with networkEnabled:false on the spec, the policy wins ⇒ bridge.
  await sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: false });
  const args = runner.calls[0]!;
  expect(args[args.indexOf("--network") + 1]).toBe("bridge");
  expect(runner.calls.every((c) => c[0] !== "exec")).toBe(true);
});

test("egress policy 'none' ⇒ no network and the isolation preflight runs (overrides spec.networkEnabled)", async () => {
  const runner = new FakeDockerRunner();
  const sandbox = new DockerSandbox({ runner, egress: { mode: "none", allowlist: [] } });
  // Even with networkEnabled:true on the spec, the policy wins ⇒ none + preflight.
  await sandbox.spawn({ image: PINNED, sessionId: "s", networkEnabled: true });
  const args = runner.calls[0]!;
  expect(args[args.indexOf("--network") + 1]).toBe("none");
  expect(runner.calls[1]!.slice(0, 2)).toEqual(["exec", "container-abc"]);
});

test("no egress policy ⇒ behavior is byte-for-byte unchanged (legacy networkEnabled flag)", async () => {
  const runner = new FakeDockerRunner();
  await new DockerSandbox({ runner }).spawn({ image: PINNED, sessionId: "s", networkEnabled: true });
  expect(runner.calls[0]![runner.calls[0]!.indexOf("--network") + 1]).toBe("bridge");
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

// Real Docker: the network-isolation preflight must report isolated for a
// --network none container and NOT isolated when bridge networking is on
// (proving the probe actually detects egress, not a no-op). Gated.
test.skipIf(process.env.AGP_DOCKER_E2E !== "1")("real docker: preflight detects isolation vs egress", async () => {
  const { BunDockerRunner } = await import("./runner.ts");
  const { verifyNetworkIsolation } = await import("./network-preflight.ts");
  const runner = new BunDockerRunner();
  const sandbox = new DockerSandbox({ runner });

  // --network none: the preflight inside spawn proves isolation, so spawn resolves.
  const isolated = await sandbox.spawn({ image: PINNED, sessionId: "e2e-iso", networkEnabled: false });
  await sandbox.teardown(isolated);

  // bridge networking: a container that CAN egress must read as NOT isolated.
  const open = await sandbox.spawn({ image: PINNED, sessionId: "e2e-open", networkEnabled: true });
  const verdict = await verifyNetworkIsolation(runner, open, { networkRequested: false });
  await sandbox.teardown(open);
  expect(verdict.isolated).toBe(false);
});

// Real Docker Topology C — gated on AGP_TOPOLOGY_C_E2E (needs a real validated
// egress proxy, agp-3s4.3.2/.4.2). The fake-runner tests above cover the gate +
// orchestration; this exercises the real proxy/network plumbing end-to-end.
test.skipIf(process.env.AGP_TOPOLOGY_C_E2E !== "1")("real docker: Topology C allowlist spawn → verified handle → teardown", async () => {
  const { BunDockerRunner } = await import("./runner.ts");
  // allowlist[0] is probed as the model host — supply a real reachable HTTPS host
  // via AGP_TOPOLOGY_C_MODEL_HOST when validating against a real proxy.
  const modelHost = process.env.AGP_TOPOLOGY_C_MODEL_HOST ?? "api.anthropic.com";
  const sandbox = new DockerSandbox({
    runner: new BunDockerRunner(),
    egress: { mode: "allowlist", allowlist: [modelHost] },
  });
  const handle = await sandbox.spawn({ image: PINNED, sessionId: "e2e-topoc", networkEnabled: false });
  expect(handle.id.length).toBeGreaterThan(0);
  await sandbox.teardown(handle);
});
