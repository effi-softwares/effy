import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CategoryFormRow } from "@effy/shared-types";

const repo = vi.hoisted(() => ({
  checkLeaf: vi.fn(),
  createProduct: vi.fn(),
  getProductDetail: vi.fn(),
  listProducts: vi.fn(),
  productBelongsToShop: vi.fn(),
  registerMedia: vi.fn(),
}));
const mediaMod = vi.hoisted(() => ({
  presignUpload: vi.fn(),
  presignRead: vi.fn(),
}));
/** The leaf's form the service validates details against. */
const form = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("./repository", () => repo);
vi.mock("./media", () => mediaMod);
vi.mock("@effy/edge-shared/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared/catalog")>()),
  readFormRows: vi.fn(async (_db: unknown, ids: string[]) => new Map(ids.map((id) => [id, form.rows]))),
}));

import { createProduct, listProducts, presignUpload } from "./service";
import { ProductError, isProductError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isProductError(e) ? e.kind : "other";
  }
}

const prepTime: CategoryFormRow = {
  attributeId: "00000000-0000-4000-8000-00000000a77e", key: "prep_time", name: "Prep time", helpText: null,
  inputType: "number", unitFamily: "duration", units: ["min"], min: "0", max: "1000", decimals: 0, maxLength: null,
  values: [], level: "required", section: "Details", position: 0, filterable: false, customerVisible: true,
  variesByVariant: false, variantOption: false,
};

const LEAF = "00000000-0000-4000-8000-0000000000c1";
const V1 = "00000000-0000-4000-8000-0000000000a1";
/** A product with no options is created with exactly one variant, which carries the price. */
const baseVariant = { id: V1, position: 0, optionValueIds: [null, null], shopPriceAmount: "9.99" };
const baseBody = {
  primaryCategoryId: LEAF,
  name: "Test Product",
  shortDescription: "A tasty thing",
  options: [],
  variants: [baseVariant],
};
const withVariant = (over: Record<string, unknown>) => ({ ...baseBody, variants: [{ ...baseVariant, ...over }] });
const DEFAULTS = { storage: "chilled", gstStatus: "gst_free", ageRestricted: false };

function ready() {
  vi.clearAllMocks();
  form.rows = [];
  repo.checkLeaf.mockResolvedValue({ kind: "leaf", defaults: DEFAULTS });
  repo.createProduct.mockResolvedValue("prod-1");
  repo.getProductDetail.mockResolvedValue({ id: "prod-1", media: [] });
}

describe("createProduct (validation, draft-first, 101 facts and details)", () => {
  beforeEach(ready);

  it("takes storage, GST and 18+ from the leaf when they are not sent", async () => {
    await createProduct("shop-1", baseBody, "sub");
    expect(repo.createProduct).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({ storage: "chilled", gstStatus: "gst_free", ageRestricted: false }),
      "sub",
    );
  });

  it("keeps a fact the shop sends over the leaf's default", async () => {
    await createProduct("shop-1", { ...baseBody, storage: "frozen", ageRestricted: true }, "sub");
    expect(repo.createProduct).toHaveBeenCalledWith("shop-1", expect.objectContaining({ storage: "frozen", ageRestricted: true }), "sub");
  });

  it("fact_required: refuses a fact the leaf has no default for and the shop did not choose", async () => {
    repo.checkLeaf.mockResolvedValue({ kind: "leaf", defaults: { storage: null, gstStatus: "taxable", ageRestricted: false } });
    await expect(createProduct("shop-1", baseBody, "sub")).rejects.toMatchObject({
      kind: "validation",
      fields: expect.arrayContaining([expect.objectContaining({ field: "storage" })]),
    });
  });

  it("category_not_leaf: refuses a category that has sub-categories, and an unknown one", async () => {
    repo.checkLeaf.mockResolvedValue({ kind: "not_leaf" });
    await expect(createProduct("shop-1", baseBody, "sub")).rejects.toMatchObject({
      fields: expect.arrayContaining([expect.objectContaining({ field: "primaryCategoryId", message: expect.stringContaining("category_not_leaf") })]),
    });
    repo.checkLeaf.mockResolvedValue({ kind: "unknown" });
    expect(await kindOf(createProduct("shop-1", baseBody, "sub"))).toBe("validation");
  });

  it("098 — refuses a product with no variant, and a variant with no price", async () => {
    expect(await kindOf(createProduct("shop-1", { ...baseBody, options: undefined, variants: undefined }, "sub"))).toBe("validation");
    expect(await kindOf(createProduct("shop-1", withVariant({ shopPriceAmount: "" }), "sub"))).toBe("validation");
    expect(repo.createProduct).not.toHaveBeenCalled();
  });

  it("rejects a missing name / price / short description", async () => {
    expect(await kindOf(createProduct("shop-1", { primaryCategoryId: LEAF }, "sub"))).toBe("validation");
    expect(repo.createProduct).not.toHaveBeenCalled();
  });

  it("creates a DRAFT with no image and no details (required details are a submit-time check)", async () => {
    form.rows = [prepTime];
    await createProduct("shop-1", baseBody, "sub");
    expect(repo.createProduct).toHaveBeenCalledWith("shop-1", expect.objectContaining({ name: "Test Product", media: [], details: [] }), "sub");
  });

  it("checks each detail against the leaf's form: type, unit and limits", async () => {
    form.rows = [prepTime];
    const typed = (value: unknown) => ({ ...baseBody, details: [{ attributeId: prepTime.attributeId, value }] });
    expect(await kindOf(createProduct("shop-1", typed({ text: "heavy" }), "sub"))).toBe("validation");
    expect(await kindOf(createProduct("shop-1", typed({ number: "5000", unit: "min" }), "sub"))).toBe("validation");
    expect(await kindOf(createProduct("shop-1", typed({ number: "20" }), "sub"))).toBe("validation");
    await createProduct("shop-1", typed({ number: "20", unit: "min" }), "sub");
    expect(repo.createProduct).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({ details: [{ attributeId: prepTime.attributeId, value: { number: "20", unit: "min" } }] }),
      "sub",
    );
  });

  it("refuses a detail the leaf does not ask for", async () => {
    const body = { ...baseBody, details: [{ attributeId: "00000000-0000-4000-8000-00000000ffff", value: { text: "x" } }] };
    expect(await kindOf(createProduct("shop-1", body, "sub"))).toBe("validation");
  });

  it("writes brand to the first-class column (never as a detail)", async () => {
    await createProduct("shop-1", { ...baseBody, brand: "Acme" }, "sub");
    expect(repo.createProduct).toHaveBeenCalledWith("shop-1", expect.objectContaining({ brand: "Acme" }), "sub");
  });

  it("maps a duplicate-SKU conflict from the repository to a 409-conflict", async () => {
    repo.createProduct.mockRejectedValue(new ProductError("conflict", "a product with this SKU already exists in this shop"));
    expect(await kindOf(createProduct("shop-1", withVariant({ sku: "DUP-1" }), "sub"))).toBe("conflict");
  });
});

describe("listProducts (param clamp, shop-scope, presign)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.listProducts.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("clamps pageSize to 100 and defaults page/sort/order", async () => {
    await listProducts("shop-1", { pageSize: "9999", page: "0" });
    const params = repo.listProducts.mock.calls[0]![1];
    expect(params.pageSize).toBe(100);
    expect(params.page).toBe(1);
    expect(params.sort).toBe("recent");
    expect(params.order).toBe("desc");
  });

  it("passes the caller-resolved shopId to the repository (isolation)", async () => {
    await listProducts("shop-XYZ", {});
    expect(repo.listProducts.mock.calls[0]![0]).toBe("shop-XYZ");
  });

  it("presigns the primary image storage key into a url", async () => {
    repo.listProducts.mockResolvedValue({
      items: [{ id: "p1", primaryImageUrl: "products/p1/abc.jpg", name: "x", brand: null, categoryName: "C", priceAmount: "1.00", currency: "AUD", status: "draft", updatedAt: "t", priceVaries: false, variantCount: 1, missingRequired: 0 }],
      total: 1, page: 1, pageSize: 20,
    });
    mediaMod.presignRead.mockResolvedValue("https://s3/signed");
    const out = await listProducts("shop-1", {});
    expect(out.items[0]!.primaryImageUrl).toBe("https://s3/signed");
  });
});

describe("presignUpload (ownership + type/size validation)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404s a product that is not this shop's (before any S3 call)", async () => {
    repo.productBelongsToShop.mockResolvedValue(false);
    expect(await kindOf(presignUpload("shop-1", "prod-x", "image/png", 1000))).toBe("not_found");
    expect(mediaMod.presignUpload).not.toHaveBeenCalled();
  });

  it("delegates to media.presignUpload once ownership passes", async () => {
    repo.productBelongsToShop.mockResolvedValue(true);
    mediaMod.presignUpload.mockResolvedValue({ uploadUrl: "u", storageKey: "k" });
    const out = await presignUpload("shop-1", "prod-1", "image/png", 1000);
    expect(out).toEqual({ uploadUrl: "u", storageKey: "k" });
  });
});

// "Measured" must mean measured: the flag comes from supplying a weight, never from the client.
describe("createProduct — shipping weight", () => {
  beforeEach(ready);

  it("passes a supplied weight through to the repository", async () => {
    await createProduct("shop-1", withVariant({ weightGrams: 750 }), "sub");
    expect(repo.createProduct).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({ variants: [expect.objectContaining({ weightGrams: 750 })] }),
      "sub",
    );
  });

  // Null means not supplied (the column default, an assumption); never 0, which would ship free.
  it("omitting a weight passes null, never zero", async () => {
    await createProduct("shop-1", baseBody, "sub");
    const input = repo.createProduct.mock.calls[0]![1] as { variants: { weightGrams: number | null }[] };
    expect(input.variants[0]!.weightGrams).toBeNull();
    expect(input.variants[0]!.weightGrams).not.toBe(0);
  });

  it("rejects a zero or negative weight", async () => {
    expect(await kindOf(createProduct("shop-1", withVariant({ weightGrams: 0 }), "sub"))).toBe("validation");
    expect(await kindOf(createProduct("shop-1", withVariant({ weightGrams: -5 }), "sub"))).toBe("validation");
    expect(repo.createProduct).not.toHaveBeenCalled();
  });

  it("rejects a non-integer or unparseable weight", async () => {
    expect(await kindOf(createProduct("shop-1", withVariant({ weightGrams: 1.5 }), "sub"))).toBe("validation");
    expect(await kindOf(createProduct("shop-1", withVariant({ weightGrams: "heavy" }), "sub"))).toBe("validation");
  });

  // 250000 for "250 g" is the obvious slip.
  it("rejects an implausible weight with a units hint", async () => {
    expect(await kindOf(createProduct("shop-1", withVariant({ weightGrams: 300_000 }), "sub"))).toBe("validation");
  });

  // `weightIsAssumed:false` with no weight must not make the default a measurement.
  it("ignores a client-supplied weightIsAssumed", async () => {
    await createProduct("shop-1", withVariant({ weightIsAssumed: false }), "sub");
    const input = repo.createProduct.mock.calls[0]![1] as { variants: Record<string, unknown>[] };
    expect(input.variants[0]).not.toHaveProperty("weightIsAssumed");
    expect(input.variants[0]!.weightGrams).toBeNull();
  });
});
