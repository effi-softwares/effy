import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  getProductDetail: vi.fn(),
  checkLeaf: vi.fn(),
  updateProduct: vi.fn(),
  changeStatus: vi.fn(),
  hasPrimaryImage: vi.fn(),
  hardDeleteProduct: vi.fn(),
  setProductSections: vi.fn(),
  reviewFacts: vi.fn(),
  submitForReview: vi.fn(),
  withdrawSubmission: vi.fn(),
}));
const changeMod = vi.hoisted(() => ({
  readChange: vi.fn(),
  readChangeMedia: vi.fn(),
  saveProposal: vi.fn(),
  withdrawChange: vi.fn(),
}));
const mediaMod = vi.hoisted(() => ({ presignRead: vi.fn() }));
vi.mock("./repository", () => repo);
vi.mock("./media", () => mediaMod);
vi.mock("@effy/edge-shared/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared/catalog")>()),
  readFormRows: vi.fn(async (_db: unknown, ids: string[]) => new Map(ids.map((id) => [id, []]))),
}));
// The pure helpers (diff, overlay, merge) are real; only database-touching ones are mocked.
vi.mock("./change", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./change");
  return { ...actual, ...changeMod };
});

import { changeStatus, deleteProduct, setSections, submitForReview, updateProduct, withdraw } from "./service";
import { diffProposal, overlay } from "./change";
import { isProductError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isProductError(e) ? e.kind : "other";
  }
}

const V1 = "00000000-0000-4000-8000-0000000000a1";
/** The one variant of a product with no options. */
const variantRow = {
  id: V1, productId: "p1", position: 0, optionValueIds: [null, null], label: null, sku: null, gtin: null,
  shopPriceAmount: "1.00", shopCompareAtAmount: null, priceAmount: "1.00", compareAtAmount: null,
  weightGrams: 500, weightIsAssumed: false, packQuantity: null, packUnit: null, mediaId: null, mediaStorageKey: null,
  stockTracked: false, stockOnHand: null, lowStockThreshold: null, state: "active",
};
const detail = {
  id: "p1", shopId: "shop-1", primaryCategoryId: "c1", categoryName: "C", categoryPath: ["D", "C"],
  name: "X", brand: null, currency: "AUD",
  shortDescription: "d", longDescription: null, status: "draft", details: [], media: [], sections: [],
  missingRequired: [], createdAt: "t", updatedAt: "2026-07-16T00:00:00.000Z",
  unitBasis: null, options: [], variants: [variantRow], shopDefaultThreshold: null,
  gstStatus: "gst_free", storage: "chilled", ageRestricted: false,
  factDefaults: { storage: "chilled", gstStatus: "gst_free", ageRestricted: false },
};
/** As a shop would send it, with its price changed. */
const repriced = (price: string) => ({ options: [], variants: [{ id: V1, position: 0, optionValueIds: [null, null], shopPriceAmount: price }] });

describe("updateProduct — optimistic concurrency (FR-023a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getProductDetail.mockResolvedValue({ ...detail });
    repo.checkLeaf.mockResolvedValue({ kind: "leaf", defaults: { storage: "frozen", gstStatus: "taxable", ageRestricted: true } });
    mediaMod.presignRead.mockResolvedValue("url");
  });

  it("400s without an expectedUpdatedAt token", async () => {
    expect(await kindOf(updateProduct("shop-1", "p1", { name: "New" }, "sub-1"))).toBe("validation");
    expect(repo.updateProduct).not.toHaveBeenCalled();
  });

  it("404s a product not in this shop", async () => {
    repo.getProductDetail.mockResolvedValue(null);
    expect(await kindOf(updateProduct("shop-1", "p1", { expectedUpdatedAt: "2026-07-16T00:00:00.000Z", name: "New" }, "sub-1"))).toBe("not_found");
  });

  it("409s a stale expectedUpdatedAt (product changed elsewhere)", async () => {
    repo.updateProduct.mockResolvedValue({ outcome: "stale" });
    expect(await kindOf(updateProduct("shop-1", "p1", { expectedUpdatedAt: "2026-07-16T00:00:00.000Z", name: "New" }, "sub-1"))).toBe("conflict");
  });

  it("patches only the supplied subset (merges the rest from current)", async () => {
    repo.updateProduct.mockResolvedValue({ outcome: "updated", droppedDetails: [] });
    await updateProduct("shop-1", "p1", { expectedUpdatedAt: "2026-07-16T00:00:00.000Z", name: "Renamed" }, "sub-1");
    const values = repo.updateProduct.mock.calls[0]![3];
    expect(values.name).toBe("Renamed");
    expect(values.shortDescription).toBe("d");
    expect(values.details).toBeNull();
  });

  it("101 — a new leaf re-defaults the facts the shop never changed, and keeps the one it did", async () => {
    repo.updateProduct.mockResolvedValue({ outcome: "updated", droppedDetails: ["Allergens"] });
    const NEW = "00000000-0000-4000-8000-0000000000c2";
    const out = await updateProduct("shop-1", "p1", { expectedUpdatedAt: "2026-07-16T00:00:00.000Z", primaryCategoryId: NEW, factsTouched: ["storage"] }, "sub-1");
    const values = repo.updateProduct.mock.calls[0]![3];
    expect(values).toMatchObject({ primaryCategoryId: NEW, storage: "chilled", gstStatus: "taxable", ageRestricted: true });
    expect(out.droppedDetails).toEqual(["Allergens"]);
  });

  it("101 — refuses a category with sub-categories", async () => {
    repo.checkLeaf.mockResolvedValue({ kind: "not_leaf" });
    expect(await kindOf(updateProduct("shop-1", "p1", { expectedUpdatedAt: "2026-07-16T00:00:00.000Z", primaryCategoryId: "00000000-0000-4000-8000-0000000000c3" }, "sub-1"))).toBe("validation");
    expect(repo.updateProduct).not.toHaveBeenCalled();
  });
});

describe("changeStatus — back on sale (FR-010, 101 FR-016)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaMod.presignRead.mockResolvedValue("url");
    repo.getProductDetail.mockResolvedValue({ ...detail });
    repo.changeStatus.mockResolvedValue(true);
    // An approved product going back on sale still passes the readiness checks.
    repo.reviewFacts.mockResolvedValue({ approved: true, reviewState: "none", status: "unavailable" });
  });

  /** "Publish" does not exist for a product Effy has never approved. */
  it("⚠ refuses to put a never-approved product on sale, and points at review", async () => {
    repo.reviewFacts.mockResolvedValue({ approved: false, reviewState: "none", status: "draft" });
    repo.hasPrimaryImage.mockResolvedValue(true);
    expect(await kindOf(changeStatus("shop-1", "p1", { status: "active" }))).toBe("conflict");
    expect(repo.changeStatus).not.toHaveBeenCalled();
  });

  /** Off sale never waits, approved or not. */
  it("takes a never-approved product off the shelf without asking about review", async () => {
    await changeStatus("shop-1", "p1", { status: "unavailable" });
    expect(repo.reviewFacts).not.toHaveBeenCalled();
    expect(repo.changeStatus).toHaveBeenCalledWith("shop-1", "p1", "unavailable");
  });

  it("a required detail staff added after approval does not keep an approved product off sale", async () => {
    repo.getProductDetail.mockResolvedValue({ ...detail, missingRequired: ["Allergens"] });
    repo.hasPrimaryImage.mockResolvedValue(true);
    await changeStatus("shop-1", "p1", { status: "active" });
    expect(repo.changeStatus).toHaveBeenCalledWith("shop-1", "p1", "active");
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

const approvedDetail = { ...detail, status: "active", approved: true, pendingChange: null };

describe("067 — submitting a new product for review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaMod.presignRead.mockResolvedValue("url");
    repo.getProductDetail.mockResolvedValue({ ...detail, approved: false });
    repo.hasPrimaryImage.mockResolvedValue(true);
    repo.submitForReview.mockResolvedValue(true);
  });

  it("submits a product that passes the readiness checks", async () => {
    await submitForReview("shop-1", "p1");
    expect(repo.submitForReview).toHaveBeenCalledWith("shop-1", "p1");
  });

  it("missing_required_details: refuses one with a required detail missing, naming it per variant", async () => {
    repo.getProductDetail.mockResolvedValue({ ...detail, approved: false, missingRequired: ["Allergens (Mango)"] });
    await expect(submitForReview("shop-1", "p1")).rejects.toMatchObject({
      kind: "validation",
      fields: [{ field: "details", message: expect.stringContaining("Allergens (Mango)") }],
    });
    expect(repo.submitForReview).not.toHaveBeenCalled();
  });

  it("refuses one with no main image", async () => {
    repo.hasPrimaryImage.mockResolvedValue(false);
    expect(await kindOf(submitForReview("shop-1", "p1"))).toBe("validation");
    expect(repo.submitForReview).not.toHaveBeenCalled();
  });

  it("an approved product has no separate submit", async () => {
    repo.getProductDetail.mockResolvedValue({ ...approvedDetail });
    expect(await kindOf(submitForReview("shop-1", "p1"))).toBe("conflict");
  });

  it("404s another shop's product", async () => {
    repo.getProductDetail.mockResolvedValue(null);
    expect(await kindOf(submitForReview("shop-1", "p1"))).toBe("not_found");
  });
});

describe("067 — withdrawing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a never-approved product leaves the queue", async () => {
    repo.reviewFacts.mockResolvedValue({ approved: false, reviewState: "in_review", status: "draft" });
    repo.withdrawSubmission.mockResolvedValue(true);
    repo.getProductDetail.mockResolvedValue({ ...detail, approved: false });
    await withdraw("shop-1", "p1");
    expect(repo.withdrawSubmission).toHaveBeenCalledWith("shop-1", "p1");
    expect(changeMod.withdrawChange).not.toHaveBeenCalled();
  });

  it("an approved product's pending change is discarded", async () => {
    repo.reviewFacts.mockResolvedValue({ approved: true, reviewState: "none", status: "active" });
    changeMod.withdrawChange.mockResolvedValue(true);
    changeMod.readChange.mockResolvedValue(null);
    repo.getProductDetail.mockResolvedValue({ ...approvedDetail });
    await withdraw("shop-1", "p1");
    expect(changeMod.withdrawChange).toHaveBeenCalledWith("shop-1", "p1");
  });

  it("says so when nothing is waiting", async () => {
    repo.reviewFacts.mockResolvedValue({ approved: true, reviewState: "none", status: "active" });
    changeMod.withdrawChange.mockResolvedValue(false);
    expect(await kindOf(withdraw("shop-1", "p1"))).toBe("conflict");
  });
});

describe("067 — editing an APPROVED product proposes a change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaMod.presignRead.mockResolvedValue("url");
    repo.getProductDetail.mockResolvedValue({ ...approvedDetail });
    repo.checkLeaf.mockResolvedValue({ kind: "leaf", defaults: { storage: "frozen", gstStatus: "taxable", ageRestricted: false } });
    changeMod.readChange.mockResolvedValue(null);
    changeMod.saveProposal.mockResolvedValue("saved");
  });

  /** The live row is not written. */
  it("⚠ saves a proposal and NEVER writes the live product", async () => {
    await updateProduct("shop-1", "p1", { name: "Renamed", ...repriced("2.50") }, "sub-1");
    expect(repo.updateProduct).not.toHaveBeenCalled();
    expect(changeMod.saveProposal).toHaveBeenCalledWith("shop-1", "p1", expect.objectContaining({
      name: "Renamed",
      // A price is a variant's; the whole set travels with the proposal.
      variants: [expect.objectContaining({ id: V1, shopPriceAmount: "2.50" })],
    }));
  });

  it("needs no concurrency token — a proposal does not touch the live row", async () => {
    expect(await kindOf(updateProduct("shop-1", "p1", { name: "Renamed" }, "sub-1"))).toBe("no-throw");
  });

  /** A second edit builds on the first proposal. */
  it("merges a further edit over what was already proposed", async () => {
    changeMod.readChange.mockResolvedValue({
      id: "c1", proposed: { name: "Renamed" }, mediaChanged: false, state: "in_review", reason: null, submittedAt: "t",
    });
    await updateProduct("shop-1", "p1", { brand: "Acme" }, "sub-1");
    expect(changeMod.saveProposal).toHaveBeenCalledWith("shop-1", "p1", { name: "Renamed", brand: "Acme" });
  });

  /** Changing it back proposes nothing. */
  it("proposes nothing when the edit returns a detail to its live value", async () => {
    changeMod.readChange.mockResolvedValue({
      id: "c1", proposed: { name: "Renamed" }, mediaChanged: false, state: "in_review", reason: null, submittedAt: "t",
    });
    await updateProduct("shop-1", "p1", { name: "X" }, "sub-1");
    expect(changeMod.saveProposal).toHaveBeenCalledWith("shop-1", "p1", {});
  });

  it("still validates what is proposed", async () => {
    expect(await kindOf(updateProduct("shop-1", "p1", repriced("abc"), "sub-1"))).toBe("validation");
    expect(changeMod.saveProposal).not.toHaveBeenCalled();
  });
});

describe("067 — the proposal diff", () => {
  const live = { ...approvedDetail, details: [{ attributeId: "a1", value: { valueIds: ["chilled"] } }] } as never;
  const sameVariants = [{ id: V1, position: 0, optionValueIds: [null, null] as [null, null], sku: null, gtin: null, shopPriceAmount: "1.00", shopCompareAtAmount: null, weightGrams: 500, packQuantity: null, packUnit: null, mediaStorageKey: null }];
  const same = {
    name: "X", primaryCategoryId: "c1", brand: null, shortDescription: "d", longDescription: null,
    gstStatus: "gst_free" as const, storage: "chilled" as const, ageRestricted: false, unitBasis: null,
    options: [], variants: sameVariants, details: [{ attributeId: "a1", value: { valueIds: ["chilled"] } }],
  };

  it("is empty when nothing differs", () => {
    expect(diffProposal(live, same)).toEqual({});
  });

  it("treats 1 and 1.00 as the same price", () => {
    expect(diffProposal(live, { ...same, variants: [{ ...sameVariants[0]!, shopPriceAmount: "1" }] })).toEqual({});
  });

  it("carries only what changed — and a variant change carries the WHOLE set (098)", () => {
    const changed = [{ ...sameVariants[0]!, shopCompareAtAmount: "2.00", weightGrams: 750 }];
    expect(diffProposal(live, { ...same, name: "Y", variants: changed })).toEqual({
      name: "Y", options: [], variants: changed,
    });
  });

  it("101 — details travel as the complete set, only when they differ; facts one by one", () => {
    expect(diffProposal(live, { ...same, details: [{ attributeId: "a1", value: { valueIds: ["chilled"] } }] })).toEqual({});
    const frozen = [{ attributeId: "a1", value: { valueIds: ["frozen"] } }];
    expect(diffProposal(live, { ...same, details: frozen, storage: "frozen" })).toEqual({ details: frozen, storage: "frozen" });
  });

  it("lays a proposal over the live product, including an explicit null", () => {
    const merged = overlay(live, { name: "Y", brand: null, unitBasis: "per_kg", ageRestricted: true });
    expect(merged).toMatchObject({ name: "Y", brand: null, unitBasis: "per_kg", shortDescription: "d", ageRestricted: true });
  });
});
