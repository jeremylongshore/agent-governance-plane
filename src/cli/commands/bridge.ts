// `agp bridge` — the PreToolUse hook command Claude Code runs for every tool call
// inside a live dogfood session. It reads the hook event from stdin, asks AGP's
// gate over the session Unix socket, and exits 0 (allow) or 2 + stderr (deny).
// All the logic lives in the testable hook-bridge module; this is the thin CLI
// shell. Fail-closed: a missing socket arg denies.

import { runBridge } from "../../sprites/claude-code/hook-bridge.ts";

export async function bridgeCommand(
  argv: string[],
  stdinText: string,
  err: (line: string) => void = console.error,
): Promise<number> {
  const si = argv.indexOf("--socket");
  const socket = si >= 0 ? argv[si + 1] : process.env.AGP_HOOK_SOCKET;
  if (socket === undefined || socket.length === 0) {
    err("agp bridge: --socket <path> required (fail-closed deny)");
    return 2;
  }
  const res = await runBridge(stdinText, socket);
  if (res.stderr !== undefined) err(res.stderr);
  return res.exitCode;
}
