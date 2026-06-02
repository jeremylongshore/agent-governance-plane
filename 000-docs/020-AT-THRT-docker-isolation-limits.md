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
| Agent exfiltrates over the network | `--network none` by default (on only when explicitly enabled) |
| Privilege escalation inside the container | `--cap-drop ALL`, `--security-opt no-new-privileges` |
| Resource exhaustion of the host | `--memory`, `--cpus`, `--pids-limit` |
| Non-reproducible / tampered images | moving/unpinned images rejected; pin a tag or `@sha256` digest |
| Silent fallthrough to the host | none — a failed launch is a hard error, never host execution |

## What the sandbox does NOT defend

- **Kernel exploits / container escape.** The container shares the host kernel.
  A kernel-level vulnerability or a Docker/runc escape defeats the boundary. For
  hostile, untrusted code, use a real VM or a microVM (gVisor / Firecracker / Kata).
- **Side channels.** Timing, cache, and resource-contention side channels across
  the shared kernel are out of scope.
- **Supply-chain trust of the image itself.** Pinning makes the image
  *reproducible*, not *trustworthy*; image provenance/signing is a separate
  concern (sprite identity / Sigstore lands at v0.6).
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
