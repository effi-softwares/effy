import { describe, expect, it, vi } from "vitest";

import { CartFullError, ProductNotFoundError as CartNotFound, ProductUnavailableError } from "../cart/service";
import { itemChangeId } from "./change-id";
import { InvalidListNameError, ListNameTakenError } from "./list-name";
import {
  DefaultListError, ListNotFoundError, ProductNotFoundError,
  type ListRow, type ListSummaryRow, type MergeItem, type SavedRepository,
} from "./repository";
import { ACCOUNT_CAP, createSavedService } from "./service";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const CUST = "cust-1";

const row = (n: number, over: Partial<ListRow> = {}): ListRow => ({
  product_id: id(n), name: `P${n}`, brand: null, price_amount: "4.50", currency: "AUD", compare_at_amount: null,
  storage_key: null, saved_at: new Date("2026-10-01T02:03:04.567Z"), saved_price_amount: "4.50", category_key: null,
  is_new: false, price_dropped: false, verdict: "purchasable", ...over,
});

const summary = (over: Partial<ListSummaryRow>): ListSummaryRow => ({ id: id(900), is_default: false, name: "Weekly", count: 0, only_here: 0, contains: false, ...over });

function build(over: Partial<SavedRepository> = {}, addToCart = vi.fn(async () => undefined)) {
  const repo: SavedRepository = {
    membershipIds: async () => [],
    namedProductIds: async () => [],
    list: async () => [],
    remove: vi.fn(async () => undefined),
    merge: vi.fn(async () => ({ added: 0, skipped: [], productIds: [] })),
    lists: async () => [],
    createList: vi.fn(async () => id(900)),
    renameList: vi.fn(async () => undefined),
    deleteList: vi.fn(async () => undefined),
    addEntry: vi.fn(async () => undefined),
    removeEntry: vi.fn(async () => undefined),
    ...over,
  };
  return { svc: createSavedService({ repo, addToCart, presign: async (k) => (k ? `signed:${k}` : null) }), repo, addToCart };
}

describe("membership", () => {
  it("nothing saved is fully shaped and costs one read", async () => {
    const named = vi.fn(async () => ["x"]);
    const { svc } = build({ namedProductIds: named });
    expect(await svc.membership(CUST)).toEqual({ productIds: [], count: 0, namedProductIds: [] });
    expect(named).not.toHaveBeenCalled();
  });

  it("carries the subset held in a named list", async () => {
    const { svc } = build({ membershipIds: async () => [id(1), id(2)], namedProductIds: async () => [id(2)] });
    expect(await svc.membership(CUST)).toEqual({ productIds: [id(1), id(2)], count: 2, namedProductIds: [id(2)] });
  });
});

describe("list", () => {
  it("maps an item; OMITS priceDropped and categoryKey when there is nothing to say", async () => {
    const { svc } = build({ list: async () => [row(1)] });
    const [item] = await svc.list(CUST, "default");
    expect(item).toEqual({
      id: id(1), name: "P1", brand: null, imageUrl: null, priceAmount: "4.50", currency: "AUD", compareAtAmount: null,
      badges: [], savedAt: "2026-10-01T02:03:04Z", savedPriceAmount: "4.50", verdict: "purchasable",
    });
    expect(item).not.toHaveProperty("priceDropped");
    expect(item).not.toHaveProperty("categoryKey");
  });

  it("carries a drop, a category, badges, an image and the verdict the query decided", async () => {
    const { svc } = build({
      list: async () => [row(1, { price_dropped: true, category_key: "dairy", compare_at_amount: "6.00", is_new: true, storage_key: "a.jpg", verdict: "no_longer_sold" })],
    });
    expect((await svc.list(CUST, "default"))[0]).toMatchObject({
      priceDropped: true, categoryKey: "dairy", badges: ["on_sale", "new"], imageUrl: "signed:a.jpg", verdict: "no_longer_sold",
    });
  });

  it("the timestamp is RFC 3339 at second precision", async () => {
    const { svc } = build({ list: async () => [row(1)] });
    expect((await svc.list(CUST, "default"))[0]?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe("save / remove", () => {
  it("save puts the product in the default list, at the account cap", async () => {
    const { svc, repo } = build();
    await svc.save(CUST, id(1), null);
    expect(repo.addEntry).toHaveBeenCalledWith(CUST, "default", id(1), null, ACCOUNT_CAP);
    expect(ACCOUNT_CAP).toBe(200);
  });

  it("a malformed id names no product: not found on save, a silent no-op on remove", async () => {
    const { svc, repo } = build();
    await expect(svc.save(CUST, "nope", null)).rejects.toBeInstanceOf(ProductNotFoundError);
    await expect(svc.remove(CUST, "nope")).resolves.toBeUndefined();
    expect(repo.remove).not.toHaveBeenCalled();
  });
});

describe("merge", () => {
  it("hands the repository the NEWEST first, keeping the device's order for ties", async () => {
    const { svc, repo } = build();
    const at = (s: string) => new Date(s);
    const items: MergeItem[] = [
      { productId: "old", savedPriceAmount: null, savedCurrency: null, savedAt: at("2026-01-01T00:00:00Z") },
      { productId: "tie-1", savedPriceAmount: null, savedCurrency: null, savedAt: at("2026-06-01T00:00:00Z") },
      { productId: "new", savedPriceAmount: null, savedCurrency: null, savedAt: at("2026-09-01T00:00:00Z") },
      { productId: "tie-2", savedPriceAmount: null, savedCurrency: null, savedAt: at("2026-06-01T00:00:00Z") },
    ];
    await svc.merge(CUST, items);
    expect((vi.mocked(repo.merge).mock.calls[0]![1] as MergeItem[]).map((i) => i.productId)).toEqual(["new", "tie-1", "tie-2", "old"]);
    expect(items[0]?.productId).toBe("old"); // the caller's array is not reordered
  });
});

describe("add a whole list to the cart", () => {
  it("adds each purchasable item once, with a distinct change id derived from the request's", async () => {
    const { svc, addToCart } = build({ list: async () => [row(1), row(2)] });
    expect(await svc.addAllToCart(CUST, "default", "batch-1")).toEqual({ added: [id(1), id(2)], skipped: [] });
    expect(addToCart.mock.calls).toEqual([
      [CUST, id(1), itemChangeId("batch-1", id(1)), 1],
      [CUST, id(2), itemChangeId("batch-1", id(2)), 1],
    ]);
  });

  it("skips what cannot be bought, giving the SAME reason the list shows", async () => {
    const { svc, addToCart } = build({
      list: async () => [row(1, { verdict: "temporarily_unavailable" }), row(2, { verdict: "no_longer_sold" }), row(3)],
    });
    expect(await svc.addAllToCart(CUST, "default", "b")).toEqual({
      added: [id(3)],
      skipped: [{ productId: id(1), reason: "temporarily_unavailable" }, { productId: id(2), reason: "no_longer_sold" }],
    });
    expect(addToCart).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new CartFullError(), "cart_full"],
    [new ProductUnavailableError(), "temporarily_unavailable"],
    [new CartNotFound(), "not_found"],
    [new Error("boom"), "unavailable"],
  ])("carries the cart's own refusal through, and keeps going", async (err, reason) => {
    const add = vi.fn(async (_c: string, productId: string) => {
      if (productId === id(1)) throw err;
    });
    const { svc } = build({ list: async () => [row(1), row(2)] }, add as never);
    expect(await svc.addAllToCart(CUST, "default", "b")).toEqual({ added: [id(2)], skipped: [{ productId: id(1), reason }] });
  });

  it("an empty list is { added: [], skipped: [] }", async () => {
    expect(await build().svc.addAllToCart(CUST, "default", "")).toEqual({ added: [], skipped: [] });
  });

  it("an unknown list propagates as not found", async () => {
    const { svc } = build({ list: async () => { throw new ListNotFoundError(); } });
    await expect(svc.addAllToCart(CUST, id(5), "b")).rejects.toBeInstanceOf(ListNotFoundError);
  });
});

describe("lists", () => {
  it("synthesises the default list when the shopper has none — a read never writes", async () => {
    const { svc } = build();
    expect(await svc.lists(CUST, null)).toEqual([{ id: "default", isDefault: true, name: null, count: 0, onlyHereCount: 0 }]);
  });

  it("puts the default first under the id 'default' — its real id never reaches the wire", async () => {
    const real = "0d000000-0000-0000-0000-000000000000";
    const { svc } = build({
      lists: async () => [summary({ id: real, is_default: true, name: null, count: 3, only_here: 1 }), summary({ count: 2, only_here: 2 })],
    });
    const out = await svc.lists(CUST, null);
    expect(out.map((l) => l.id)).toEqual(["default", id(900)]);
    expect(JSON.stringify(out)).not.toContain(real);
    expect(out[1]).toEqual({ id: id(900), isDefault: false, name: "Weekly", count: 2, onlyHereCount: 2 });
  });

  it("adds a synthetic default ahead of named lists when only named lists exist", async () => {
    const { svc } = build({ lists: async () => [summary({})] });
    expect((await svc.lists(CUST, null)).map((l) => l.id)).toEqual(["default", id(900)]);
  });

  it("containsProduct appears ONLY when a product was named", async () => {
    const { svc } = build({ lists: async () => [summary({ contains: true })] });
    expect((await svc.lists(CUST, null))[1]).not.toHaveProperty("containsProduct");
    const withProduct = await svc.lists(CUST, id(1));
    expect(withProduct.map((l) => l.containsProduct)).toEqual([false, true]);
  });

  it("create normalises the name, then returns the list as it now stands", async () => {
    const { svc, repo } = build({ lists: async () => [summary({ name: "Weekly Items", count: 1 })] });
    expect(await svc.createList(CUST, "  Weekly   Items ", id(1))).toMatchObject({ id: id(900), name: "Weekly Items", count: 1 });
    expect(repo.createList).toHaveBeenCalledWith(CUST, "Weekly Items", id(1), 20, ACCOUNT_CAP);
  });

  it("create refuses a bad name or a taken one before touching the database", async () => {
    const { svc, repo } = build();
    await expect(svc.createList(CUST, "   ", null)).rejects.toBeInstanceOf(InvalidListNameError);
    await expect(svc.createList(CUST, "saved", null)).rejects.toBeInstanceOf(ListNameTakenError);
    await expect(svc.createList(CUST, "Fine", "nope")).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(repo.createList).not.toHaveBeenCalled();
  });

  it("renaming the default is refused BEFORE the name is judged", async () => {
    const { svc } = build();
    await expect(svc.renameList(CUST, "default", "")).rejects.toBeInstanceOf(DefaultListError);
  });

  it("a list deleted on another device between the rename and the read back is not found", async () => {
    const { svc } = build({ lists: async () => [] });
    await expect(svc.renameList(CUST, id(900), "New name")).rejects.toBeInstanceOf(ListNotFoundError);
  });

  it("entry writes: a malformed product is not found on add and a no-op on remove", async () => {
    const { svc, repo } = build();
    await expect(svc.addEntry(CUST, id(900), "nope", null)).rejects.toBeInstanceOf(ProductNotFoundError);
    await svc.removeEntry(CUST, id(900), "nope");
    expect(repo.removeEntry).not.toHaveBeenCalled();
  });
});
