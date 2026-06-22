import { test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SINGLE_TENANT, TenantContext, assertTenantContext, defaultTenantContext } from "./tenant.ts";

test("SINGLE_TENANT sentinel is frozen", () => {
  expect(SINGLE_TENANT).toBe("v0-single-operator");
});

test("defaultTenantContext returns the v0 singleton", () => {
  expect(defaultTenantContext()).toEqual({ tenantId: SINGLE_TENANT });
});

test("assertTenantContext passes for the sentinel", () => {
  expect(() => assertTenantContext({ tenantId: SINGLE_TENANT })).not.toThrow();
});

test("assertTenantContext fails closed for any other tenant", () => {
  expect(() => assertTenantContext({ tenantId: "acme" as unknown as typeof SINGLE_TENANT })).toThrow(/\[FAIL-CLOSED\]/);
});

test("TenantContext schema accepts the sentinel and rejects any other tenantId", () => {
  expect(TenantContext.safeParse({ tenantId: SINGLE_TENANT }).success).toBe(true);
  expect(TenantContext.safeParse({ tenantId: "acme" }).success).toBe(false);
});

// Static guard (frozen-actor pattern, via node:fs so it needs no external tool in
// CI): NO multi-tenant enablement toggle may appear anywhere in src/. This file
// lists the forbidden tokens to forbid them, so it excludes itself. Any real match
// fails the suite → CI + the L1 pre-commit hook. (047-AT-ADR: reserve, do not enable.)
const TOGGLE = /ENABLE_MULTI_TENANT|enableMultiTenant|ENABLE_HOSTED|isMultiTenant|isHosted/;

test("static guard: no multi-tenant enablement toggle in src/", () => {
  const srcRoot = join(import.meta.dir, ".."); // src/tenants -> src
  const self = import.meta.path;
  const offenders: string[] = [];
  for (const rel of readdirSync(srcRoot, { recursive: true }) as string[]) {
    if (!rel.endsWith(".ts")) continue;
    const abs = join(srcRoot, rel);
    if (abs === self) continue;
    if (TOGGLE.test(readFileSync(abs, "utf8"))) offenders.push(rel);
  }
  expect(offenders).toEqual([]);
});
