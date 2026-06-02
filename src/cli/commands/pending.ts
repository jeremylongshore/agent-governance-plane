// Honest placeholder for the runtime commands (`run`, `verify`, `sessions`).
//
// These depend on the Epic 03 core contracts and the Epic 04 daemon, which are
// not built yet. The commands are registered so the surface is discoverable,
// but they exit non-zero (2 = "not implemented") rather than pretend to work —
// no faked capability.

export function pendingCommand(
  name: string,
  err: (line: string) => void = console.error,
): number {
  err(
    `agp ${name}: not yet available. Depends on the Epic 03 core contracts ` +
      "(Gateway / SpriteAdapter / SandboxProvider / ChannelAdapter / PolicyVerdict / JournalEvent) " +
      "and the Epic 04 daemon. See 000-docs/012-AT-SPEC-cli-surface.md.",
  );
  return 2;
}
