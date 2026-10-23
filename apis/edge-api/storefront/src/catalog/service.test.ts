import { describe, expect, it } from "vitest";

import type { AttrRow, CatalogRepository, DetailRow, MediaRow, VariantPageRow } from "./repository";
import { createCatalogService, formatAttrValue, groupAttributes } from "./service";

const ID = "00000000-0000-0000-0000-000000000001";

const attr = (over: Partial<AttrRow>): AttrRow => ({
  label: "L", data_type: "short_text", unit: null, value_text: null, value_number: null, value_boolean: null,
  value_options: null, group_label: "Details", ...over,
});

const variantRow = (over: Partial<VariantPageRow> = {}): VariantPageRow => ({
  id: "v1", option1: null, option2: null, label: null, price_amount: "4.50", compare_at_amount: null,
  pack_quantity: null, pack_unit: null, available: true, storage_key: null, image_widths: null, ...over,
});

const detail = (over: Partial<DetailRow> = {}): DetailRow => ({
  id: ID, name: "Oat milk", brand: "Oatly", price_amount: "4.50", currency: "AUD", compare_at_amount: null,
  short_description: "Short", long_description: null, primary_category_id: "cat-1", primary_category_key: "dairy",
  is_new: false, available: true, unit_basis: null, ...over,
});

/** The page's parts, faked one by one; `productPage` is assembled from them as the statement would. */
interface Parts {
  categories: CatalogRepository["categories"];
  productDetail: (id: string) => Promise<DetailRow | null>;
  productMedia: () => Promise<MediaRow[]>;
  productAttributes: () => Promise<AttrRow[]>;
  categoryPath: () => Promise<string[]>;
  variants: () => Promise<VariantPageRow[]>;
}

function repo(over: Partial<Parts> = {}) {
  const calls: string[] = [];
  const parts: Parts = {
    categories: async () => [],
    productDetail: async () => detail(),
    productMedia: async () => [],
    productAttributes: async () => [],
    categoryPath: async () => ["Food", "Dairy"],
    variants: async () => [variantRow()],
    ...over,
  };
  const r: CatalogRepository = {
    categories: parts.categories,
    productPage: async (id) => {
      calls.push(`page:${id}`);
      const row = await parts.productDetail(id);
      return row && { ...row, media: await parts.productMedia(), attributes: await parts.productAttributes(), category_path: await parts.categoryPath(), variants: await parts.variants(), options: [] };
    },
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
      productMedia: async () => [{ storage_key: "a.jpg", alt_text: "Front", image_widths: [640, 160, 320] }, { storage_key: "b.jpg", alt_text: null, image_widths: null }],
      productAttributes: async () => [attr({ label: "Size", data_type: "single_select", value_text: "1L" })],
    });
    expect(await svc.productDetail(ID)).toEqual({
      id: ID, name: "Oat milk", brand: "Oatly", imageUrl: "signed:a.jpg", imageWidths: [160, 320, 640], priceAmount: "4.50", currency: "AUD",
      compareAtAmount: null, badges: [], available: true, longDescription: "Short",
      // Copies listed ascending; a picture with none carries no field.
      gallery: [{ imageUrl: "signed:a.jpg", imageWidths: [160, 320, 640], alt: "Front" }, { imageUrl: "signed:b.jpg", alt: null }],
      attributes: [{ groupLabel: "Details", items: [{ label: "Size", value: "1L" }] }],
      categoryPath: ["Food", "Dairy"], categoryKey: "dairy",
      priceVaries: false, variantId: "v1", variantCount: 1, unitPrice: null, options: [], unitBasis: null,
      variants: [{ id: "v1", optionValueIds: [null, null], label: null, priceAmount: "4.50", compareAtAmount: null, unitPrice: null, available: true, imageUrl: null }],
      defaultVariantId: "v1",
    });
  });

  it("098 — opens on the first variant that can be bought, and says From when prices differ", async () => {
    const d = await repo({
      variants: async () => [
        variantRow({ id: "v1", option1: "s", label: "5 kg", price_amount: "21.00", available: false }),
        variantRow({ id: "v2", option1: "m", label: "1 kg", price_amount: "5.50", pack_quantity: "1", pack_unit: "kg" }),
      ],
      productDetail: async () => detail({ unit_basis: "per_kg" }),
    }).svc.productDetail(ID);
    expect(d?.defaultVariantId).toBe("v2");
    expect(d?.priceVaries).toBe(true);
    expect(d?.variants[1]?.unitPrice).toEqual({ amount: "5.50", basis: "per_kg" });
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
  it("maps the tree with counts and a public or null image", async () => {
    const { svc } = repo({
      categories: async () => [
        { key: "dairy", name: "Dairy", parent_key: null, product_count: 3, image_key: "c.jpg", image_widths: [160] },
        { key: "milk", name: "Milk", parent_key: "dairy", product_count: 0, image_key: null, image_widths: null },
      ],
    });
    expect(await svc.categories()).toEqual([
      { key: "dairy", name: "Dairy", parentKey: null, productCount: 3, imageUrl: "signed:c.jpg", imageWidths: [160] },
      { key: "milk", name: "Milk", parentKey: "dairy", productCount: 0, imageUrl: null },
    ]);
  });
});
