---
title: "Architecture: Docker Sandbox"
date: 2026-06-02
author: Jeremy Longshore
type: Architecture (ARCH)
epic: Epic 07 — Docker-based sandbox execution (bead agp-yvo)
source: src/sandbox/docker/
---

# Architecture: Docker Sandbox

The production `SandboxProvider` (contract: `016`/`017`-AT-CONT) backed by
`docker`. It runs a sprite inside a hardened container and surfaces **honest**
isolation guarantees — see the threat model in
[`020-AT-THRT-docker-isolation-limits.md`](020-AT-THRT-docker-isolation-limits.md).

## Components

| Module | Role |
|--------|------|
| `runner.ts` — `DockerRunner` | thin seam that runs `docker <args>`; `BunDockerRunner` shells out via Bun |
| `docker-sandbox.ts` — `DockerSandbox` | builds argument vectors, validates inputs, implements `spawn`/`exec`/`teardown`/`isolation` |

`DockerSandbox` takes the runner by injection, so all of its logic (flags,
fail-closed defaults, image-pin + mount validation) is unit-tested with a fake
runner — no Docker required. A real-Docker end-to-end test is gated behind
`AGP_DOCKER_E2E=1`.

## Lifecycle

- **spawn** — `docker run -d` a detached, kept-alive container, then exec into it.
- **exec** — `docker exec <id> <command>`; a non-zero exit is the tool's own
  failure, surfaced (not a launch error).
- **teardown** — `docker rm -f <id>`.

## Hardening (fail-closed defaults)

- `--network none` unless `SandboxSpec.networkEnabled` is explicitly true.
- `--cap-drop ALL`, `--security-opt no-new-privileges`.
- Resource caps: `--memory`, `--cpus`, `--pids-limit`.
- **Image pinning:** a moving/unpinned image is rejected; use a specific tag or
  an `@sha256:` digest (reproducibility + supply-chain hygiene).
- **Mount denial:** host-secret prefixes (`~/.ssh`, `~/.aws`, `~/.gnupg`,
  `~/.config`, `~/.agp`, `/etc`, `/run`, …) may never be mounted; mounts default
  to read-only.
- **No silent host fallback:** if `docker run` fails, `spawn` throws — AGP never
  runs the agent on the host.

## Selecting it

`agp run` uses the recording reference sandbox by default; set
`AGP_SANDBOX=docker` + `AGP_SANDBOX_IMAGE=<pinned image>` to use real isolation.
That path fails closed if Docker is unavailable.
