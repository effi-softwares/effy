import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", () => ({ query, withTransaction }));

import { deleteShop, getShopUserForUpdate, listShops } from "./repository";
import { isShopError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isShopError(e) ? e.kind : "other";
  }
}

describe("repository reads", () => {
  beforeEach(() => {
    query.mockReset();
    withTransaction.mockReset();
  });

  it("listShops maps rows and reads the window total", async () => {
    query.mockResolvedValue({
      rows: [
        { id: "1", code: "CMB-01", name: "Colombo 01", status: "active", user_count: "3", total: "1" },
      ],
    });
    const page = await listShops({ page: 1, pageSize: 20, status: null, q: null });
    expect(page.total).toBe(1);
    expect(page.items[0]).toEqual({
      id: "1",
      code: "CMB-01",
      name: "Colombo 01",
      status: "active",
      userCount: 3,
    });
  });

  it("getShopUserForUpdate refuses a user assigned to a different shop (no reassignment, A8)", async () => {
    query.mockResolvedValue({
      rows: [{ id: "u1", email: "a@b.c", shop_id: "other-shop", role_keys: ["shop_staff"] }],
    });
    expect(await kindOf(getShopUserForUpdate("shop-1", "u1"))).toBe("conflict");
  });

  it("getShopUserForUpdate 404s an unknown user", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await kindOf(getShopUserForUpdate("shop-1", "nope"))).toBe("not_found");
  });
});

describe("deleteShop guard", () => {
  beforeEach(() => {
    query.mockReset();
    withTransaction.mockReset();
  });

  it("refuses a shop that still has users (disable instead)", async () => {
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [{ n: "2" }] }) }),
    );
    expect(await kindOf(deleteShop("shop-1", "actor"))).toBe("conflict");
  });

  it("deletes a dependent-free shop", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ n: "0" }] }) // dependents count
        .mockResolvedValueOnce({ rows: [{ id: "shop-1" }] }) // delete returning
        .mockResolvedValueOnce({ rows: [] }), // audit insert
    };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    await expect(deleteShop("shop-1", "actor")).resolves.toBeUndefined();
  });
});
