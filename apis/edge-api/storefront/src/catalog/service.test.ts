import { describe, expect, it } from "vitest";

import type { AttrRow, CatalogRepository, DetailRow } from "./repository";
import { createCatalogService, formatAttrValue, groupAttributes } from "./service";

const ID = "00000000-0000-0000-0000-000000000001";

const attr = (over: Partial<AttrRow>): AttrRow => ({
  label: "L", data_type: "short_text", unit: null, value_text: null, value_number: null, value_boolean: null,
  value_options: null, group_label: "Details", ...over,
});

const detail = (over: Partial<DetailRow> = {}): DetailRow => ({
  id: ID, name: "Oat milk", brand: "Oatly", price_amount: "4.50", currency: "AUD", compare_at_amount: null,
  short_description: "Short", long_description: null, primary_category_id: "cat-1", primary_category_key: "dairy",
  is_new: false, available: true, ...over,
});

function repo(over: Partial<CatalogRepository> = {}) {
  const calls: string[] = [];
  const r: CatalogRepository = {
    categories: async () => [],
    productDetail: async (id) => (calls.push(`detail:${id}`), detail()),
    productMedia: async () => [],
    productAttributes: async () => [],
    categoryPath: async () => ["Food", "Dairy"],
    ...over,
  };
  return { svc: createCatalogService(r, async (k) => (k ? `signed:${k}` : null)), calls };
}

describe("formatAttrValue", () => {
  it.each([
    [attr({ data_type: "boolean", value_boolean: true }), "Yes"],
    [attr({ data_type: "boolean", value_boolean: false }), "No"],
    [attr({ data_type: "boolean" }), ""],
    [attr({ data_type: "number", value_number: "500", unit: "g" }), "500 g"],
    [attr({ data_type: "number", value_number: "2" }), "2"],
    [attr({ data_type: "number" }), ""],
    [attr({ data_type: "multi_select", value_options: ["vegan", "", "halal"] }), "vegan, halal"],
    [attr({ data_type: "single_select", value_text: "Large" }), "Large"],
    [attr({ data_type: "short_text", value_options: ["a", "b"] }), "a, b"],
    [attr({ data_type: "short_text" }), ""],
  ])("%#", (row, want) => {
    expect(formatAttrValue(row)).toBe(want);
  });
});

describe("groupAttributes", () => {
  it("groups contiguous rows by label and drops empty values", () => {
    expect(
      groupAttributes([
        attr({ label: "Weight", data_type: "number", value_number: "500", unit: "g", group_label: "Details" }),
        attr({ label: "Empty", group_label: "Details" }),
        attr({ label: "Organic", data_type: "boolean", value_boolean: true, group_label: "Dietary" }),
        attr({ label: "Vegan", data_type: "boolean", value_boolean: false, group_label: "Dietary" }),
      ]),
    ).toEqual([
      { groupLabel: "Details", items: [{ label: "Weight", value: "500 g" }] },
      { groupLabel: "Dietary", items: [{ label: "Organic", value: "Yes" }, { label: "Vegan", value: "No" }] },
    ]);
  });
  it("no attributes is []", () => {
    expect(groupAttributes([])).toEqual([]);
  });
});

describe("productDetail", () => {
  it("composes the page: card fields, gallery, attributes, path and the category key", async () => {
    const { svc } = repo({
      productMedia: async () => [{ storage_key: "a.jpg", alt_text: "Front" }, { storage_key: "b.jpg", alt_text: null }],
      productAttributes: async () => [attr({ label: "Size", data_type: "single_select", value_text: "1L" })],
    });
    expect(await svc.productDetail(ID)).toEqual({
      id: ID, name: "Oat milk", brand: "Oatly", imageUrl: "signed:a.jpg", priceAmount: "4.50", currency: "AUD",
      compareAtAmount: null, badges: [], available: true, longDescription: "Short",
      gallery: [{ imageUrl: "signed:a.jpg", alt: "Front" }, { imageUrl: "signed:b.jpg", alt: null }],
      attributes: [{ groupLabel: "Details", items: [{ label: "Size", value: "1L" }] }],
      categoryPath: ["Food", "Dairy"], categoryKey: "dairy",
    });
  });

  it("prefers the long description; falls back to the short one when it is null or empty", async () => {
    expect((await repo({ productDetail: async () => detail({ long_description: "Long" }) }).svc.productDetail(ID))?.longDescription).toBe("Long");
    expect((await repo({ productDetail: async () => detail({ long_description: "" }) }).svc.productDetail(ID))?.longDescription).toBe("Short");
  });

  it("badges come from the row: on_sale then new", async () => {
    const d = await repo({ productDetail: async () => detail({ compare_at_amount: "6.00", is_new: true }) }).svc.productDetail(ID);
    expect(d?.badges).toEqual(["on_sale", "new"]);
  });

  it("renders an out-of-stock product and says so — the page does not 404", async () => {
    expect((await repo({ productDetail: async () => detail({ available: false }) }).svc.productDetail(ID))?.available).toBe(false);
  });

  it("no gallery → null image and [] — a missing image never blanks the page", async () => {
    const d = await repo().svc.productDetail(ID);
    expect(d?.imageUrl).toBeNull();
    expect(d?.gallery).toEqual([]);
  });

  it("an unknown product is null", async () => {
    expect(await repo({ productDetail: async () => null }).svc.productDetail(ID)).toBeNull();
  });

  it.each(["", "abc", "123", "00000000-0000-0000-0000-00000000000", "'; DROP TABLE product; --"])(
    "a malformed id (%j) is NOT FOUND without asking the database — not an outage",
    async (id) => {
      const { svc, calls } = repo();
      expect(await svc.productDetail(id)).toBeNull();
      expect(calls).toEqual([]);
    },
  );
});

describe("categories", () => {
  it("maps the tree with counts and a presigned or null image", async () => {
    const { svc } = repo({
      categories: async () => [
        { key: "dairy", name: "Dairy", parent_key: null, product_count: 3, image_key: "c.jpg" },
        { key: "milk", name: "Milk", parent_key: "dairy", product_count: 0, image_key: null },
      ],
    });
    expect(await svc.categories()).toEqual([
      { key: "dairy", name: "Dairy", parentKey: null, productCount: 3, imageUrl: "signed:c.jpg" },
      { key: "milk", name: "Milk", parentKey: "dairy", productCount: 0, imageUrl: null },
    ]);
  });
});
