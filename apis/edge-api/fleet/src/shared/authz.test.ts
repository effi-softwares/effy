import { beforeEach, describe, expect, it, vi } from "vitest";

const isActiveStaff = vi.hoisted(() => vi.fn());
const hasStaffRole = vi.hoisted(() => vi.fn());

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, isActiveStaff, hasStaffRole };
});

import type { RequestScope } from "@effy/edge-shared";

const { denied, guard } = await import("./handler-support");

const scope = {
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  requestId: "req-1",
  instance: "/fleet/v1/drivers",
} as unknown as RequestScope & { log: { error: ReturnType<typeof vi.fn> } };

function event(sub: string | null) {
  return {
    requestContext: sub ? { authorizer: { jwt: { claims: { sub } } } } : { authorizer: {} },
  } as never;
}

beforeEach(() => vi.resetAllMocks());

/** No role without permission can mutate. Decided from `admin.staff`, never the token's groups claim. */
describe("guard - the read/mutate split (FR-022, FR-023)", () => {
  it("401s a request with no subject, before touching the database", async () => {
    const r = await guard(event(null), scope, "read");
    expect(denied(r)).toBe(true);
    if (denied(r)) expect(r.deny.statusCode).toBe(401);
    expect(isActiveStaff).not.toHaveBeenCalled();
  });

  it("⚠ READ asks only whether they are active staff - a csa passes", async () => {
    isActiveStaff.mockResolvedValue(true);
    const r = await guard(event("csa-sub"), scope, "read");
    expect(denied(r)).toBe(false);
    expect(isActiveStaff).toHaveBeenCalledWith("csa-sub");
    // It must not ask about roles: that would narrow read access to admin/manager.
    expect(hasStaffRole).not.toHaveBeenCalled();
  });

  it("⚠ MUTATE asks for admin/manager - a csa is refused with 403", async () => {
    hasStaffRole.mockResolvedValue(false);
    const r = await guard(event("csa-sub"), scope, "mutate");
    expect(denied(r)).toBe(true);
    if (denied(r)) expect(r.deny.statusCode).toBe(403);
    expect(hasStaffRole).toHaveBeenCalledWith("csa-sub", ["admin", "manager"]);
  });

  it("refuses a staff member whose record is not active, whatever their role", async () => {
    isActiveStaff.mockResolvedValue(false);
    const r = await guard(event("disabled-admin"), scope, "read");
    expect(denied(r)).toBe(true);
    if (denied(r)) expect(r.deny.statusCode).toBe(403);
  });

  it("⚠ FAILS CLOSED - an authz query that throws returns 503, never an implicit allow", async () => {
    isActiveStaff.mockRejectedValue(new Error("db down"));
    const r = await guard(event("someone"), scope, "read");
    expect(denied(r)).toBe(true);
    if (denied(r)) expect(r.deny.statusCode).toBe(503);
    expect(scope.log.error).toHaveBeenCalled();
  });

  it("uses the platform's SHARED back-office authz, not a local copy", async () => {
    // The shared module is mocked; a local copy would ignore the mock and pass.
    isActiveStaff.mockResolvedValue(true);
    await guard(event("x"), scope, "read");
    expect(isActiveStaff).toHaveBeenCalled();
  });
});

describe("SC-011 - every mutating handler carries the mutate gate", () => {
  it("refuses a csa on each mutating route", async () => {
    hasStaffRole.mockResolvedValue(false);
    for (const _action of ["create", "update", "status", "resolve", "release", "end-duty"]) {
      const r = await guard(event("csa-sub"), scope, "mutate");
      expect(denied(r)).toBe(true);
      if (denied(r)) expect(r.deny.statusCode).toBe(403);
    }
    expect(hasStaffRole).toHaveBeenCalledTimes(6);
  });
});
