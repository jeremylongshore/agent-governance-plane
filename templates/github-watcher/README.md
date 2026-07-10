# github-watcher — agent template (Slice 0)

The first governed background agent on the plane: watch a GitHub repo for new
releases (or commits on a branch) and — for each genuinely new item — file an
issue on a repo **you own**, with a human approving every single issue in Slack
before it exists. Every tool call the watcher attempts passes the policy gate
and lands in the signed audit log of every tool call.

This template is also the reference shape for **every** agent template: the
spec is a committed value, the policy is explicit, and the test pack ships WITH
the template.

## The deploy rule

```text
Prompt → Spec → Tests → Policy → Deploy
```

| Stage | Artifact here | Enforced by |
|---|---|---|
| Spec | `watcher.spec.json` — human-committed (`humanCommit` REQUIRED), `enabled:false` by default | `loadWatcherSpec` refuses drafts and unknown keys |
| Tests | `tests/` — unit · policy · state · acceptance (this pack) | `bun test` in CI; the pack must be green before any deploy |
| Policy | `policy.snippet.json` — read = `allow`, issue-create = `require` (HITL) | the policy engine (strictest-wins, default-deny) |
| Deploy | a cron line calling `agp watch run` | fail-closed wiring: missing key/policy/Docker/Slack refuses |

## The test pack (ships with the template)

| Layer | File | What it proves |
|---|---|---|
| unit | `tests/unit.test.ts` | the spec example parses; drafts (no `humanCommit`) and unknown keys refuse; commands build correctly |
| **policy** (custom layer) | `tests/policy.test.ts` | issue-create can NEVER pass without approval; unknown tools default-deny |
| **state/memory** (custom layer) | `tests/state.test.ts` | same key twice → zero duplicate actions; the knowledge chain detects tampering |
| acceptance | `tests/acceptance.test.ts` | consecutive runs end-to-end: new item → HITL → issue; repeat run → silence; denied → suppressed forever; journal + pointer verifiable offline |
| evaluation (custom layer) | — | Slice 2 (JRig eval pack — judgment quality scoring); the deterministic diff needs no judge yet |

## Install (operator)

1. Copy `watcher.spec.json` somewhere durable, edit `repo`/`issueRepo` (a repo
   **you own** — never file issues on unowned repos), set `humanCommit.committedBy`
   to yourself, and flip `enabled` to `true`. That edit **is** the human commit
   gate: a model may draft a spec, only your commit makes it loadable.
2. Merge `policy.snippet.json` rules into `~/.agp/policy.json`.
3. One tick, reference mode (executes nothing, proves the loop):

   ```bash
   agp watch run --spec /path/to/watcher.spec.json
   ```

4. Live, with real isolation + real Slack approvals:

   ```bash
   AGP_SANDBOX=docker AGP_SANDBOX_IMAGE=<pinned image with gh> \
   AGP_CHANNEL=slack AGP_SLACK_LIVE=1 \
   agp watch run --spec /path/to/watcher.spec.json
   ```

   Auth for `gh` inside the sandbox: set `"ghTokenSecret": "GH_TOKEN"` in the
   spec and export `AGP_SECRET_GH_TOKEN` — the placeholder resolves only in the
   post-gate argv; the token never enters the journal or Slack.

5. Cadence — a cron line (the OS owns the schedule at Slice 0):

   ```cron
   0 9 * * * agp watch run --spec /path/to/watcher.spec.json
   ```

6. Dead-man's-switch — wire into your liveness sweep:

   ```bash
   agp watch status --spec /path/to/watcher.spec.json   # exit 1 = stale/broken
   ```

## Behavior you can rely on

- **No duplicate alerts.** An item is observed exactly once — approved
  (actioned) or denied (suppressed; the watcher never nags) — in a hash-chained
  state log. Same SHA twice → silence.
- **Fail-closed everywhere.** Unparseable read → recorded failure, zero actions.
  After `maxConsecutiveFailures` in a row the runner REFUSES until a human runs
  `agp watch enable` (restart-intensity bound).
- **Answerable history.** Each run brackets the signed journal with
  `trigger.fired` / `trigger.settled` events carrying the shared
  `correlationId` and the knowledge chain's tip hash — "what did it know when
  it acted?" is reconstructable offline (`agp verify` + the state log).
