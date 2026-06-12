// Architecture rules for AGP, enforced by `scripts/audit-harness arch`
// (dependency-cruiser). These encode the layering the whole design rests on:
//   contracts (leaf, pure schemas) <- policy/journal/sandbox/channels/sprites/
//   runtime/gateway (mid) <- daemon (orchestrator) <- cli (top).
// Run: scripts/audit-harness arch   (CI + local). Edit deliberately — these are
// load-bearing invariants, not style preferences.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Circular dependencies break the single-writer/linear reasoning the kernel relies on.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "contracts-are-leaf",
      comment:
        "src/contracts/** are pure schemas (zod) — they must not import any other src/ layer. " +
        "If a contract needs another module, the dependency is pointing the wrong way.",
      severity: "error",
      from: { path: "^src/contracts/" },
      to: { path: "^src/(?!contracts/)" },
    },
    {
      name: "cli-is-top",
      comment: "Only src/cli/ may import src/cli/ — the CLI is the top layer; nothing below it depends up.",
      severity: "error",
      from: { pathNot: "^src/cli/" },
      to: { path: "^src/cli/" },
    },
    {
      name: "daemon-not-imported-by-leaves",
      comment: "The daemon orchestrates the mid layers; contracts/policy/journal must not depend on it.",
      severity: "error",
      from: { path: "^src/(contracts|policy|journal)/" },
      to: { path: "^src/daemon/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
    },
  },
};
