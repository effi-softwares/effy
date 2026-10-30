import { describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@effy/edge-shared", () => ({ query: (...a: unknown[]) => queryMock(...a) }));

const { authorizeShopMember, shopIsActive } = await import("./authz");

function sql(): string {
  return String(queryMock.mock.calls.at(-1)?.[0] ?? "");
}

describe("the shop stock gate", () => {
  it("⚠ is ROLE-AGNOSTIC - both shop roles manage stock (FR-010, A7)", async () => {
    queryMock.mockResolvedValue({ rows: [{ shop_id: "shop-1" }] });
    await authorizeShopMember("sub");

    // Both shop roles manage stock: the gate is membership, not `authorizeShopManager`.
    expect(sql()).not.toMatch(/shop_role|role_key|shop_manager|shop_staff_role/i);
  });

  it("requires the STAFF member to be active", async () => {
    expect(sql()).toContain("ss.status");
  });

  it("requires the SHOP to be active", async () => {
    // Both drop out of the same join, so "unassigned" and "inactive shop" are one refusal.
    expect(sql()).toContain("st.status");
    expect(sql()).toContain("JOIN public.shop");
  });

  it("returns null - the uniform deny - when nothing matches", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(authorizeShopMember("nobody")).resolves.toBeNull();
  });

  it("never takes the shop from client input: it RETURNS the id the caller must be scoped to", async () => {
    queryMock.mockResolvedValue({ rows: [{ shop_id: "shop-7" }] });
    await expect(authorizeShopMember("sub")).resolves.toBe("shop-7");
    // One round trip resolves the shop and authorizes.
    expect(queryMock.mock.calls.at(-1)?.[1]).toEqual(["sub"]);
  });

  it("fails CLOSED - a gate that cannot be evaluated throws rather than allowing", async () => {
    queryMock.mockRejectedValue(new Error("database is down"));
    await expect(authorizeShopMember("sub")).rejects.toThrow();
  });
});

describe("the back-office shop lookup", () => {
  it("only accepts an active shop", async () => {
    queryMock.mockResolvedValue({ rows: [{ ok: true }] });
    await expect(shopIsActive("shop-1")).resolves.toBe(true);
    expect(sql()).toContain("status = 'active'");
  });

  it("is false, not throwing, for a shop that is not active", async () => {
    queryMock.mockResolvedValue({ rows: [{ ok: false }] });
    await expect(shopIsActive("shop-1")).resolves.toBe(false);
  });
});
