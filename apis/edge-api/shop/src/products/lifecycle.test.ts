import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  getProductDetail: vi.fn(),
  productTypeIsActive: vi.fn(),
  categoryIsActive: vi.fn(),
  assignmentsForType: vi.fn(),
  updateProduct: vi.fn(),
  changeStatus: vi.fn(),
  hasPrimaryImage: vi.fn(),
  hardDeleteProduct: vi.fn(),
  setProductSections: vi.fn(),
}));
const mediaMod = vi.hoisted(() => ({ presignRead: vi.fn() }));
vi.mock("./repository", () => repo);
vi.mock("./media", () => mediaMod);

import { changeStatus, deleteProduct, setSections, updateProduct } from "./service";
import { isProductError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isProductError(e) ? e.kind : "other";
  }
}

const detail = {
  id: "p1", shopId: "shop-1", productTypeId: "t1", typeName: "T", primaryCategoryId: "c1", categoryName: "C",
  name: "X", sku: null, gtin: null, brand: null, priceAmount: "1.00", currency: "AUD", compareAtAmount: null,
  shortDescription: "d", longDescription: null, status: "draft", attributes: [], media: [], sections: [],
  missingMandatoryAttributes: [], createdAt: "t", updatedAt: "2026-07-16T00:00:00.000Z",
};

describe("updateProduct — optimistic concurrency (FR-023a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getProductDetail.mockResolvedValue({ ...detail });
    repo.productTypeIsActive.mockResolvedValue(true);
    repo.categoryIsActive.mockResolvedValue(true);
    repo.assignmentsForType.mockResolvedValue([]);
    mediaMod.presignRead.mockResolvedValue("url");
  });

  it("400s without an expectedUpdatedAt token", async () => {
    expect(await kindOf(updateProduct("shop-1", "p1", { name: "New" }))).toBe("validation");
    expect(repo.updateProduct).not.toHaveBeenCalled();
  });

  it("404s a product not in this shop", async () => {
    repo.getProductDetail.mockResolvedValue(null);
    expect(await kindOf(updateProduct("shop-1", "p1", { expectedUpdatedAt: "2026-07-16T00:00:00.000Z", name: "New" }))).toBe("not_found");
  });

  it("409s a stale expectedUpdatedAt (product changed elsewhere)", async () => {
    repo.updateProduct.mockResolvedValue("stale");
    expect(await kindOf(updateProduct("shop-1", "p1", { expectedUpdatedAt: "2026-07-16T00:00:00.000Z", name: "New" }))).toBe("conflict");
  });

  it("patches only the supplied subset (merges the rest from current)", async () => {
    repo.updateProduct.mockResolvedValue("updated");
    await updateProduct("shop-1", "p1", { expectedUpdatedAt: "2026-07-16T00:00:00.000Z", name: "Renamed" });
    const values = repo.updateProduct.mock.calls[0]![3];
    expect(values.name).toBe("Renamed");
    expect(values.shortDescription).toBe("d"); // untouched field kept from current
  });
});

describe("changeStatus — publish re-validates mandatory (FR-010)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaMod.presignRead.mockResolvedValue("url");
    repo.getProductDetail.mockResolvedValue({ ...detail });
    repo.changeStatus.mockResolvedValue(true);
  });

  it("rejects publish when a mandatory attribute is missing", async () => {
    repo.getProductDetail.mockResolvedValue({ ...detail, missingMandatoryAttributes: ["Allergens"] });
    repo.hasPrimaryImage.mockResolvedValue(true);
    expect(await kindOf(changeStatus("shop-1", "p1", { status: "active" }))).toBe("validation");
    expect(repo.changeStatus).not.toHaveBeenCalled();
  });

  it("rejects publish without a primary image", async () => {
    repo.hasPrimaryImage.mockResolvedValue(false);
    expect(await kindOf(changeStatus("shop-1", "p1", { status: "active" }))).toBe("validation");
  });

  it("allows archive without any mandatory re-validation", async () => {
    await changeStatus("shop-1", "p1", { status: "archived" });
    expect(repo.changeStatus).toHaveBeenCalledWith("shop-1", "p1", "archived");
    expect(repo.hasPrimaryImage).not.toHaveBeenCalled();
  });

  it("rejects an invalid status value", async () => {
    expect(await kindOf(changeStatus("shop-1", "p1", { status: "banished" }))).toBe("validation");
  });
});

describe("deleteProduct — hard-delete guard (R8)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("409s a published product (archive instead)", async () => {
    repo.hardDeleteProduct.mockResolvedValue("blocked");
    expect(await kindOf(deleteProduct("shop-1", "p1"))).toBe("conflict");
  });

  it("404s a missing product", async () => {
    repo.hardDeleteProduct.mockResolvedValue("not_found");
    expect(await kindOf(deleteProduct("shop-1", "p1"))).toBe("not_found");
  });

  it("removes an unreferenced draft", async () => {
    repo.hardDeleteProduct.mockResolvedValue("deleted");
    expect(await kindOf(deleteProduct("shop-1", "p1"))).toBe("no-throw");
  });
});

describe("setSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaMod.presignRead.mockResolvedValue("url");
    repo.getProductDetail.mockResolvedValue({ ...detail });
  });

  it("404s when the product is not this shop's", async () => {
    repo.setProductSections.mockResolvedValue(false);
    expect(await kindOf(setSections("shop-1", "p1", { sectionIds: ["s1"] }))).toBe("not_found");
  });

  it("sets membership and reloads detail", async () => {
    repo.setProductSections.mockResolvedValue(true);
    await setSections("shop-1", "p1", { sectionIds: ["s1", "s2"] });
    expect(repo.setProductSections).toHaveBeenCalledWith("shop-1", "p1", ["s1", "s2"]);
  });
});
