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
  // 067
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
// 067 — the pure helpers (diff, overlay, merge) are REAL; only the database-touching ones are mocked.
vi.mock("./change", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./change");
  return { ...actual, ...changeMod };
});

import { changeStatus, deleteProduct, setSections, submitForReview, updateProduct, withdraw } from "./service";
import { diffProposal, mergeAttributes, overlay } from "./change";
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
    // 067 — an APPROVED product going back on sale: the readiness checks still apply to it.
    repo.reviewFacts.mockResolvedValue({ approved: true, reviewState: "none", status: "unavailable" });
  });

  /** ⚠ 067 FR-001 — "publish" no longer exists for a product Effy has never approved. */
  it("⚠ refuses to put a never-approved product on sale, and points at review", async () => {
    repo.reviewFacts.mockResolvedValue({ approved: false, reviewState: "none", status: "draft" });
    repo.hasPrimaryImage.mockResolvedValue(true);
    expect(await kindOf(changeStatus("shop-1", "p1", { status: "active" }))).toBe("conflict");
    expect(repo.changeStatus).not.toHaveBeenCalled();
  });

  /** 067 FR-024 — off sale never waits, approved or not. */
  it("takes a never-approved product off the shelf without asking about review", async () => {
    await changeStatus("shop-1", "p1", { status: "unavailable" });
    expect(repo.reviewFacts).not.toHaveBeenCalled();
    expect(repo.changeStatus).toHaveBeenCalledWith("shop-1", "p1", "unavailable");
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

// ── 067 — review ────────────────────────────────────────────────────────────────────────────────

const approvedDetail = { ...detail, status: "active", approved: true, weightGrams: 500, pendingChange: null };

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

  it("refuses one with a mandatory detail missing, naming it", async () => {
    repo.getProductDetail.mockResolvedValue({ ...detail, approved: false, missingMandatoryAttributes: ["Allergens"] });
    expect(await kindOf(submitForReview("shop-1", "p1"))).toBe("validation");
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
    repo.productTypeIsActive.mockResolvedValue(true);
    repo.categoryIsActive.mockResolvedValue(true);
    repo.assignmentsForType.mockResolvedValue([]);
    changeMod.readChange.mockResolvedValue(null);
    changeMod.saveProposal.mockResolvedValue("saved");
  });

  /** ⚠ FR-015 — the live row is not written. */
  it("⚠ saves a proposal and NEVER writes the live product", async () => {
    await updateProduct("shop-1", "p1", { name: "Renamed", priceAmount: "2.50" });
    expect(repo.updateProduct).not.toHaveBeenCalled();
    expect(changeMod.saveProposal).toHaveBeenCalledWith("shop-1", "p1", { name: "Renamed", priceAmount: "2.50" });
  });

  it("needs no concurrency token — a proposal does not touch the live row", async () => {
    expect(await kindOf(updateProduct("shop-1", "p1", { name: "Renamed" }))).toBe("no-throw");
  });

  /** FR-017 — a second edit builds on the first proposal, it does not replace it. */
  it("merges a further edit over what was already proposed", async () => {
    changeMod.readChange.mockResolvedValue({
      id: "c1", proposed: { name: "Renamed" }, mediaChanged: false, state: "in_review", reason: null, submittedAt: "t",
    });
    await updateProduct("shop-1", "p1", { brand: "Acme" });
    expect(changeMod.saveProposal).toHaveBeenCalledWith("shop-1", "p1", { name: "Renamed", brand: "Acme" });
  });

  /** FR-022 — changing it back proposes nothing. */
  it("proposes nothing when the edit returns a detail to its live value", async () => {
    changeMod.readChange.mockResolvedValue({
      id: "c1", proposed: { name: "Renamed" }, mediaChanged: false, state: "in_review", reason: null, submittedAt: "t",
    });
    await updateProduct("shop-1", "p1", { name: "X" });
    expect(changeMod.saveProposal).toHaveBeenCalledWith("shop-1", "p1", {});
  });

  it("still validates what is proposed", async () => {
    expect(await kindOf(updateProduct("shop-1", "p1", { priceAmount: "abc" }))).toBe("validation");
    expect(changeMod.saveProposal).not.toHaveBeenCalled();
  });
});

describe("067 — the proposal diff", () => {
  const live = { ...approvedDetail, attributes: [
    { attributeId: "a1", key: "storage", name: "Storage", dataType: "single_select", unit: null,
      valueText: "chilled", valueNumber: null, valueBoolean: null, valueOptions: null },
  ] } as never;
  const same = {
    name: "X", productTypeId: "t1", primaryCategoryId: "c1", sku: null, gtin: null, brand: null,
    priceAmount: "1.00", compareAtAmount: null, shortDescription: "d", longDescription: null, weightGrams: 500,
  };

  it("is empty when nothing differs", () => {
    expect(diffProposal(live, same, [])).toEqual({});
  });

  it("treats 1 and 1.00 as the same price", () => {
    expect(diffProposal(live, { ...same, priceAmount: "1" }, [])).toEqual({});
  });

  it("carries only what changed", () => {
    expect(diffProposal(live, { ...same, name: "Y", compareAtAmount: "2.00", weightGrams: 750 }, [])).toEqual({
      name: "Y", compareAtAmount: "2.00", weightGrams: 750,
    });
  });

  it("includes an attribute only when its value differs", () => {
    expect(diffProposal(live, same, [{ attributeId: "a1", valueText: "chilled" }])).toEqual({});
    expect(diffProposal(live, same, [{ attributeId: "a1", valueText: "frozen" }])).toEqual({
      attributes: [{ attributeId: "a1", valueText: "frozen" }],
    });
  });

  it("lays a proposal over the live product, including an explicit null", () => {
    const merged = overlay(live, { name: "Y", brand: null, priceAmount: "3.00" });
    expect(merged).toMatchObject({ name: "Y", brand: null, priceAmount: "3.00", shortDescription: "d" });
  });

  it("merges proposed attributes by attribute", () => {
    expect(
      mergeAttributes([{ attributeId: "a1", valueText: "frozen" }], [
        { attributeId: "a1", valueText: "ambient" },
        { attributeId: "a2", valueNumber: 5 },
      ]),
    ).toEqual([
      { attributeId: "a1", valueText: "ambient" },
      { attributeId: "a2", valueNumber: 5 },
    ]);
  });
});
