import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", () => ({ query }));

import { authorizeShopMember } from "./authz";

const sql = () => (query.mock.calls[0]?.[0] as string).replace(/\s+/g, " ");

describe("authorizeShopMember (catalog CRUD: active membership at an active shop, ANY role)", () => {
  beforeEach(() => query.mockReset());

  it("resolves the actor's shop_id when active member at an active shop", async () => {
    query.mockResolvedValue({ rows: [{ shop_id: "shop-1" }] });
    expect(await authorizeShopMember("sub-1")).toBe("shop-1");
  });

  it("gates on active staff AND active shop, with NO role requirement", async () => {
    query.mockResolvedValue({ rows: [{ shop_id: "shop-1" }] });
    await authorizeShopMember("sub-1");
    expect(sql()).toContain("ss.status = 'active'");
    expect(sql()).toContain("st.status = 'active'");
    // any role — the query never consults shop_staff_role.
    expect(sql()).not.toContain("role_key");
    expect(sql()).not.toContain("shop_staff_role");
  });

  it("denies (null) when no row — unassigned / inactive shop / not a member all fail-closed", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await authorizeShopMember("sub-1")).toBeNull();
  });
});
