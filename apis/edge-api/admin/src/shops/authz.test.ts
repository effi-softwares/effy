import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", () => ({ query }));

import { canManageShops, isActiveStaff } from "./authz";

const sql = () => (query.mock.calls[0]?.[0] as string).replace(/\s+/g, " ");

describe("shop-management authz (from the admin.staff record, R6)", () => {
  beforeEach(() => query.mockReset());

  it("isActiveStaff gates on active status with no role requirement (read = any role incl csa)", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    expect(await isActiveStaff("sub-1")).toBe(true);
    expect(sql()).toContain("s.status = 'active'");
    expect(sql()).not.toContain("role_key");
  });

  it("canManageShops requires active AND admin/manager (mutate)", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    expect(await canManageShops("sub-1")).toBe(true);
    expect(sql()).toContain("s.status = 'active'");
    expect(sql()).toContain("role_key IN ('admin', 'manager')");
  });

  it("denies when no row (absent = deny, fail-closed)", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await canManageShops("sub-1")).toBe(false);
  });
});
