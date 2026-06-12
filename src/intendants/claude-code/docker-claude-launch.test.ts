import { test, expect } from "bun:test";
import {
  buildContainerBridgeCommand,
  buildDockerClaudeArgv,
  CONTAINER_SETTINGS,
  CONTAINER_SOCKET,
} from "./docker-claude-launch.ts";

test("buildContainerBridgeCommand uses in-container paths for bun + the socket", () => {
  const cmd = buildContainerBridgeCommand();
  expect(cmd).toContain("bun /agp/src/cli/index.ts bridge");
  expect(cmd).toContain(CONTAINER_SOCKET);
});

test("buildDockerClaudeArgv mounts repo/socket/agp, hardens, enables egress, runs claude on the settings", () => {
  const argv = buildDockerClaudeArgv({
    image: "agp-claude-sandbox:v0",
    repoPath: "/tmp/repo",
    socketDir: "/tmp/sock",
    agpRepoPath: "/tmp/agp",
    task: "fix the flake",
    networkEnabled: true,
  });
  const s = argv.join(" ");
  expect(argv[0]).toBe("run");
  expect(s).toContain("--network bridge");
  expect(s).toContain("--cap-drop ALL");
  expect(s).toContain("--security-opt no-new-privileges");
  expect(s).toContain("/tmp/repo:/work");
  expect(s).toContain("/tmp/sock:/agp-sock");
  expect(s).toContain("/tmp/agp:/agp:ro");
  expect(s).toContain("agp-claude-sandbox:v0");
  expect(argv).toContain(CONTAINER_SETTINGS);
  expect(argv).toContain("fix the flake");
});

test("network can be disabled for defense in depth", () => {
  const argv = buildDockerClaudeArgv({
    image: "i:1",
    repoPath: "/r",
    socketDir: "/s",
    agpRepoPath: "/a",
    task: "t",
    networkEnabled: false,
  });
  expect(argv.join(" ")).toContain("--network none");
});

test("the API key is referenced by NAME only — never as a value in the argv", () => {
  const argv = buildDockerClaudeArgv({
    image: "i:1",
    repoPath: "/r",
    socketDir: "/s",
    agpRepoPath: "/a",
    task: "t",
    withApiKey: true,
  });
  expect(argv).toContain("-e");
  expect(argv).toContain("ANTHROPIC_API_KEY");
  expect(argv.join(" ")).not.toContain("ANTHROPIC_API_KEY=");
});
