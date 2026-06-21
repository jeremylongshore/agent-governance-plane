// SessionStore — durable ownership of in-flight agent sessions (agp-4na.2).
// Design + rationale: 000-docs/041-AT-ADR-durable-session-lease-and-recovery.md.
//
// A store persists SessionLease records so a daemon crash does not orphan an
// in-flight session: on restart the daemon sweeps the store and REAPS expired
// leases (recovery), and a new owner supersedes a stale one via a monotonically
// higher fencing token (so a zombie process cannot keep acting). All times are
// passed in (epoch ms) so callers — and tests — control the clock; the lease
// stores ISO strings for human-readable audit, consistent with the journal.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SessionLease } from "../contracts/session-lease.ts";

/** Thrown when a caller's fencing token is stale — it has been superseded. */
export class FencedError extends Error {
  constructor(public readonly sessionId: string) {
    super(`session lease fenced (superseded by a newer owner): ${sessionId}`);
    this.name = "FencedError";
  }
}

/** Thrown when acquiring a session a different, still-live owner holds. */
export class SessionContendedError extends Error {
  constructor(public readonly sessionId: string) {
    super(`session is owned by a live lease: ${sessionId}`);
    this.name = "SessionContendedError";
  }
}

export interface SessionStore {
  get(sessionId: string): SessionLease | undefined;
  list(): SessionLease[];
  /** Take (or supersede) ownership; bumps the fencing token. Throws if a
   *  different owner holds a still-live (unexpired, active) lease. */
  acquire(sessionId: string, ownerInstanceId: string, nowMs: number, ttlMs: number): SessionLease;
  /** Refresh the lease's heartbeat/expiry. Throws FencedError if superseded. */
  heartbeat(lease: SessionLease, nowMs: number, ttlMs: number): SessionLease;
  /** Mark the lease released (clean session end). No-op if already superseded. */
  release(lease: SessionLease, nowMs: number): void;
  /** Reap every active lease whose expiry has passed; returns the reaped leases. */
  reapExpired(nowMs: number): SessionLease[];
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** Shared lease algebra over a record snapshot; subclasses supply load/store. */
abstract class BaseSessionStore implements SessionStore {
  protected abstract load(): Record<string, SessionLease>;
  protected abstract commit(rec: Record<string, SessionLease>): void;

  get(sessionId: string): SessionLease | undefined {
    return this.load()[sessionId];
  }

  list(): SessionLease[] {
    return Object.values(this.load());
  }

  acquire(sessionId: string, ownerInstanceId: string, nowMs: number, ttlMs: number): SessionLease {
    const rec = this.load();
    const existing = rec[sessionId];
    if (
      existing &&
      existing.status === "active" &&
      existing.ownerInstanceId !== ownerInstanceId &&
      Date.parse(existing.expiresAt) > nowMs
    ) {
      // A different owner still holds a live lease — refuse (fencing protects it).
      throw new SessionContendedError(sessionId);
    }
    const lease = SessionLease.parse({
      sessionId,
      ownerInstanceId,
      fencingToken: (existing?.fencingToken ?? 0) + 1,
      heartbeatAt: iso(nowMs),
      expiresAt: iso(nowMs + ttlMs),
      status: "active",
    });
    rec[sessionId] = lease;
    this.commit(rec);
    return lease;
  }

  heartbeat(lease: SessionLease, nowMs: number, ttlMs: number): SessionLease {
    const rec = this.load();
    const stored = rec[lease.sessionId];
    // Fail-closed: gone, superseded by a higher token, or no longer active.
    if (!stored || stored.fencingToken > lease.fencingToken || stored.status !== "active") {
      throw new FencedError(lease.sessionId);
    }
    const next = SessionLease.parse({ ...stored, heartbeatAt: iso(nowMs), expiresAt: iso(nowMs + ttlMs) });
    rec[lease.sessionId] = next;
    this.commit(rec);
    return next;
  }

  release(lease: SessionLease, _nowMs: number): void {
    const rec = this.load();
    const stored = rec[lease.sessionId];
    // Only the current owner may release; releasing a superseded lease is a no-op.
    if (stored && stored.fencingToken === lease.fencingToken && stored.status === "active") {
      rec[lease.sessionId] = SessionLease.parse({ ...stored, status: "released" });
      this.commit(rec);
    }
  }

  reapExpired(nowMs: number): SessionLease[] {
    const rec = this.load();
    const reaped: SessionLease[] = [];
    for (const [sid, lease] of Object.entries(rec)) {
      if (lease.status === "active" && Date.parse(lease.expiresAt) <= nowMs) {
        const r = SessionLease.parse({ ...lease, status: "reaped" });
        rec[sid] = r;
        reaped.push(r);
      }
    }
    if (reaped.length > 0) this.commit(rec);
    return reaped;
  }
}

/** In-memory store (reference + tests). */
export class InMemorySessionStore extends BaseSessionStore {
  private rec: Record<string, SessionLease> = {};
  protected load(): Record<string, SessionLease> {
    return { ...this.rec }; // shallow copy; entries are always replaced, never mutated
  }
  protected commit(rec: Record<string, SessionLease>): void {
    this.rec = rec;
  }
}

/** File-backed store (production). A small JSON map at $AGP_HOME/sessions.json;
 *  read-modify-write per op — fine for the single-operator, low-rate v0+ path. */
export class FileSessionStore extends BaseSessionStore {
  constructor(private readonly path: string) {
    super();
  }
  protected load(): Record<string, SessionLease> {
    if (!existsSync(this.path)) return {};
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Record<string, unknown>;
      const out: Record<string, SessionLease> = {};
      for (const [k, v] of Object.entries(raw)) out[k] = SessionLease.parse(v);
      return out;
    } catch {
      // A corrupt/partial store must not crash the daemon; treat as empty and
      // let the next commit rewrite it. Recovery still runs against {} (no-op).
      return {};
    }
  }
  protected commit(rec: Record<string, SessionLease>): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(rec, null, 2)}\n`);
  }
}
