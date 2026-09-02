import { describe, expect, it } from "vitest";

import type { ProductDetail, ProductType } from "./model";
import {
  buildAttributeUpdate,
  buildProductUpdate,
  diffScalarFields,
  seedAttributeDraft,
} from "./focusedEdit";

// T066: a focused edit must PATCH only the subset it touched, and every payload must carry the
// `expectedUpdatedAt` concurrency token (FR-023a).

function detail(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "p1",
    shopId: "s1",
    productTypeId: "t1",
    typeName: "Prepared Food",
    primaryCategoryId: "c1",
    categoryName: "Coffee",
    name: "Flat White",
    sku: "FW-001",
    gtin: null,
    brand: "Effy Roastery",
    priceAmount: "4.50",
    currency: "AUD",
    compareAtAmount: null,
    shortDescription: "Silky espresso",
    longDescription: null,
    weightGrams: 500,
    weightIsAssumed: true,
    status: "active",
    supplierId: null,
    supplierName: null,
    attributes: [],
    media: [],
    sections: [],
    missingMandatoryAttributes: [],
    createdAt: "2026-07-16T00:00:00Z",
    updatedAt: "2026-07-16T10:00:00Z",
    ...over,
  };
}

describe("buildProductUpdate", () => {
  it("always includes expectedUpdatedAt and only the changed subset", () => {
    const body = buildProductUpdate("2026-07-16T10:00:00Z", { priceAmount: "5.00" });
    expect(body).toEqual({ expectedUpdatedAt: "2026-07-16T10:00:00Z", priceAmount: "5.00" });
    // No other field leaks into the payload.
    expect(Object.keys(body).sort()).toEqual(["expectedUpdatedAt", "priceAmount"]);
  });
});

describe("diffScalarFields", () => {
  it("returns only the fields whose value actually changed", () => {
    const changed = diffScalarFields(detail(), {
      name: "Flat White", // unchanged
      priceAmount: "5.00", // changed
      brand: "Effy Roastery", // unchanged
    });
    expect(changed).toEqual({ priceAmount: "5.00" });
  });

  it("treats '' vs null as a change and null vs null as unchanged", () => {
    // brand was "Effy Roastery" → cleared to null is a change
    expect(diffScalarFields(detail(), { brand: null })).toEqual({ brand: null });
    // gtin was null → staying null is not a change
    expect(diffScalarFields(detail(), { gtin: null })).toEqual({});
  });

  it("ignores keys that were not supplied", () => {
    expect(diffScalarFields(detail(), {})).toEqual({});
  });

  it("captures a type + category change together", () => {
    const changed = diffScalarFields(detail(), {
      productTypeId: "t2",
      primaryCategoryId: "c1", // unchanged
    });
    expect(changed).toEqual({ productTypeId: "t2" });
  });
});

describe("buildAttributeUpdate", () => {
  const type: ProductType = {
    id: "t1",
    key: "food",
    name: "Food",
    description: null,
    status: "active",
    attributes: [
      {
        attributeId: "spice",
        key: "spice",
        name: "Spice",
        dataType: "single_select",
        unit: null,
        helpText: null,
        validation: null,
        allowedValues: [{ id: "1", value: "hot", label: "Hot", displayOrder: 0 }],
        isMandatory: false,
        displayOrder: 0,
        groupLabel: null,
      },
    ],
    createdAt: "",
    updatedAt: "",
  };

  it("carries the token plus the collected attribute inputs, nothing else", () => {
    const body = buildAttributeUpdate("2026-07-16T10:00:00Z", type, { spice: { text: "hot" } });
    expect(body).toEqual({
      expectedUpdatedAt: "2026-07-16T10:00:00Z",
      attributes: [{ attributeId: "spice", valueText: "hot" }],
    });
  });
});

describe("seedAttributeDraft", () => {
  it("maps each typed value back to the editor draft shape", () => {
    const d = detail({
      attributes: [
        {
          attributeId: "a-text",
          key: "origin",
          name: "Origin",
          dataType: "short_text",
          unit: null,
          valueText: "Kenya",
          valueNumber: null,
          valueBoolean: null,
          valueOptions: null,
        },
        {
          attributeId: "a-num",
          key: "weight",
          name: "Weight",
          dataType: "number",
          unit: "g",
          valueText: null,
          valueNumber: 250,
          valueBoolean: null,
          valueOptions: null,
        },
        {
          attributeId: "a-multi",
          key: "diet",
          name: "Diet",
          dataType: "multi_select",
          unit: null,
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
          valueOptions: ["vegan"],
        },
      ],
    });
    expect(seedAttributeDraft(d)).toEqual({
      "a-text": { text: "Kenya" },
      "a-num": { number: "250" },
      "a-multi": { options: ["vegan"] },
    });
  });
});

// ── Shipping weight (032, FR-036a/FR-037a) ────────────────────────────────────────────────────
describe("focused edit — shipping weight", () => {
  it("sends a changed weight", () => {
    const changed = diffScalarFields(detail({ weightGrams: 500, weightIsAssumed: true }), {
      weightGrams: 780,
    });
    expect(changed).toEqual({ weightGrams: 780 });
  });

  // ⚠ Leaving the field blank must NOT patch the weight. Otherwise editing a product's name would
  // reset a measured weight back to the platform's assumption, silently.
  it("omits the weight when it was not entered", () => {
    const changed = diffScalarFields(detail({ weightGrams: 780, weightIsAssumed: false }), {
      name: "Renamed",
      weightGrams: undefined,
    });
    expect(changed).toEqual({ name: "Renamed" });
    expect(changed).not.toHaveProperty("weightGrams");
  });

  // Re-entering the same number is not a change — the PATCH stays minimal (FR-023a).
  it("omits an unchanged weight", () => {
    const changed = diffScalarFields(detail({ weightGrams: 780, weightIsAssumed: false }), {
      weightGrams: 780,
    });
    expect(changed).not.toHaveProperty("weightGrams");
  });
});
