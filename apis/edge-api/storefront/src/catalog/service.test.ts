import { describe, expect, it } from "vitest";

import type { CatalogRepository, DetailRow, DetailValueRow, MediaRow, VariantPageRow } from "./repository";
import { createCatalogService, variantDetails } from "./service";

const ID = "00000000-0000-0000-0000-000000000001";

const value = (over: Partial<DetailValueRow>): DetailValueRow => ({
  attribute_id: "a1", variant_id: null, name: "L", section: "Product details", position: 10, input_type: "short_text",
  value_text: null, value_number: null, value_unit: null, value_boolean: null, values: null, value_date: null, value_time: null,
  ...over,
});

const variantRow = (over: Partial<VariantPageRow> = {}): VariantPageRow => ({
  id: "v1", option1: null, option2: null, label: null, price_amount: "4.50", compare_at_amount: null,
  pack_quantity: null, pack_unit: null, available: true, storage_key: null, image_widths: null, ...over,
});

const detail = (over: Partial<DetailRow> = {}): DetailRow => ({
  id: ID, name: "Oat milk", brand: "Oatly", price_amount: "4.50", currency: "AUD", compare_at_amount: null,
  short_description: "Short", long_description: null, primary_category_id: "cat-1", primary_category_key: "dairy",
  is_new: false, available: true, age_restricted: false, unit_basis: null, ...over,
});

/** The page's parts, faked one by one; `productPage` is assembled from them as the statement would. */
interface Parts {
  categories: CatalogRepository["categories"];
  productDetail: (id: string) => Promise<DetailRow | null>;
  productMedia: () => Promise<MediaRow[]>;
  details: () => Promise<DetailValueRow[]>;
  categoryPath: () => Promise<string[]>;
  variants: () => Promise<VariantPageRow[]>;
}

function repo(over: Partial<Parts> = {}) {
  const calls: string[] = [];
  const parts: Parts = {
    categories: async () => [],
    productDetail: async () => detail(),
    productMedia: async () => [],
    details: async () => [],
    categoryPath: async () => ["Dairy, Eggs & Fridge", "Milk"],
    variants: async () => [variantRow()],
    ...over,
  };
  const r: CatalogRepository = {
    categories: parts.categories,
    productPage: async (id) => {
      calls.push(`page:${id}`);
      const row = await parts.productDetail(id);
      return row && { ...row, media: await parts.productMedia(), details: await parts.details(), category_path: await parts.categoryPath(), variants: await parts.variants(), options: [] };
    },
  };
  return { svc: createCatalogService(r, async (k) => (k ? `signed:${k}` : null)), calls };
}

describe("variantDetails (101)", () => {
  const rows = [
    value({ attribute_id: "weight", name: "Weight", input_type: "number", value_number: "1.5", value_unit: "kg", section: "Specifications", position: 5 }),
    value({ attribute_id: "allergens", name: "Allergens", input_type: "multi_select", variant_id: "v1", section: "Ingredients & allergens", position: 10, values: [{ id: "m", label: "Milk" }] }),
    value({ attribute_id: "allergens", name: "Allergens", input_type: "multi_select", variant_id: "v2", section: "Ingredients & allergens", position: 10, values: [{ id: "e", label: "Eggs" }, { id: "m", label: "Milk" }] }),
    value({ attribute_id: "organic", name: "Certified organic", input_type: "boolean", value_boolean: true, section: "Specifications", position: 20 }),
  ];

  it("merges the product's values with the variant's own, grouped by section in form order", () => {
    expect(variantDetails(rows, "v1")).toEqual([
      { groupLabel: "Specifications", items: [{ label: "Weight", value: "1.5 kg" }, { label: "Certified organic", value: "Yes" }] },
      { groupLabel: "Ingredients & allergens", items: [{ label: "Allergens", value: "Milk" }] },
    ]);
    expect(variantDetails(rows, "v2")[1]).toEqual({ groupLabel: "Ingredients & allergens", items: [{ label: "Allergens", value: "Eggs, Milk" }] });
  });

  it("a variant with no value of its own shows none for that detail", () => {
    expect(variantDetails(rows, "v3").map((g) => g.groupLabel)).toEqual(["Specifications"]);
    expect(variantDetails([], "v1")).toEqual([]);
  });
});

describe("productDetail", () => {
  it("composes the page: card fields, gallery, attributes, path and the category key", async () => {
    const { svc } = repo({
      productMedia: async () => [{ storage_key: "a.jpg", alt_text: "Front", image_widths: [640, 160, 320] }, { storage_key: "b.jpg", alt_text: null, image_widths: null }],
      details: async () => [value({ name: "Country of origin", input_type: "short_text", value_text: "Australia" })],
    });
    expect(await svc.productDetail(ID)).toEqual({
      id: ID, name: "Oat milk", brand: "Oatly", imageUrl: "signed:a.jpg", imageWidths: [160, 320, 640], priceAmount: "4.50", currency: "AUD",
      compareAtAmount: null, badges: [], available: true, ageRestricted: false, longDescription: "Short",
      // Copies listed ascending; a picture with none carries no field.
      gallery: [{ imageUrl: "signed:a.jpg", imageWidths: [160, 320, 640], alt: "Front" }, { imageUrl: "signed:b.jpg", alt: null }],
      categoryPath: ["Dairy, Eggs & Fridge", "Milk"], categoryKey: "dairy",
      priceVaries: false, variantId: "v1", variantCount: 1, unitPrice: null, options: [], unitBasis: null,
      variants: [{
        id: "v1", optionValueIds: [null, null], label: null, priceAmount: "4.50", compareAtAmount: null, unitPrice: null, available: true, imageUrl: null,
        details: [{ groupLabel: "Product details", items: [{ label: "Country of origin", value: "Australia" }] }],
      }],
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
        { key: "dairy", name: "Dairy", parent_key: null, depth: 1, is_leaf: false, icon: "milk", product_count: 3, image_key: "c.jpg", image_widths: [160] },
        { key: "milk", name: "Milk", parent_key: "dairy", depth: 2, is_leaf: true, icon: null, product_count: 0, image_key: null, image_widths: null },
      ],
    });
    expect(await svc.categories()).toEqual([
      { key: "dairy", name: "Dairy", parentKey: null, depth: 1, isLeaf: false, icon: "milk", productCount: 3, imageUrl: "signed:c.jpg", imageWidths: [160] },
      { key: "milk", name: "Milk", parentKey: "dairy", depth: 2, isLeaf: true, icon: null, productCount: 0, imageUrl: null },
    ]);
  });
});
