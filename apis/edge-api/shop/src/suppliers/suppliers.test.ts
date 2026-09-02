import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listSuppliers: vi.fn(),
  getSupplier: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  archiveSupplier: vi.fn(),
  assignProductSupplier: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { ProductError } from "../products/types";
import {
  archiveSupplier,
  assignProductSupplier,
  createSupplier,
  getSupplier,
  updateSupplier,
} from "./service";

const SHOP = "shop-1";

beforeEach(() => {
  vi.clearAllMocks();
  repo.createSupplier.mockResolvedValue({ id: "s1" });
  repo.updateSupplier.mockResolvedValue({ id: "s1" });
});

/** 057 US6 (T051) — supplier validation and, above all, the clear-vs-leave-alone distinction. */
describe("supplier creation", () => {
  it("trims the name and normalises blank optional fields to null", async () => {
    await createSupplier(SHOP, {
      name: "  Riverina Produce  ",
      contactEmail: "   ",
      contactPhone: "0400 000 000",
    });
    expect(repo.createSupplier).toHaveBeenCalledWith(SHOP, {
      name: "Riverina Produce",
      // ⚠ An empty string and an absent value mean the same thing for an optional field. Storing ""
      // would make "has no email" and "has an email that is blank" two different states in the data.
      contactEmail: null,
      contactPhone: "0400 000 000",
      notes: null,
    });
  });

  it("refuses a supplier with no usable name", async () => {
    for (const name of ["", "   ", undefined, 42]) {
      await expect(createSupplier(SHOP, { name })).rejects.toBeInstanceOf(ProductError);
    }
    expect(repo.createSupplier).not.toHaveBeenCalled();
  });
});

/**
 * ⚠ THE CENTRAL TEST IN THIS FILE. 056 shipped a defect where `COALESCE($n, col)` could not tell
 * "leave this alone" from "clear this", so a field once set could never be emptied again. The
 * distinction is only expressible by branching on the PRESENCE of a key.
 */
describe("supplier updates distinguish clearing from leaving alone", () => {
  it("omits a field entirely when the caller did not mention it", async () => {
    await updateSupplier(SHOP, "s1", { name: "New Name" });
    expect(repo.updateSupplier).toHaveBeenCalledWith(SHOP, "s1", { name: "New Name" });
  });

  it("passes an explicit null through, so a field CAN be cleared", async () => {
    await updateSupplier(SHOP, "s1", { contactEmail: null });
    expect(repo.updateSupplier).toHaveBeenCalledWith(SHOP, "s1", { contactEmail: null });
  });

  it("treats an empty string as a clear, not as a value", async () => {
    await updateSupplier(SHOP, "s1", { notes: "" });
    expect(repo.updateSupplier).toHaveBeenCalledWith(SHOP, "s1", { notes: null });
  });

  it("refuses an unknown status rather than silently ignoring it", async () => {
    await expect(updateSupplier(SHOP, "s1", { status: "deleted" })).rejects.toBeInstanceOf(ProductError);
    await expect(updateSupplier(SHOP, "s1", { status: "archived" })).resolves.toBeDefined();
  });
});

describe("supplier lookup and retirement", () => {
  it("turns a missing supplier into not_found rather than returning null", async () => {
    repo.getSupplier.mockResolvedValue(null);
    await expect(getSupplier(SHOP, "nope")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("archives rather than deletes", async () => {
    await archiveSupplier(SHOP, "s1");
    expect(repo.archiveSupplier).toHaveBeenCalledWith(SHOP, "s1");
  });
});

/**
 * ⚠ `null` IS A LEGITIMATE VALUE HERE, and conflating it with "missing" would make a product's
 * supplier impossible to clear — the same defect one level up. A product with no supplier is an
 * ordinary state the restock queue groups under "Unassigned" (FR-018).
 */
describe("assigning a product's supplier", () => {
  it("accepts a supplier id", async () => {
    await assignProductSupplier(SHOP, "p1", { supplierId: "s1" });
    expect(repo.assignProductSupplier).toHaveBeenCalledWith(SHOP, "p1", "s1");
  });

  it("accepts an explicit null as 'no supplier'", async () => {
    await assignProductSupplier(SHOP, "p1", { supplierId: null });
    expect(repo.assignProductSupplier).toHaveBeenCalledWith(SHOP, "p1", null);
  });

  it("refuses an omitted or blank supplierId, which is neither an id nor a clear", async () => {
    for (const body of [{}, { supplierId: "" }, { supplierId: "   " }, { supplierId: 7 }]) {
      await expect(assignProductSupplier(SHOP, "p1", body)).rejects.toBeInstanceOf(ProductError);
    }
    expect(repo.assignProductSupplier).not.toHaveBeenCalled();
  });
});
