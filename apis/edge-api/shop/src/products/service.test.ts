import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  readCatalogSchema: vi.fn(),
  assignmentsForType: vi.fn(),
  productTypeIsActive: vi.fn(),
  categoryIsActive: vi.fn(),
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
vi.mock("./repository", () => repo);
vi.mock("./media", () => mediaMod);

import { createProduct, listProducts, presignUpload } from "./service";
import { ProductError, isProductError, type SchemaAttribute } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isProductError(e) ? e.kind : "other";
  }
}

const numberAttr: SchemaAttribute = {
  attributeId: "attr-weight",
  key: "net_weight",
  name: "Net Weight",
  dataType: "number",
  unit: "g",
  helpText: null,
  validation: { min: 0, max: 1000 },
  allowedValues: [],
  isMandatory: true,
  displayOrder: 0,
  groupLabel: null,
};

const baseBody = {
  productTypeId: "type-1",
  primaryCategoryId: "cat-1",
  name: "Test Product",
  priceAmount: "9.99",
  shortDescription: "A tasty thing",
};

describe("createProduct (validation, draft-first)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.productTypeIsActive.mockResolvedValue(true);
    repo.categoryIsActive.mockResolvedValue(true);
    repo.assignmentsForType.mockResolvedValue([]);
    repo.createProduct.mockResolvedValue("prod-1");
    repo.getProductDetail.mockResolvedValue({ id: "prod-1", media: [] });
  });

  it("rejects a missing name / price / short description", async () => {
    expect(await kindOf(createProduct("shop-1", { productTypeId: "t", primaryCategoryId: "c" }, "sub"))).toBe("validation");
    expect(repo.createProduct).not.toHaveBeenCalled();
  });

  it("rejects an inactive product type", async () => {
    repo.productTypeIsActive.mockResolvedValue(false);
    expect(await kindOf(createProduct("shop-1", baseBody, "sub"))).toBe("validation");
  });

  it("creates a DRAFT with no image (primary image is a publish-time requirement)", async () => {
    await createProduct("shop-1", baseBody, "sub");
    expect(repo.createProduct).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({ name: "Test Product", media: [] }),
      "sub",
    );
  });

  it("enforces attribute value TYPING (a string for a number attribute is rejected)", async () => {
    repo.assignmentsForType.mockResolvedValue([numberAttr]);
    const body = { ...baseBody, attributes: [{ attributeId: "attr-weight", valueText: "heavy" }] };
    expect(await kindOf(createProduct("shop-1", body, "sub"))).toBe("validation");
  });

  it("enforces number range from the attribute validation", async () => {
    repo.assignmentsForType.mockResolvedValue([numberAttr]);
    const body = { ...baseBody, attributes: [{ attributeId: "attr-weight", valueNumber: 5000 }] };
    expect(await kindOf(createProduct("shop-1", body, "sub"))).toBe("validation");
  });

  it("accepts a well-typed attribute value and writes it", async () => {
    repo.assignmentsForType.mockResolvedValue([numberAttr]);
    const body = { ...baseBody, attributes: [{ attributeId: "attr-weight", valueNumber: 250 }] };
    await createProduct("shop-1", body, "sub");
    expect(repo.createProduct).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({ attributes: [expect.objectContaining({ attributeId: "attr-weight", valueNumber: 250 })] }),
      "sub",
    );
  });

  it("writes brand to the first-class column (never as an attribute)", async () => {
    await createProduct("shop-1", { ...baseBody, brand: "Acme" }, "sub");
    expect(repo.createProduct).toHaveBeenCalledWith("shop-1", expect.objectContaining({ brand: "Acme" }), "sub");
  });

  it("maps a duplicate-SKU conflict from the repository to a 409-conflict", async () => {
    repo.createProduct.mockRejectedValue(new ProductError("conflict", "a product with this SKU already exists in this shop"));
    expect(await kindOf(createProduct("shop-1", { ...baseBody, sku: "DUP-1" }, "sub"))).toBe("conflict");
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
      items: [{ id: "p1", primaryImageUrl: "products/p1/abc.jpg", name: "x", brand: null, typeName: "T", categoryName: "C", priceAmount: "1.00", currency: "AUD", status: "draft", sku: null, updatedAt: "t" }],
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
