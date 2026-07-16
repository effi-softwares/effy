import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the shared api client so the repo is tested in isolation: we assert the HTTP verb + path each
// function builds (the contract's `/admin/v1/catalog/*` surface), and that it returns the client's
// value unchanged (DTO≡domain identity map here).
const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
const del = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}));

import {
  assignAttribute,
  changeAttributeStatus,
  changeCategoryStatus,
  changeProductTypeStatus,
  createAttribute,
  createCategory,
  createProductType,
  deleteAllowedValue,
  getAttribute,
  getProductType,
  listAttributes,
  listCategories,
  listProductTypes,
  unassignAttribute,
  updateAssignment,
  updateAttribute,
  updateCategory,
  updateProductType,
} from "./repo";

beforeEach(() => {
  get.mockReset().mockResolvedValue([]);
  post.mockReset().mockResolvedValue({ id: "x" });
  patch.mockReset().mockResolvedValue({ id: "x" });
  del.mockReset().mockResolvedValue(undefined);
});

describe("catalog repo — product types", () => {
  it("lists and gets under /admin/v1/catalog/product-types", async () => {
    await listProductTypes();
    expect(get).toHaveBeenCalledWith("/admin/v1/catalog/product-types");
    await getProductType("t1");
    expect(get).toHaveBeenCalledWith("/admin/v1/catalog/product-types/t1");
  });

  it("creates / patches / changes status", async () => {
    const body = { key: "prepared_food", name: "Prepared food" };
    await createProductType(body);
    expect(post).toHaveBeenCalledWith("/admin/v1/catalog/product-types", body);

    await updateProductType("t1", { name: "New" });
    expect(patch).toHaveBeenCalledWith("/admin/v1/catalog/product-types/t1", { name: "New" });

    await changeProductTypeStatus("t1", { status: "retired" });
    expect(post).toHaveBeenCalledWith("/admin/v1/catalog/product-types/t1/status", {
      status: "retired",
    });
  });

  it("assigns / updates / unassigns attributes on a type", async () => {
    await assignAttribute("t1", { attributeId: "a1", isMandatory: true, displayOrder: 0 });
    expect(post).toHaveBeenCalledWith("/admin/v1/catalog/product-types/t1/attributes", {
      attributeId: "a1",
      isMandatory: true,
      displayOrder: 0,
    });

    await updateAssignment("t1", "a1", { isMandatory: false });
    expect(patch).toHaveBeenCalledWith("/admin/v1/catalog/product-types/t1/attributes/a1", {
      isMandatory: false,
    });

    await unassignAttribute("t1", "a1");
    expect(del).toHaveBeenCalledWith("/admin/v1/catalog/product-types/t1/attributes/a1");
  });
});

describe("catalog repo — attributes", () => {
  it("lists / gets / creates / patches / status / deletes allowed values", async () => {
    await listAttributes();
    expect(get).toHaveBeenCalledWith("/admin/v1/catalog/attributes");
    await getAttribute("a1");
    expect(get).toHaveBeenCalledWith("/admin/v1/catalog/attributes/a1");

    const create = { key: "spice", name: "Spice", dataType: "single_select" as const };
    await createAttribute(create);
    expect(post).toHaveBeenCalledWith("/admin/v1/catalog/attributes", create);

    await updateAttribute("a1", { name: "Heat" });
    expect(patch).toHaveBeenCalledWith("/admin/v1/catalog/attributes/a1", { name: "Heat" });

    await changeAttributeStatus("a1", { status: "active" });
    expect(post).toHaveBeenCalledWith("/admin/v1/catalog/attributes/a1/status", {
      status: "active",
    });

    await deleteAllowedValue("a1", "v1");
    expect(del).toHaveBeenCalledWith("/admin/v1/catalog/attributes/a1/allowed-values/v1");
  });
});

describe("catalog repo — categories", () => {
  it("lists / creates / patches / changes status", async () => {
    await listCategories();
    expect(get).toHaveBeenCalledWith("/admin/v1/catalog/categories");

    const body = { key: "meals", name: "Meals", parentId: null };
    await createCategory(body);
    expect(post).toHaveBeenCalledWith("/admin/v1/catalog/categories", body);

    await updateCategory("c1", { displayOrder: 3 });
    expect(patch).toHaveBeenCalledWith("/admin/v1/catalog/categories/c1", { displayOrder: 3 });

    await changeCategoryStatus("c1", { status: "retired" });
    expect(post).toHaveBeenCalledWith("/admin/v1/catalog/categories/c1/status", {
      status: "retired",
    });
  });

  it("returns the client's value unchanged (DTO≡domain)", async () => {
    get.mockResolvedValueOnce([{ id: "c1", name: "Meals" }]);
    await expect(listCategories()).resolves.toEqual([{ id: "c1", name: "Meals" }]);
  });
});
