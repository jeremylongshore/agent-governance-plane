---
title: "Threat Model: Docker Isolation Limits"
date: 2026-06-02
author: Jeremy Longshore
type: Threat Model (THRT)
epic: Epic 07 — Docker-based sandbox execution (bead agp-yvo)
stability: honest threat model — AT-DECR Q4 lock (do not inflate)
---

# Threat Model: Docker Isolation Limits

Per the council "honest threat model" lock (AT-DECR Q4), this states plainly what
the Docker sandbox **does** and **does not** defend. Docker is Linux namespace +
cgroup isolation — **not** a VM or a kernel-level security boundary. AGP must not
present it as one.

## What the sandbox DOES defend (with the hardening AGP applies)

| Threat | Defense |
|--------|---------|
| Agent reads/writes arbitrary host files | No host mounts by default; host-secret paths denied; mounts read-only by default |
| Agent exfiltrates over the network | `--network none` by default (on only when explicitly enabled), **and the spawn actively VERIFIES the isolation** — see "Verified network isolation" below |
| Privilege escalation inside the container | `--cap-drop ALL`, `--security-opt no-new-privileges` |
| Resource exhaustion of the host | `--memory`, `--cpus`, `--pids-limit` |
| Non-reproducible / tampered images | moving/unpinned images rejected; pin a tag or `@sha256` digest |
| Silent fallthrough to the host | none — a failed launch is a hard error, never host execution |

## Verified network isolation (not just declared)

A declared `--network none` can silently degrade to default-allow — a daemon
misconfig, a docker-network override, or a stale image with a baked-in network
would otherwise pass unnoticed. AGP therefore does not *trust* the flag: after a
`networkEnabled: false` container starts, the spawn runs an active egress probe
**inside** the container (a busybox `nc` connect attempt to a non-routable
TEST-NET-1 address with a short timeout) and **fails closed**:

- Probe could not reach the network (non-zero exit / connection refused / DNS or
  route failure) ⇒ isolation confirmed, the handle is returned.
- Probe reached the network (clean connect) **or** the result is ambiguous (the
  `nc` binary is missing, an unrecognized error) ⇒ the just-spawned container is
  torn down and the spawn **throws** `network isolation not enforced`. A container
  that can egress is never handed back. Cannot-prove-isolation is treated as
  not-isolated.

`agp doctor` surfaces this as a `sandbox` check (spawns a throwaway pinned
`busybox` container with network off and runs the same probe), so the operator
can confirm enforcement before a real session. A dev-only escape hatch
(`AGP_SANDBOX_SKIP_NETCHECK=1`) skips the probe but emits a loud warning — it
never skips silently.

This verifies *enforcement of the configured network mode*; it does not change
what the boundary is (see below). Once `networkEnabled: true`, isolation is not
expected and the probe is not run.

## What the sandbox does NOT defend

- **Kernel exploits / container escape.** The container shares the host kernel.
  A kernel-level vulnerability or a Docker/runc escape defeats the boundary. For
  hostile, untrusted code, use a real VM or a microVM (gVisor / Firecracker / Kata).
- **Side channels.** Timing, cache, and resource-contention side channels across
  the shared kernel are out of scope.
- **Supply-chain trust of the image itself.** Pinning makes the image
  *reproducible*, not *trustworthy*; image provenance/signing is a separate
  concern (intendant identity / Sigstore lands at v0.6).
- **Anything once `networkEnabled: true`.** Enabling network re-opens
  exfiltration; only enable it for a trusted workload.

## Honest posture (vs. inflation)

`IsolationGuarantees.vmGrade` is **`false`** and stays false for this provider.
Marketing/security copy may not describe the sandbox as VM-grade, "fully
isolated," or a hard security boundary — those claims would violate the Epic 11
claim-control registry. The accurate phrasing is "namespace + cgroup isolation
with dropped capabilities and no-new-privileges; not a VM boundary."

## When this is and isn't enough

- **Sufficient** for the v0 single-operator case: the operator supervises their
  own Claude Code session fixing their own repos; the sandbox limits blast radius
  and the signed journal records every gated tool call.
- **Insufficient** for running untrusted third-party agents or multi-tenant
  workloads. Those require VM-grade isolation (deferred) and per-tenant controls
  (v0.1+). Do not run hostile code in this sandbox and expect containment.
