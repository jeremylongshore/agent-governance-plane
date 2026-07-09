import { test, expect } from "bun:test";
import {
  TriggerEvent,
  TriggerHeartbeat,
  TriggerKind,
  TriggerSourceSpec,
  type TriggerSource,
} from "./trigger-source.ts";

const FIRED_AT = "2026-07-09T12:00:00.000Z";

function minimalEvent() {
  return {
    triggerId: "trg-1",
    source: "intentvision-anomaly",
    kind: "poll" as const,
    firedAt: FIRED_AT,
    correlationId: "corr-1",
  };
}

// --- TriggerKind -----------------------------------------------------------

test("TriggerKind accepts every documented source kind", () => {
  const kinds: TriggerKind[] = ["cron", "webhook", "channel_event", "poll", "manual"];
  for (const k of kinds) {
    expect(TriggerKind.parse(k)).toBe(k);
  }
});

test("TriggerKind rejects an unknown kind", () => {
  expect(() => TriggerKind.parse("smoke-signal")).toThrow();
});

// --- TriggerEvent ----------------------------------------------------------

test("TriggerEvent parses a minimal event and applies fail-closed defaults", () => {
  const e = TriggerEvent.parse(minimalEvent());
  // Defaults are the safe/inert values.
  expect(e.dedupeKey).toBeNull();
  expect(e.sessionId).toBeNull();
  expect(e.payload).toEqual({});
});

test("TriggerEvent preserves all provided fields", () => {
  const e = TriggerEvent.parse({
    ...minimalEvent(),
    dedupeKey: "sha256:abc",
    sessionId: "sess-9",
    payload: { metric: "signups", z: 4.1 },
  });
  expect(e.dedupeKey).toBe("sha256:abc");
  expect(e.sessionId).toBe("sess-9");
  expect(e.payload).toEqual({ metric: "signups", z: 4.1 });
});

test("TriggerEvent REQUIRES correlationId (cross-chain causal pointer invariant)", () => {
  const { correlationId, ...withoutCorrelation } = minimalEvent();
  void correlationId;
  expect(() => TriggerEvent.parse(withoutCorrelation)).toThrow();
  expect(() => TriggerEvent.parse({ ...minimalEvent(), correlationId: "" })).toThrow();
});

test("TriggerEvent rejects missing required fields", () => {
  expect(() => TriggerEvent.parse({ ...minimalEvent(), triggerId: "" })).toThrow();
  expect(() => TriggerEvent.parse({ ...minimalEvent(), source: "" })).toThrow();
  const { firedAt, ...noFiredAt } = minimalEvent();
  void firedAt;
  expect(() => TriggerEvent.parse(noFiredAt)).toThrow();
});

test("TriggerEvent rejects a non-ISO firedAt", () => {
  expect(() => TriggerEvent.parse({ ...minimalEvent(), firedAt: "yesterday" })).toThrow();
});

test("TriggerEvent is strict — an unknown key is a malformed trigger (fail-closed)", () => {
  expect(() => TriggerEvent.parse({ ...minimalEvent(), rogue: true })).toThrow();
});

test("TriggerEvent rejects an invalid kind", () => {
  expect(() => TriggerEvent.parse({ ...minimalEvent(), kind: "telepathy" })).toThrow();
});

// --- TriggerSourceSpec -----------------------------------------------------

test("TriggerSourceSpec defaults enabled to false (fail-closed / flag-gated)", () => {
  const s = TriggerSourceSpec.parse({ id: "src-1", kind: "cron" });
  expect(s.enabled).toBe(false);
  expect(s.livenessTimeoutMs).toBeNull();
  expect(s.config).toEqual({});
});

test("TriggerSourceSpec accepts an enabled cadence source with a liveness timeout", () => {
  const s = TriggerSourceSpec.parse({
    id: "intentvision-cron",
    kind: "cron",
    enabled: true,
    livenessTimeoutMs: 3_600_000,
    config: { schedule: "0 * * * *" },
  });
  expect(s.enabled).toBe(true);
  expect(s.livenessTimeoutMs).toBe(3_600_000);
  expect(s.config).toEqual({ schedule: "0 * * * *" });
});

test("TriggerSourceSpec rejects a non-positive livenessTimeoutMs", () => {
  expect(() => TriggerSourceSpec.parse({ id: "s", kind: "poll", livenessTimeoutMs: 0 })).toThrow();
  expect(() => TriggerSourceSpec.parse({ id: "s", kind: "poll", livenessTimeoutMs: -1 })).toThrow();
});

test("TriggerSourceSpec rejects an empty id and is strict", () => {
  expect(() => TriggerSourceSpec.parse({ id: "", kind: "cron" })).toThrow();
  expect(() => TriggerSourceSpec.parse({ id: "s", kind: "cron", rogue: 1 })).toThrow();
});

// --- TriggerHeartbeat ------------------------------------------------------

test("TriggerHeartbeat parses a fresh (never-fired) source and defaults restartCount", () => {
  const h = TriggerHeartbeat.parse({ sourceId: "src-1", running: true, lastEventAt: null });
  expect(h.lastEventAt).toBeNull();
  expect(h.restartCount).toBe(0);
});

test("TriggerHeartbeat carries a last-event time and restart count for the supervisor", () => {
  const h = TriggerHeartbeat.parse({
    sourceId: "src-1",
    running: false,
    lastEventAt: FIRED_AT,
    restartCount: 3,
  });
  expect(h.lastEventAt).toBe(FIRED_AT);
  expect(h.restartCount).toBe(3);
});

test("TriggerHeartbeat rejects a negative restartCount and is strict", () => {
  expect(() =>
    TriggerHeartbeat.parse({ sourceId: "s", running: true, lastEventAt: null, restartCount: -1 }),
  ).toThrow();
  expect(() =>
    TriggerHeartbeat.parse({ sourceId: "s", running: true, lastEventAt: null, rogue: 1 }),
  ).toThrow();
});

// --- TriggerSource port ----------------------------------------------------

test("a TriggerSource implementation type-checks and honors the emit/heartbeat port", async () => {
  const emitted: TriggerEvent[] = [];
  const spec = TriggerSourceSpec.parse({ id: "fake", kind: "manual", enabled: true });

  const source: TriggerSource = {
    spec: () => spec,
    async start(emit) {
      // Fail-closed: an implementation must not emit when disabled. Here enabled
      // is true, so a single firing is admitted.
      await emit(TriggerEvent.parse(minimalEvent()));
    },
    async stop() {
      /* idempotent no-op */
    },
    heartbeat: () =>
      TriggerHeartbeat.parse({ sourceId: spec.id, running: true, lastEventAt: FIRED_AT }),
  };

  await source.start(async (e) => {
    emitted.push(e);
  });
  await source.stop();

  expect(emitted).toHaveLength(1);
  expect(emitted[0]!.correlationId).toBe("corr-1");
  expect(source.heartbeat().sourceId).toBe("fake");
  expect(source.spec().enabled).toBe(true);
});
