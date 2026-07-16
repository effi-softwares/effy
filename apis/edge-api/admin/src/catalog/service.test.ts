import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listProductTypes: vi.fn(),
  getProductType: vi.fn(),
  createProductType: vi.fn(),
  updateProductType: vi.fn(),
  setProductTypeStatus: vi.fn(),
  assignAttribute: vi.fn(),
  updateAssignment: vi.fn(),
  unassignAttribute: vi.fn(),
  listAttributes: vi.fn(),
  getAttribute: vi.fn(),
  createAttribute: vi.fn(),
  updateAttribute: vi.fn(),
  setAttributeStatus: vi.fn(),
  deleteAllowedValue: vi.fn(),
  listCategories: vi.fn(),
  categoryExists: vi.fn(),
  categorySubtree: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  setCategoryStatus: vi.fn(),
}));
vi.mock("./repository", () => repo);

import {
  changeAttributeStatus,
  createAttribute,
  createCategory,
  createProductType,
  updateCategory,
} from "./service";
import { CatalogError, isCatalogError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isCatalogError(e) ? e.kind : "other";
  }
}

describe("createProductType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a non-slug key with a validation error (no write)", async () => {
    expect(await kindOf(createProductType({ key: "Not A Slug", name: "X" }, "actor"))).toBe("validation");
    expect(repo.createProductType).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    expect(await kindOf(createProductType({ key: "ok_key", name: "" }, "actor"))).toBe("validation");
  });

  it("writes a valid type (key trimmed)", async () => {
    repo.createProductType.mockResolvedValue({ id: "t1" });
    await createProductType({ key: "prepared_food", name: "Prepared Food" }, "actor");
    expect(repo.createProductType).toHaveBeenCalledWith(
      expect.objectContaining({ key: "prepared_food", name: "Prepared Food" }),
      "actor",
    );
  });
});

describe("createAttribute (data-type + select validation)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unknown dataType", async () => {
    expect(await kindOf(createAttribute({ key: "x", name: "X", dataType: "colour" }, "actor"))).toBe("validation");
  });

  it("requires allowed values for a select attribute", async () => {
    const p = createAttribute({ key: "spice", name: "Spice", dataType: "single_select" }, "actor");
    expect(await kindOf(p)).toBe("validation");
    expect(repo.createAttribute).not.toHaveBeenCalled();
  });

  it("accepts a number attribute with validation", async () => {
    repo.createAttribute.mockResolvedValue({ id: "a1" });
    await createAttribute(
      { key: "prep_time", name: "Prep Time", dataType: "number", unit: "min", validation: { min: 0, max: 240 } },
      "actor",
    );
    expect(repo.createAttribute).toHaveBeenCalledWith(
      expect.objectContaining({ dataType: "number", validation: { min: 0, max: 240 } }),
      "actor",
    );
  });

  it("de-duplicates allowed values", async () => {
    const p = createAttribute(
      {
        key: "spice",
        name: "Spice",
        dataType: "single_select",
        allowedValues: [
          { value: "mild", label: "Mild" },
          { value: "mild", label: "Mild again" },
        ],
      },
      "actor",
    );
    expect(await kindOf(p)).toBe("validation");
  });
});

describe("changeAttributeStatus (in-use guard is the repository's; invalid status is the service's)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid status value", async () => {
    expect(await kindOf(changeAttributeStatus("a1", "gone", "actor"))).toBe("validation");
    expect(repo.setAttributeStatus).not.toHaveBeenCalled();
  });

  it("propagates a repository in-use conflict on retire (FR-006)", async () => {
    repo.setAttributeStatus.mockRejectedValue(new CatalogError("conflict", "in use"));
    expect(await kindOf(changeAttributeStatus("a1", "retired", "actor"))).toBe("conflict");
  });
});

describe("category cycle / parent validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a non-existent parent on create", async () => {
    repo.categoryExists.mockResolvedValue(false);
    expect(await kindOf(createCategory({ key: "meals", name: "Meals", parentId: "nope" }, "actor"))).toBe("validation");
    expect(repo.createCategory).not.toHaveBeenCalled();
  });

  it("rejects making a category its own parent", async () => {
    repo.listCategories.mockResolvedValue([{ id: "c1", parentId: null, key: "food", name: "Food", displayOrder: 0, status: "active" }]);
    expect(await kindOf(updateCategory("c1", { parentId: "c1" }, "actor"))).toBe("validation");
  });

  it("rejects moving a category under its own descendant (cycle)", async () => {
    repo.listCategories.mockResolvedValue([{ id: "c1", parentId: null, key: "food", name: "Food", displayOrder: 0, status: "active" }]);
    repo.categoryExists.mockResolvedValue(true);
    repo.categorySubtree.mockResolvedValue(["c1", "c2"]); // c2 is a descendant of c1
    expect(await kindOf(updateCategory("c1", { parentId: "c2" }, "actor"))).toBe("validation");
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });

  it("allows a valid re-parent", async () => {
    repo.listCategories.mockResolvedValue([{ id: "c1", parentId: null, key: "food", name: "Food", displayOrder: 0, status: "active" }]);
    repo.categoryExists.mockResolvedValue(true);
    repo.categorySubtree.mockResolvedValue(["c1"]);
    repo.updateCategory.mockResolvedValue({ id: "c1" });
    await updateCategory("c1", { parentId: "c9" }, "actor");
    expect(repo.updateCategory).toHaveBeenCalled();
  });
});
