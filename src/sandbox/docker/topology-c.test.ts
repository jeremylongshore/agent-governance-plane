import { test, expect } from "bun:test";
import {
  DEFAULT_EGRESS_PROXY_IMAGE,
  harnessRunArgv,
  internalNetworkCreateArgv,
  proxyNetworkConnectArgv,
  proxyRunArgv,
  spawnTopologyC,
  teardownTopologyC,
  topologyCNames,
} from "./topology-c.ts";
import type { DockerRunner, RunResult } from "./runner.ts";

const PINNED = "busybox:1.36.1";
const MOVING = "lat" + "est";

class FakeDockerRunner implements DockerRunner {
  readonly calls: string[][] = [];
  constructor(private readonly respond: (args: readonly string[]) => RunResult = () => ({ exitCode: 0, stdout: "id\n", stderr: "" })) {}
  run(args: readonly string[]): Promise<RunResult> {
    this.calls.push([...args]);
    return Promise.resolve(this.respond(args));
  }
}

// --- pure builders ------------------------------------------------------------

test("topologyCNames: deterministic per-session network + proxy names", () => {
  expect(topologyCNames("abc")).toEqual({ network: "agp-egress-abc", proxy: "agp-proxy-abc" });
});

test("internalNetworkCreateArgv: --internal (no default route), asserted verbatim", () => {
  expect(internalNetworkCreateArgv("agp-egress-s1")).toEqual(["network", "create", "--internal", "agp-egress-s1"]);
});

test("proxyRunArgv: pinned image, no-new-privileges, allowlist + CONNECT-allowlist via env, bridge for model egress", () => {
  const argv = proxyRunArgv({ name: "agp-proxy-s1", image: PINNED, allowlist: ["a.model", "b.model"], proxyPort: 3128 });
  expect(argv.slice(0, 2)).toEqual(["run", "-d"]);
  expect(argv[argv.indexOf("--name") + 1]).toBe("agp-proxy-s1");
  expect(argv[argv.indexOf("--network") + 1]).toBe("bridge"); // bridge ⇒ model egress
  expect(argv).toContain("no-new-privileges");
  expect(argv).toContain("agp.role=egress-proxy");
  expect(argv).toContain("AGP_EGRESS_ALLOWLIST=a.model,b.model");
  expect(argv).toContain("AGP_EGRESS_CONNECT_ALLOWLIST=a.model,b.model"); // CONNECT tunnel allowlist
  expect(argv).toContain("AGP_EGRESS_PROXY_PORT=3128");
  expect(argv.at(-1)).toBe(PINNED);
});

test("proxyRunArgv: rejects an unpinned/moving proxy image (assertPinnedImage)", () => {
  expect(() => proxyRunArgv({ name: "p", image: "squid:" + MOVING, allowlist: ["a.model"], proxyPort: 3128 })).toThrow(
    MOVING,
  );
  expect(() => proxyRunArgv({ name: "p", image: "squid", allowlist: ["a.model"], proxyPort: 3128 })).toThrow("unpinned");
});

test("DEFAULT_EGRESS_PROXY_IMAGE is pinned (passes through proxyRunArgv without throwing)", () => {
  expect(() =>
    proxyRunArgv({ name: "p", image: DEFAULT_EGRESS_PROXY_IMAGE, allowlist: ["a.model"], proxyPort: 3128 }),
  ).not.toThrow();
  // Never the moving tag.
  expect(DEFAULT_EGRESS_PROXY_IMAGE.endsWith(":" + MOVING)).toBe(false);
});

test("proxyNetworkConnectArgv: attaches the proxy to the internal network, asserted verbatim", () => {
  expect(proxyNetworkConnectArgv("agp-egress-s1", "agp-proxy-s1")).toEqual([
    "network",
    "connect",
    "agp-egress-s1",
    "agp-proxy-s1",
  ]);
});

test("harnessRunArgv: internal network only, HTTPS_PROXY→proxy, full hardening, pinned image", () => {
  const argv = harnessRunArgv({
    image: PINNED,
    sessionId: "s1",
    network: "agp-egress-s1",
    proxyName: "agp-proxy-s1",
    proxyPort: 3128,
    keepAlive: ["sleep", "infinity"],
  });
  expect(argv[argv.indexOf("--network") + 1]).toBe("agp-egress-s1"); // internal net, NOT bridge
  expect(argv[argv.indexOf("--cap-drop") + 1]).toBe("ALL");
  expect(argv).toContain("no-new-privileges");
  expect(argv).toContain("agp.session=s1");
  expect(argv).toContain("HTTPS_PROXY=http://agp-proxy-s1:3128");
  expect(argv).toContain("HTTP_PROXY=http://agp-proxy-s1:3128");
  expect(argv).toContain("https_proxy=http://agp-proxy-s1:3128");
  // image then keepAlive at the tail.
  expect(argv.slice(-3)).toEqual([PINNED, "sleep", "infinity"]);
});

test("harnessRunArgv: rejects an unpinned harness image", () => {
  expect(() =>
    harnessRunArgv({ image: "x", sessionId: "s", network: "n", proxyName: "p", proxyPort: 3128, keepAlive: [] }),
  ).toThrow("unpinned");
});

// --- orchestrator (DI over the fake runner) -----------------------------------

function buildRespond(args: readonly string[]): RunResult {
  if (args[0] === "run") {
    const isProxy = args.includes("agp.role=egress-proxy");
    return { exitCode: 0, stdout: isProxy ? "proxy-1\n" : "harness-1\n", stderr: "" };
  }
  return { exitCode: 0, stdout: "", stderr: "" };
}

test("spawnTopologyC: drives net→proxy→connect→harness in order and returns the handle + aux resources", async () => {
  const runner = new FakeDockerRunner(buildRespond);
  const built = await spawnTopologyC(runner, {
    image: PINNED,
    sessionId: "s1",
    egress: { mode: "allowlist", allowlist: ["api.model"] },
    keepAlive: ["sleep", "infinity"],
  });
  expect(built.handle).toEqual({ id: "harness-1", sessionId: "s1" });
  expect(built.proxyId).toBe("proxy-1");
  expect(built.names).toEqual({ network: "agp-egress-s1", proxy: "agp-proxy-s1" });
  expect(runner.calls[0]!).toEqual(["network", "create", "--internal", "agp-egress-s1"]);
  expect(runner.calls[1]![0]).toBe("run"); // proxy
  expect(runner.calls[2]!).toEqual(["network", "connect", "agp-egress-s1", "agp-proxy-s1"]);
  expect(runner.calls[3]![0]).toBe("run"); // harness
});

test("spawnTopologyC: refuses a non-allowlist mode (fail closed)", async () => {
  const runner = new FakeDockerRunner(buildRespond);
  await expect(
    spawnTopologyC(runner, {
      image: PINNED,
      sessionId: "s",
      egress: { mode: "full", allowlist: [] },
      keepAlive: [],
    }),
  ).rejects.toThrow("requires egress mode 'allowlist'");
  expect(runner.calls).toHaveLength(0);
});

test("spawnTopologyC: refuses an empty allowlist (fail closed)", async () => {
  const runner = new FakeDockerRunner(buildRespond);
  await expect(
    spawnTopologyC(runner, {
      image: PINNED,
      sessionId: "s",
      egress: { mode: "allowlist", allowlist: [] },
      keepAlive: [],
    }),
  ).rejects.toThrow("non-empty model-host allowlist");
  expect(runner.calls).toHaveLength(0);
});

test("spawnTopologyC: refuses an allowlist host with injection chars (defense-in-depth, before any docker call)", async () => {
  const runner = new FakeDockerRunner(buildRespond);
  await expect(
    spawnTopologyC(runner, {
      image: PINNED,
      sessionId: "s",
      egress: { mode: "allowlist", allowlist: ["api.model\nevil directive"] },
      keepAlive: [],
    }),
  ).rejects.toThrow("invalid egress allowlist host");
  expect(runner.calls).toHaveLength(0);
});

test("spawnTopologyC: refuses an out-of-range proxy port (fail closed, before any docker call)", async () => {
  const runner = new FakeDockerRunner(buildRespond);
  for (const proxyPort of [0, 70000, 3128.5]) {
    await expect(
      spawnTopologyC(runner, {
        image: PINNED,
        sessionId: "s",
        egress: { mode: "allowlist", allowlist: ["api.model"] },
        keepAlive: [],
        proxyPort,
      }),
    ).rejects.toThrow("invalid proxy port");
  }
  expect(runner.calls).toHaveLength(0);
});

test("spawnTopologyC: network create failure throws before any container is run", async () => {
  const runner = new FakeDockerRunner((args) =>
    args[0] === "network" && args[1] === "create"
      ? { exitCode: 1, stdout: "", stderr: "network exists" }
      : { exitCode: 0, stdout: "id\n", stderr: "" },
  );
  await expect(
    spawnTopologyC(runner, {
      image: PINNED,
      sessionId: "s",
      egress: { mode: "allowlist", allowlist: ["api.model"] },
      keepAlive: [],
    }),
  ).rejects.toThrow("internal network create failed");
  expect(runner.calls.some((c) => c[0] === "run")).toBe(false);
});

test("spawnTopologyC: a failed harness run tears down proxy + network (no leak)", async () => {
  const runner = new FakeDockerRunner((args) => {
    if (args[0] === "run" && args.includes("agp.role=egress-proxy")) return { exitCode: 0, stdout: "proxy-1\n", stderr: "" };
    if (args[0] === "run") return { exitCode: 125, stdout: "", stderr: "harness boom" };
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  await expect(
    spawnTopologyC(runner, {
      image: PINNED,
      sessionId: "s9",
      egress: { mode: "allowlist", allowlist: ["api.model"] },
      keepAlive: [],
    }),
  ).rejects.toThrow("harness run failed");
  const flat = runner.calls.map((c) => c.join(" "));
  expect(flat).toContain("rm -f agp-proxy-s9");
  expect(flat).toContain("network rm agp-egress-s9");
});

test("spawnTopologyC: an empty harness container id is a hard error (with teardown)", async () => {
  const runner = new FakeDockerRunner((args) => {
    if (args[0] === "run" && args.includes("agp.role=egress-proxy")) return { exitCode: 0, stdout: "proxy-1\n", stderr: "" };
    if (args[0] === "run") return { exitCode: 0, stdout: "   \n", stderr: "" }; // blank id
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  await expect(
    spawnTopologyC(runner, {
      image: PINNED,
      sessionId: "s10",
      egress: { mode: "allowlist", allowlist: ["api.model"] },
      keepAlive: [],
    }),
  ).rejects.toThrow("returned no container id");
  expect(runner.calls.map((c) => c.join(" "))).toContain("network rm agp-egress-s10");
});

test("spawnTopologyC: a failed proxy network connect tears everything down", async () => {
  const runner = new FakeDockerRunner((args) => {
    if (args[0] === "network" && args[1] === "connect") return { exitCode: 1, stdout: "", stderr: "connect boom" };
    if (args[0] === "run") return { exitCode: 0, stdout: "proxy-1\n", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  await expect(
    spawnTopologyC(runner, {
      image: PINNED,
      sessionId: "s11",
      egress: { mode: "allowlist", allowlist: ["api.model"] },
      keepAlive: [],
    }),
  ).rejects.toThrow("proxy network connect failed");
  // The proxy is removed by NAME (stable even if id capture failed mid-build).
  const flat = runner.calls.map((c) => c.join(" "));
  expect(flat).toContain("rm -f agp-proxy-s11");
  expect(flat).toContain("network rm agp-egress-s11");
});

test("teardownTopologyC: idempotent — removes harness, proxy, then network in order", async () => {
  const runner = new FakeDockerRunner();
  await teardownTopologyC(runner, {
    names: { network: "agp-egress-s1", proxy: "agp-proxy-s1" },
    harnessId: "harness-1",
    proxyId: "proxy-1",
  });
  expect(runner.calls).toEqual([
    ["rm", "-f", "harness-1"],
    ["rm", "-f", "agp-proxy-s1"],
    ["network", "rm", "agp-egress-s1"],
  ]);
});

test("teardownTopologyC: skips the harness rm when no harness id is known (partial build)", async () => {
  const runner = new FakeDockerRunner();
  await teardownTopologyC(runner, { names: { network: "agp-egress-s1", proxy: "agp-proxy-s1" } });
  expect(runner.calls).toEqual([
    ["rm", "-f", "agp-proxy-s1"],
    ["network", "rm", "agp-egress-s1"],
  ]);
});
