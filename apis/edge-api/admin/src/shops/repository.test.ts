import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (orig) => ({ ...(await orig<typeof import("@effy/edge-shared")>()), query, withTransaction }));

import { parseListQuery } from "@effy/edge-shared";

import { deleteShop, getShopUserForUpdate, listShops } from "./repository";
import { SHOP_LIST_SPEC } from "./list";
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
        { id: "1", code: "CMB-01", name: "Colombo 01", status: "active", user_count: "3", full_count: "1" },
      ],
    });
    const page = await listShops(parseListQuery({ q: "cmb_", sort: "name", dir: "desc", status: "active" }, SHOP_LIST_SPEC));
    expect(page.total).toBe(1);
    const [sql, args] = query.mock.calls[0]!;
    // Whitelisted sort with the id tie-break; the search's wildcard is taken literally.
    expect(sql).toContain("ORDER BY lower(s.name) DESC, s.id DESC");
    expect(args).toEqual(["active", "%cmb\\_%", 30, 25, 0]);
    expect(page.items[0]).toEqual({
      id: "1",
      code: "CMB-01",
      name: "Colombo 01",
      hasAddress: undefined,
      labelScanning: { scanned: 0, notScanned: 0, sinceDays: 30 },
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
