// INTERNAL — unstable — no public RFC.
// Single-tenant lock for AGP v0 (agp-pne / 047-AT-ADR). Multi-tenant operation is
// v0.3+ and requires a future epic + security gates (per-tenant KMS, multi-tenant
// gate() rewrite, the confused-deputy fix). This module RESERVES the tenant model
// and FAILS CLOSED against any non-sentinel tenant — reserving, never enabling.
// Cannon-2 (004-AR-CANN): multi-tenancy is the whole isolation story; one missed
// check is a cross-tenant compromise — so v0 admits exactly one tenant.

import { z } from "zod";

/** The only allowed tenant id at v0 — the fail-closed sentinel. */
export const SINGLE_TENANT = "v0-single-operator" as const;
export type SingleTenant = typeof SINGLE_TENANT;

/** Operator tenant identity + scope. Degenerate at v0 (one operator, no isolation). */
export const TenantContext = z.object({
  tenantId: z.literal(SINGLE_TENANT),
  operatorName: z.string().optional(),
});
export type TenantContext = z.infer<typeof TenantContext>;

/**
 * Fail-closed guard: throws unless tenantId === SINGLE_TENANT. Called at every
 * governance entry point BEFORE any spawn/mediation. v0.3 will widen this to
 * validate real per-tenant invariants WITHOUT changing the call sites — the seam
 * is the point. It is NOT an isolation mechanism and makes no isolation claim; it
 * blocks ACCIDENTAL hosted-multi-tenant enablement on v0 code.
 */
export function assertTenantContext(ctx: TenantContext): void {
  if (ctx.tenantId !== SINGLE_TENANT) {
    throw new Error(
      `[FAIL-CLOSED] tenant context violation: tenantId must be "${SINGLE_TENANT}", got ` +
        `"${ctx.tenantId}". Hosted multi-tenant is locked until v0.3+ (047-AT-ADR) — a hosted ` +
        `deployment was attempted on v0 code, or config loading has a bug.`,
    );
  }
}

/** The v0 singleton context. Constructed once at daemon startup. */
export function defaultTenantContext(): TenantContext {
  return { tenantId: SINGLE_TENANT };
}
