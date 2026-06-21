// OutboxStore — durable storage of channel-projection obligations (agp-4na.3).
// Design + rationale: 000-docs/042-AT-ADR-transactional-outbox-channel-delivery.md.
//
// A failed best-effort projection records an obligation here; the OutboxRelay's
// poller redelivers pending obligations, including after a daemon restart
// (FileOutboxStore persists to $AGP_HOME/outbox.json). The signed journal stays
// authoritative — this only keeps a projection from being silently dropped.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { OutboxDelivery } from "../contracts/outbox-delivery.ts";

export interface OutboxStore {
  get(id: string): OutboxDelivery | undefined;
  list(): OutboxDelivery[];
  /** Record a new (pending) delivery obligation. Idempotent on `id`. */
  enqueue(delivery: OutboxDelivery): void;
  /** Every obligation not yet delivered, in enqueue order. */
  pending(): OutboxDelivery[];
  /** Bump the attempt counter (call before each delivery attempt). */
  recordAttempt(id: string): void;
  /** Mark an obligation delivered (terminal). No-op if unknown. */
  markDelivered(id: string, atIso: string): void;
}

/** Shared algebra over a record snapshot; subclasses supply load/commit. */
abstract class BaseOutboxStore implements OutboxStore {
  protected abstract load(): Record<string, OutboxDelivery>;
  protected abstract commit(rec: Record<string, OutboxDelivery>): void;

  get(id: string): OutboxDelivery | undefined {
    return this.load()[id];
  }

  list(): OutboxDelivery[] {
    return Object.values(this.load());
  }

  enqueue(delivery: OutboxDelivery): void {
    const rec = this.load();
    if (rec[delivery.id]) return; // idempotent: a redelivery never re-enqueues
    rec[delivery.id] = OutboxDelivery.parse(delivery);
    this.commit(rec);
  }

  pending(): OutboxDelivery[] {
    return Object.values(this.load()).filter((d) => d.status === "pending");
  }

  recordAttempt(id: string): void {
    const rec = this.load();
    const d = rec[id];
    if (!d) return;
    rec[id] = OutboxDelivery.parse({ ...d, attempts: d.attempts + 1 });
    this.commit(rec);
  }

  markDelivered(id: string, atIso: string): void {
    const rec = this.load();
    const d = rec[id];
    if (!d) return;
    rec[id] = OutboxDelivery.parse({ ...d, status: "delivered", deliveredAt: atIso });
    this.commit(rec);
  }
}

/** In-memory store (reference + tests). */
export class InMemoryOutboxStore extends BaseOutboxStore {
  private rec: Record<string, OutboxDelivery> = {};
  protected load(): Record<string, OutboxDelivery> {
    return { ...this.rec }; // shallow copy; entries are always replaced, never mutated
  }
  protected commit(rec: Record<string, OutboxDelivery>): void {
    this.rec = rec;
  }
}

/** File-backed store (production): a JSON map at $AGP_HOME/outbox.json. */
export class FileOutboxStore extends BaseOutboxStore {
  constructor(private readonly path: string) {
    super();
  }
  protected load(): Record<string, OutboxDelivery> {
    if (!existsSync(this.path)) return {};
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Record<string, unknown>;
      const out: Record<string, OutboxDelivery> = {};
      for (const [k, v] of Object.entries(raw)) out[k] = OutboxDelivery.parse(v);
      return out;
    } catch {
      // A corrupt/partial file must not crash the daemon; treat as empty.
      return {};
    }
  }
  protected commit(rec: Record<string, OutboxDelivery>): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(rec, null, 2)}\n`);
  }
}
