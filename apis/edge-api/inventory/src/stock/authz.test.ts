import { describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@effy/edge-shared", () => ({ query: (...a: unknown[]) => queryMock(...a) }));

const { authorizeShopMember, shopIsActive } = await import("./authz");

function sql(): string {
  return String(queryMock.mock.calls.at(-1)?.[0] ?? "");
}

describe("the shop stock gate", () => {
  it("⚠ is ROLE-AGNOSTIC — both shop roles manage stock (FR-010, A7)", async () => {
    queryMock.mockResolvedValue({ rows: [{ shop_id: "shop-1" }] });
    await authorizeShopMember("sub");

    // ⚠ THIS IS THE TEST THAT CATCHES THE WRONG GATE BEING WIRED, and it exists because the task
    // that specified this file originally said "role AND status AND shop scope" — which describes
    // `authorizeShopManager`, the OTHER helper. Building that would have refused every
    // `shop_staff` member, silently violating FR-010, and no other test in this service would have
    // noticed: the shape of the response is identical either way.
    //
    // 020's FR-019a settled this for the shop audience: both roles have the same access, and the
    // append-only record is the accountability control instead of a role gate. Counting a shelf is
    // the work of whoever is standing at it.
    expect(sql()).not.toMatch(/shop_role|role_key|shop_manager|shop_staff_role/i);
  });

  it("requires the STAFF member to be active", async () => {
    expect(sql()).toContain("ss.status");
  });

  it("requires the SHOP to be active", async () => {
    // Both terms drop out of the same JOIN, so "unassigned" and "inactive shop" are one refusal.
    expect(sql()).toContain("st.status");
    expect(sql()).toContain("JOIN public.shop");
  });

  it("returns null — the uniform deny — when nothing matches", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(authorizeShopMember("nobody")).resolves.toBeNull();
  });

  it("never takes the shop from client input: it RETURNS the id the caller must be scoped to", async () => {
    queryMock.mockResolvedValue({ rows: [{ shop_id: "shop-7" }] });
    await expect(authorizeShopMember("sub")).resolves.toBe("shop-7");
    // One round trip resolves the shop AND authorizes, so there is no window in which one has been
    // decided and the other has not.
    expect(queryMock.mock.calls.at(-1)?.[1]).toEqual(["sub"]);
  });

  it("fails CLOSED — a gate that cannot be evaluated throws rather than allowing", async () => {
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
