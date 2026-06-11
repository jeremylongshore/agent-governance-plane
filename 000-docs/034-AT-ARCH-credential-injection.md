---
title: "Architecture: Credential Injection at the Gateway Exec Seam"
date: 2026-06-10
author: Jeremy Longshore
type: Architecture (ARCH)
epic: Sandbox hardening — credential injection (bead agp-4na.1)
source: src/sandbox/credentials.ts, src/daemon/daemon.ts
stability: INTERNAL — unstable — no public RFC at v0
---

# Architecture: Credential Injection at the Gateway Exec Seam

## Decision (canonical mechanism)

A sprite that needs a secret to run a tool emits a tool-call request whose
`args` contain an **opaque placeholder** `{{secret:NAME}}`. The control-plane
Daemon resolves that placeholder to the real secret value **only** in the argv it
hands to `sandbox.exec`, immediately **after** the policy gate and immediately
**before** execution. This is the **gateway-side execution** model the master
blueprint commits to (`002-PP-PLAN` §2.1 / §4.1).

This explicitly **rejects** the alternative "sprite-side env placeholder swap"
mechanism (where the container would be launched with secret-bearing env that the
sprite substitutes). That alternative is rejected because:

1. It would require spawning the container with secret env. `DockerSandbox.spawn`
   passes **no** `-e`/`--env` and must stay that way — a secret in container env
   is readable by every process in the container and survives in
   `docker inspect`.
2. It would put the secret on the sprite side of the trust boundary, outside the
   control plane that owns the policy gate and the journal.

If a future reviewer wants the env-swap mechanism instead, the daemon-seam design
changes materially — that is a fresh decision, not a silent flip.

## Why no contract (GatewayMessage / SandboxSpec) change is needed

`ToolCallRequest.args` is already `z.record(z.string, z.unknown())`
(`src/contracts/gateway-message.ts`). A placeholder is just an opaque **string
value** inside `args` — no new schema field, no new message kind. The frozen
contracts are untouched, so no Bead+ADR contract change is required. (Had a typed
placeholder field been added to `GatewayMessage`, or a secret field to
`SandboxSpec`, that *would* be a frozen-contract change requiring approval.)

The journal records **which** secrets a call used via a `secretsUsed` payload key
(an array of NAMES) on the existing `tool_call.executed` event — a new payload
key, not a new schema field, and never the secret values. The four reserved
`JournalEvent` fields stay null.

## Flow

```
sprite → tool_call_request { args: { command: "curl -H '… {{secret:GITHUB_TOKEN}}' …" } }
   │           (placeholder is an opaque string; the VALUE never crosses the wire)
   ▼
Daemon.mediate → policy gate → (if require) Slack HITL → journal
   │  effective-allow:
   │    cmd          = toCommand(req)                 # argv with the placeholder
   │    secretsUsed  = findPlaceholders(cmd)          # NAMES only → journal
   │    resolvedCmd  = resolvePlaceholders(cmd,vault) # VALUE injected here, only
   │    result       = sandbox.exec(handle, resolvedCmd)
   │    safeStdout   = redactSecrets(result.stdout, values)  # best-effort echo guard
   ▼
journal: tool_call.executed { exitCode, secretsUsed: ["GITHUB_TOKEN"] }   # no values
sprite ← tool_call_result { output: safeStdout }                          # redacted
```

The secret value lives only in (a) the control-plane process memory and (b) the
post-gate argv passed to `docker exec`. It is in **no** `GatewayMessage`, **no**
journal payload, and **no** delivered `ToolCallResult`.

## Fail-closed semantics

- A referenced-but-absent secret throws `unresolved secret placeholder: <NAME>`.
  The literal placeholder is **never** passed to exec, and it is **never**
  silently blanked.
- If no `vault` dependency is supplied at all, an unexpected placeholder still
  fails closed (an empty vault is used, so resolution throws) rather than reaching
  exec verbatim.

## Honest boundary (what this does NOT guarantee)

- **Host process table.** The resolved secret appears in the argv of the
  `docker exec` invocation, which is visible in the **host** process table (e.g.
  `ps` on the host) for the duration of the call. This is host-side, not
  in-container, and is the honest boundary — AGP does not claim to hide the secret
  from a host-root observer.
- **A tool can still use — and echo — the secret.** Once a tool is allowed to run
  with the secret, it can do anything that secret permits, including printing it.
  `redactSecrets` masks known secret values in the tool's stdout before it reaches
  the journal or the sprite, but this is **best-effort defense-in-depth**, not a
  guarantee (a tool can transform/encode the value to evade a literal match).
- **The vault itself.** Where real secrets live (env via `EnvSecretVault`'s
  `AGP_SECRET_*` namespace at v0, or a future KMS-backed vault) is the operator's
  responsibility; this design only governs the injection seam.

## Surface

- `src/sandbox/credentials.ts`: `SecretVault`, `EnvSecretVault`,
  `findPlaceholders`, `resolvePlaceholders`, `resolvedSecretValues`,
  `redactSecrets`, `SECRET_ENV_PREFIX`, `PLACEHOLDER_RE`.
- `src/daemon/daemon.ts`: optional `vault` dep on `DaemonDeps`; the resolve →
  exec → redact seam inside `mediate`. `spawn` is unchanged — no container env.
