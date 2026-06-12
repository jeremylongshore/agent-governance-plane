# Implementation Spec — bead agp-e7c: Slack Socket Mode receiver (inbound Allow/Deny → pending gate)

## 0. Goal and scope

Complete the HITL round-trip. Today AGP **sends** the approval prompt (`SlackChannel.postApprovalRequest` mints a nonce-bound Block Kit prompt at `src/channels/slack/slack-channel.ts:41-50`) and then **blocks** waiting for a human at `src/channels/slack/slack-channel.ts:56` (`await this.interactions.awaitInteraction(pending.nonce)`). The only `InteractionSource` that exists is the test-only `InMemoryInteractionSource` (`src/channels/slack/interactions.ts:25-37`). The human's click is never received.

This bead builds the production `InteractionSource` — a Slack Socket Mode receiver that opens an outbound WebSocket, streams `block_actions` payloads, parses each click into a `SlackInteraction`, acks every frame, and resolves the matching awaiting `awaitInteraction(nonce)` promise. It wires that receiver into `agp run --channel slack` (today fail-closed at `src/cli/commands/run.ts:89-97`), records every received verdict and every reject/timeout in the signed journal, and ships a CI-runnable pure-parser test suite plus a `AGP_SLACK_LIVE`-gated live test.

Out of scope (state honestly): multi-approver quorum, text-reply (`y <id>` / `n <id>`) path, durable cross-restart pending-approval persistence, and the live `claude` spawn into a real repo. Those are deferred; this bead delivers the button-click round-trip on a single running daemon.

## 1. Architecture

### 1.1 Where the receiver lives and how it connects

The receiver is a control-plane component. It lives **entirely in the control plane**, never in the sandbox. The trust boundary AGP enforces is Sandbox (untrusted agent) → Control Plane (trusted governor). The Socket Mode WebSocket is an **outbound dial from the control plane to Slack** authenticated by the operator's app-level token; the sandbox never sees the token, never opens a socket, and never receives a click. This preserves isolation: a compromised intendant cannot reach the approval channel because the channel is in a different process boundary, and approval flows in over a connection the sandbox has no handle to.

Connection model (Socket Mode, lifted from CCSC `server.ts:235-236` + `server.ts:3331`):

```text
control plane (agp run)
  └─ SocketModeInteractionSource
       ├─ POST apps.connections.open (app token)  → wss:// URL
       ├─ Bun.connect / WebSocket(wssUrl)          → persistent socket
       ├─ on frame: ack envelope_id, parse block_actions, resolve pending[nonce]
       └─ on close: reconnect (bounded backoff)
```

Socket Mode is chosen over an HTTP request URL deliberately: it requires **no public ingress**, honoring the council P0 decision "no public surface until defensible" (`000-docs/001-AT-DECR`). The daemon dials out; nothing listens.

### 1.2 The exact resolution seam

The blocking await is `src/channels/slack/slack-channel.ts:56`:

```text
const interaction = await this.interactions.awaitInteraction(pending.nonce);
```

`SocketModeInteractionSource.awaitInteraction(nonce)` returns a promise stored in a `Map<nonce, {resolve, reject, timer}>`. When a `block_actions` frame arrives, the receiver parses it (button `value` = nonce, per the send side at `src/channels/slack/blocks.ts:27-38`), looks up the pending promise by nonce, and resolves it with the parsed `SlackInteraction`. That resolution unblocks line 56; the existing channel logic then enforces the bot-rejection (`slack-channel.ts:64`) and one-time-nonce consume (`slack-channel.ts:66`) invariants unchanged. **No change to `SlackChannel` or `NonceStore` is required** — the interface contract at `src/channels/slack/interactions.ts:18-21` is the seam, and it already exists.

### 1.3 No shared-secret weakening

The receiver authenticates the *connection* with the app token only. It does **not** introduce any shared secret between sandbox and control plane, and it does **not** trust the nonce alone for authorization. The nonce correlates a click to a request; authorization still flows through `NonceStore.consume` (binding + expiry + one-shot, `src/channels/slack/nonce-store.ts:47-57`) and the `isBot` rejection. Slack's per-user identity (`payload.user.id`, `payload.user.is_bot`) is carried into the `SlackInteraction` and recorded as `decidedBy`. This matches CCSC's allowlist posture (`server.ts:2484`) — see the operator-allowlist note in §3.4.

## 2. File-by-file plan

### 2.1 NEW — `src/channels/slack/socket-mode.ts`

Production `InteractionSource`. Two cleanly separable concerns so the parser is CI-testable without a socket.

Exported surface:

```text
export function parseBlockAction(payload: unknown): SlackInteraction | null
export interface SocketDialer {
  open(appToken: string): Promise<SocketConnection>
}
export interface SocketConnection {
  onMessage(handler: (frame: SocketFrame) => void): void
  onClose(handler: () => void): void
  send(text: string): void
  close(): void
}
export interface SocketModeOptions {
  appToken: string
  dialer: SocketDialer            // injectable; real impl uses fetch + WebSocket
  awaitTimeoutMs?: number         // default 300_000, matches nonce TTL
  now?: () => number
}
export class SocketModeInteractionSource implements InteractionSource {
  constructor(opts: SocketModeOptions)
  start(): Promise<void>          // open socket, register handlers
  stop(): Promise<void>           // close socket, reject all pending
  awaitInteraction(nonce: string): Promise<SlackInteraction>
}
```

Key types and responsibilities:

- `parseBlockAction` — **pure**. Validates `payload.type === "block_actions"`, takes `payload.actions[0]`, reads `action_id` (must be `agp_approve` or `agp_deny`, the constants at `src/channels/slack/blocks.ts:7-8`), maps to `approved: boolean`, reads `value` as the nonce, reads `payload.user.id` and `payload.user.is_bot`. Returns `null` for any malformed / non-AGP / unknown-action payload so the receiver can ignore it. This is the function the CI suite hammers.
- `start()` — calls the dialer with the app token, registers `onMessage` (ack the frame's `envelope_id` first, then `parseBlockAction`, then resolve the pending promise if the nonce is awaited; drop silently if not) and `onClose` (reconnect with bounded backoff; on permanent failure reject all pending so no gate hangs forever).
- `awaitInteraction(nonce)` — register `{resolve, reject}` keyed by nonce; arm a timer (`awaitTimeoutMs`) that rejects with a `timeout` error so the daemon never blocks past the nonce TTL.
- `stop()` — close socket; reject every still-pending promise with a `shutdown` reason.

The ack-first ordering and `actions[0]` parsing are lifted directly from CCSC `server.ts:2469-2477`. The `SocketDialer` indirection is what makes the live WebSocket gateable behind `AGP_SLACK_LIVE`; in CI a fake dialer feeds canned frames.

### 2.2 NEW — `src/channels/slack/slack-dialer.ts`

The real, off-CI dialer. Exported surface:

```text
export class FetchWebSocketDialer implements SocketDialer {
  constructor(base?: string)      // default https://slack.com/api
  open(appToken: string): Promise<SocketConnection>
}
```

Responsibilities: POST `apps.connections.open` with `Authorization: Bearer <appToken>` (mirror the fetch pattern at `src/channels/slack/transport.ts:28-42`, including the `json.ok !== true` throw), read the `url` field, open a `WebSocket` to it, and adapt the socket's message/close events to the `SocketConnection` interface. This file is the only one that touches a live socket, so it is exercised only under `AGP_SLACK_LIVE=1` and is excluded from the CI coverage path (see §5.3).

### 2.3 MODIFIED — `src/cli/commands/run.ts`

Replace the fail-closed rejection at lines 89-97. New behavior:

```text
if (env.AGP_CHANNEL === "slack") {
  const slack = new FsDoctorProbe(env).slack();
  if (!slack.ok) { out(`agp run: AGP_CHANNEL=slack but ${slack.detail}. (fail-closed)`); return 1; }

  const { botToken, appToken, channelId } = resolveSlackCreds(env);   // see §6
  const transport = new FetchSlackTransport(botToken);

  let interactions: InteractionSource;
  if (env.AGP_SLACK_LIVE === "1") {
    const src = new SocketModeInteractionSource({ appToken, dialer: new FetchWebSocketDialer() });
    await src.start();
    interactions = src;
    out("agp run: AGP_CHANNEL=slack — live Socket Mode receiver connected.");
  } else {
    out("agp run: AGP_CHANNEL=slack but AGP_SLACK_LIVE!=1 — the live click receiver is the off-CI dogfood path; refusing to post a prompt that nothing can answer. (fail-closed)");
    return 1;
  }

  channel = new SlackChannel({ transport, interactions, channelId });
}
```

Rationale for keeping a fail-closed branch when `AGP_SLACK_LIVE` is unset: posting a real prompt with an in-memory source that can never receive a click would hang the gate forever. Refuse instead. The live receiver is the only honest production path, gated like `AGP_DOCKER_E2E` / `AGP_CLAUDE_LIVE` already are in this same file (lines 67-78, 112-115).

Imports to add: `SocketModeInteractionSource` + `InteractionSource` type, `FetchWebSocketDialer`, `SlackChannel`, `FetchSlackTransport`. The `channel` binding must become a `let` declared before the branch so both the slack and console paths assign it (today it is `const` at line 98).

### 2.4 UNCHANGED — reused per recon

- `src/channels/slack/slack-channel.ts` — the awaiting consumer; the seam at line 56 already calls the interface.
- `src/channels/slack/nonce-store.ts` — one-time consume, binding, expiry. No change.
- `src/channels/slack/interactions.ts` — the `InteractionSource` / `SlackInteraction` contract. No change; the new class implements it.
- `src/journal/journal.ts` — the `append` API (`src/journal/journal.ts:68-96`) records verdicts. No change.
- `src/daemon/daemon.ts` — already journals `approval.granted` / `approval.denied` around the await (`src/daemon/daemon.ts:147-153`). No change; see §4 for the additional reject/timeout journaling.

## 3. Correlation design

### 3.1 The correlation key is the nonce

The send side already stamps the nonce into both buttons' `value` (`src/channels/slack/blocks.ts:27,30,36,38`). The receiver reads `actions[0].value` back. The nonce is the single correlation token. We do **not** need CCSC's composite `(threadTs, requestId)` key (`lib.ts:1455-1457`) because the nonce is globally unique per request (it is a `randomUUID`, `src/channels/slack/nonce-store.ts:29`) and is itself bound to `messageId + sessionId + expiry` in the store. The nonce subsumes thread isolation: a click in any thread carrying nonce N resolves only the request that minted N.

`action_id` is used **only** to distinguish Approve from Deny (`agp_approve` → `approved:true`, `agp_deny` → `approved:false`). The `block_id` (`agp_approval:<messageId>`, set at `src/channels/slack/blocks.ts:23`) is available as a defense-in-depth cross-check but the nonce is authoritative.

### 3.2 Stale / duplicate / unknown clicks

- **Unknown action_id** (anything not `agp_approve` / `agp_deny`): `parseBlockAction` returns `null`; receiver acks and ignores. No journal entry (it is noise, not an AGP decision).
- **Unknown nonce** (no awaiting promise — e.g. the gate already resolved, or the daemon never minted it): receiver acks, finds no pending entry, drops the interaction. The nonce store will also reject it (`unknown nonce`) if it ever reaches `consume`. Record a `approval.rejected` journal event with reason `unknown nonce` (see §4) so a stray/forged click is auditable.
- **Duplicate / replay** (second click on the same prompt): the first click consumes the nonce (`src/channels/slack/nonce-store.ts:55`); the second arrives after the promise is already resolved, so it has no awaiting entry → treated as unknown-nonce, acked, journaled as `approval.rejected` reason `nonce already used (replay)`. The existing replay test (`src/channels/slack/replay-attack.test.ts`) already proves the consume side; this bead adds the receiver-side drop.
- **Bot actor**: `parseBlockAction` carries `isBot:true`; the channel rejects at `src/channels/slack/slack-channel.ts:64` without consuming the nonce, so a human can still act. The receiver does not special-case bots — it forwards the parsed interaction and lets the channel enforce the invariant (single enforcement point).

### 3.3 Daemon restart — honest v0 limitation

Pending approvals are held in two in-memory maps: `SlackChannel.pending` (`src/channels/slack/slack-channel.ts:32`) and the receiver's `pending` promise map. **Neither survives a daemon restart.** If `agp run` is killed while a prompt is outstanding:

- the awaiting `await` is gone, so a later click resolves nothing;
- on the next run the nonce is not in the (fresh) store, so even a valid click is rejected as `unknown nonce`.

This is acceptable at v0 because `agp run` is a single foreground session, not a long-lived multi-session daemon — the session dies with the process by design (`runLive` spawns and tears down one sandbox, `src/daemon/daemon.ts:181-207`). State the limitation in the run output and the spec: **a prompt outstanding across a restart must be re-issued; AGP fails closed (the gate does not auto-approve).** Durable pending-approval persistence (CCSC adapts to disk/SQLite per its recon notes) is a deferred follow-on, not this bead.

### 3.4 Operator allowlist (deferred, noted)

CCSC restricts who may click to `access.allowFrom` (`server.ts:2484`). AGP v0 is single-tenant operator-owned, so any human in the configured channel is the operator. The receiver records `decidedBy = payload.user.id` for audit, but does not yet gate on an allowlist. File a follow-on; do not block this bead.

## 4. Audit integration

Every received verdict already lands in the journal via the daemon: `approval.granted` / `approval.denied` at `src/daemon/daemon.ts:149-153`, then the effective `gate.allow` / `gate.deny` at `src/daemon/daemon.ts:157`. The hash chain + signed head checkpoint (`src/journal/journal.ts:88-103`) cover them automatically.

This bead adds **journaling for the paths the daemon never sees** — rejected and timed-out clicks resolve (or fail) inside the receiver before the daemon's `awaitDecision` returns. Because the receiver must not hold a journal reference directly (it lives below the daemon and the journal is the daemon's), wire an optional callback:

```text
export interface SocketModeOptions {
  ...
  onRejected?: (e: { reason: string; nonce: string; userId?: string }) => void
}
```

`agp run` passes a callback that appends to the same `Journal` instance it builds at `src/cli/commands/run.ts:102`. Event shapes (all conform to `JournalEvent`, `src/contracts/journal-event.ts:30-49` — reserved fields stay `null`):

- Unknown / replayed / forged click reaching the receiver:

```text
{ kind: "approval.rejected", actor: "session_owner",
  payload: { reason: "unknown nonce" | "nonce already used (replay)", decidedBy: <userId> } }
```

- Timeout (no human acted within the nonce TTL):

```text
{ kind: "approval.timeout", actor: "session_owner",
  payload: { reason: "no decision within ttl" } }
```

A timeout rejection from `awaitInteraction` surfaces at `src/channels/slack/slack-channel.ts:56` as a thrown error; the daemon's `gate` (`src/daemon/daemon.ts:147`) currently does not catch it. Add a narrow try/catch in `gate` so a timeout is journaled as `approval.timeout` and the gate **fails closed** (`effective = "deny"`), then continues to the existing `gate.deny` append at line 157. This keeps the fail-closed posture: no human, no approval.

The `approval.rejected` for unknown/replay nonces is the load-bearing audit addition — a forged or replayed click is now a signed, hash-chained record, not a silent drop.

## 5. Tests-first plan

All CI tests use fakes; **no live Slack in CI**. The `FetchSlackTransport` is faked exactly as the existing suite does (`src/channels/slack/slack-channel.test.ts:10-23`); the socket is faked via the injectable `SocketDialer`.

### 5.1 NEW — `src/channels/slack/socket-mode-parser.test.ts` (pure, CI)

Targets `parseBlockAction` — the function that must carry the coverage. Cases:

- approve click → `{approved:true, nonce, userId, isBot:false}` from a realistic `block_actions` fixture using `action_id: "agp_approve"` and `value: <nonce>`.
- deny click → `approved:false` with `action_id: "agp_deny"`.
- bot actor → `isBot:true` propagated.
- unknown action_id (`"agp_more"`, `"foo"`) → `null`.
- non-block_actions payload (`type: "view_submission"`) → `null`.
- empty / missing `actions` array → `null`.
- missing `value` (no nonce) → `null`.
- missing `user` → `null` (no `userId` to attribute).

### 5.2 NEW — `src/channels/slack/socket-mode.test.ts` (faked socket, CI)

Targets `SocketModeInteractionSource` with a `FakeDialer` that returns a `FakeConnection` whose `send`/`onMessage` are inspectable. Cases:

- **happy allow**: `awaitInteraction("n1")` pending; dialer delivers an approve frame for `n1`; promise resolves `approved:true`; assert the frame's `envelope_id` was acked via `connection.send`.
- **happy deny**: same, deny frame → `approved:false`.
- **timeout**: small `awaitTimeoutMs` (use injected `now` or fake timer); no frame delivered; promise rejects with timeout reason; `onRejected` callback fired with `"no decision within ttl"`.
- **unknown nonce frame**: deliver a frame for `n9` with no pending await → no throw, frame acked, `onRejected` fired with `"unknown nonce"`.
- **duplicate**: resolve `n1` once; deliver a second `n1` frame → no second resolution (promise already settled), `onRejected` fired with replay-class reason.
- **malformed frame** (parser returns null) → acked, ignored, no `onRejected`, no resolution.
- **stop() rejects pending**: pending `awaitInteraction` rejects with shutdown reason after `stop()`.

### 5.3 NEW — `src/channels/slack/slack-dialer.test.ts` (gated, off-CI)

```text
test.skipIf(process.env.AGP_SLACK_LIVE !== "1")(
  "real Socket Mode: apps.connections.open → wss → ack frame", async () => { ... });
```

Mirrors the gating idiom at `src/sandbox/docker/docker-sandbox.test.ts` (`test.skipIf(process.env.AGP_DOCKER_E2E !== "1")`). This file holds the only live-socket assertions; `slack-dialer.ts` is therefore exercised only here and is the deliberately-gated path excluded from the CI aggregate (the same posture `tests/TESTING.md` documents for `AGP_DOCKER_E2E` / `AGP_CLAUDE_LIVE`).

### 5.4 MODIFIED — `src/cli/commands/run.test.ts`

- `AGP_CHANNEL=slack` + `AGP_SLACK_LIVE` unset → returns 1, fail-closed message (asserts we refuse to post an unanswerable prompt).
- `AGP_CHANNEL=slack` with slack config missing → existing fail-closed path still returns 1 (probe rejection, `src/cli/probe.ts:40-56`).
- `AGP_CHANNEL=slack` + `AGP_SLACK_LIVE=1` with an injected fake dialer (if `runCommand` is refactored to accept a dialer for testability) → constructs `SlackChannel` and runs. If injecting a dialer into `runCommand` is too invasive, leave the live wiring to the gated dialer test and assert only the two fail-closed branches in CI.

### 5.5 Coverage posture

The pure parser (§5.1) and the faked-socket source (§5.2) put the bulk of `socket-mode.ts` under CI coverage; `slack-dialer.ts` is the sole gated module. Aggregate floors stay at `lines>=90 / funcs>=88` (`scripts/coverage-gate.sh`). Run `bash scripts/coverage-gate.sh` before pushing; if `socket-mode.ts` branches (reconnect/backoff) are hard to cover in CI, extract the pure decision (`shouldReconnect(attempt)`) and unit-test it rather than lowering the floor.

## 6. Config / secrets

Tokens resolve through the existing config module (`src/config.ts`) and probe (`src/cli/probe.ts:40-56`) — no new secret surface:

- `AGP_SLACK_BOT_TOKEN` or `config.slack.botToken` (`xoxb-…`) — Web API posts (`chat.postMessage` / `chat.update`).
- `AGP_SLACK_APP_TOKEN` or `config.slack.appToken` (`xapp-…`) — **Socket Mode app-level token**; required by `apps.connections.open`.
- `AGP_SLACK_CHANNEL` or `config.slack.channel` — target channel id.

Add a small `resolveSlackCreds(env)` helper (in `src/config.ts` alongside `resolvePaths`, or inline in `run.ts`) that reads env-first then `config.json`, matching the precedence the probe already uses (`src/cli/probe.ts:42-44`). The probe's `slack()` check already verifies all three are present, so `run.ts` can rely on it and read with confidence.

Required Slack app scopes / settings (document in the run-onboarding doc, not in code):

- Socket Mode **enabled**; an app-level token with `connections:write`.
- Bot scopes `chat:write` (post + update prompts).
- Interactivity **enabled** (buttons emit `block_actions`); no Request URL needed under Socket Mode.

Secrets posture: tokens never printed. The config home is operator-owned (`~/.agp`, `src/config.ts:34`). Per the repo SOPS standard, `config.json` holding tokens should be the SOPS-encrypted form or sourced from env at runtime; never commit a plaintext token. The Bearer header is set only inside the fetch call (`src/channels/slack/transport.ts:31`), never logged.

## 7. Risks and sequencing

Ordered builder checklist:

1. Write `parseBlockAction` + its pure test (`socket-mode-parser.test.ts`). Get it green first — it carries the coverage and has no I/O.
2. Define `SocketDialer` / `SocketConnection` / `SocketFrame` interfaces in `socket-mode.ts`.
3. Implement `SocketModeInteractionSource` (pending map, ack-first handler, timeout, `onRejected`, `start`/`stop`). Write `socket-mode.test.ts` with the `FakeDialer`.
4. Implement `FetchWebSocketDialer` in `slack-dialer.ts`; write the `AGP_SLACK_LIVE`-gated test.
5. Add the narrow try/catch in `daemon.gate` (`src/daemon/daemon.ts:147`) for timeout → `approval.timeout` + fail-closed deny; add `approval.rejected` journaling via the `onRejected` callback wired from `run.ts`.
6. Add `resolveSlackCreds`; rewire `src/cli/commands/run.ts:89-98` (change `channel` to `let`); update `run.test.ts`.
7. Run all gates: `bun run typecheck`, `bun run lint`, `bash scripts/coverage-gate.sh`, `bash scripts/claim-scan.sh` (the new run-output strings must not add a banned security claim — "signed audit log of every tool call" is the only allowed claim), `scripts/audit-harness verify`, markdownlint on any new docs.
8. Manual dogfood once: `AGP_CHANNEL=slack AGP_SLACK_LIVE=1 agp run`, click Approve and Deny in Slack, then `agp verify` the journal to confirm `approval.granted` / `approval.denied` / `gate.*` events chained and signed.

Risks:

- **Reconnect storms**: a flapping socket could spin. Bound backoff and cap attempts; on permanent failure reject all pending (fail-closed, never hang).
- **Coverage of reconnect branches** in CI — mitigate by extracting pure backoff decision logic (§5.5).
- **`run.ts` testability** — injecting a fake dialer into `runCommand` may need a new optional param; if it bloats the signature, keep live wiring behind the gated dialer test and cover only the fail-closed branches in CI (acceptable).

Open questions needing a human call:

1. **Allowlist at v0?** CCSC gates clicks to the session owner (`server.ts:2484`). AGP v0 treats any channel member as the operator. Confirm that is acceptable for v0, or pull the allowlist forward into this bead.
2. **Restart durability** — confirm the v0 "re-issue the prompt after a restart, fail closed" limitation (§3.3) is acceptable, or whether durable pending-approval persistence must ship now (it is a meaningfully larger bead).
3. **`run.ts` dialer injection** — is adding an optional `dialer` param to `runCommand` for CI coverage worth the surface change, or do we accept gated-only coverage of the live wiring?
