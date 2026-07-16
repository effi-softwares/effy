import { describe, expect, it } from "vitest";

import type { ProductType, ProductTypeAttribute } from "./model";
import { emptyDraft } from "./draft";
import {
  attributeError,
  attributesValid,
  basicsComplete,
  collectAttributeInputs,
  isValidPrice,
  toAttributeInput,
} from "./validation";

function attr(over: Partial<ProductTypeAttribute>): ProductTypeAttribute {
  return {
    attributeId: "a1",
    key: "k1",
    name: "Attr",
    dataType: "short_text",
    unit: null,
    helpText: null,
    validation: null,
    allowedValues: [],
    isMandatory: false,
    displayOrder: 0,
    groupLabel: null,
    ...over,
  };
}

describe("isValidPrice", () => {
  it.each(["4.99", "0.50", "12", "1000.00"])("accepts %s", (v) => {
    expect(isValidPrice(v)).toBe(true);
  });
  it.each(["", "0", "-1", "abc", "1.999", "1,50"])("rejects %s", (v) => {
    expect(isValidPrice(v)).toBe(false);
  });
});

describe("attributeError — mandatory enforcement", () => {
  it("flags an empty mandatory text attribute", () => {
    expect(attributeError(attr({ isMandatory: true }), undefined)).toBe("Required");
  });
  it("passes an empty OPTIONAL attribute", () => {
    expect(attributeError(attr({ isMandatory: false }), undefined)).toBeNull();
  });
  it("a mandatory boolean is always satisfied (false is an answer)", () => {
    expect(attributeError(attr({ dataType: "boolean", isMandatory: true }), undefined)).toBeNull();
  });
});

describe("attributeError — data-type rules", () => {
  it("enforces number min/max", () => {
    const a = attr({ dataType: "number", validation: { min: 1, max: 10 } });
    expect(attributeError(a, { number: "0" })).toMatch(/at least 1/);
    expect(attributeError(a, { number: "11" })).toMatch(/at most 10/);
    expect(attributeError(a, { number: "5" })).toBeNull();
  });
  it("enforces text maxLength", () => {
    const a = attr({ validation: { maxLength: 3 } });
    expect(attributeError(a, { text: "abcd" })).toMatch(/3 characters/);
    expect(attributeError(a, { text: "abc" })).toBeNull();
  });
  it("rejects a single_select value outside allowedValues", () => {
    const a = attr({
      dataType: "single_select",
      allowedValues: [{ id: "x", value: "sm", label: "Small", displayOrder: 0 }],
    });
    expect(attributeError(a, { text: "xl" })).toMatch(/valid option/);
    expect(attributeError(a, { text: "sm" })).toBeNull();
  });
  it("requires at least one option for a mandatory multi_select", () => {
    const a = attr({
      dataType: "multi_select",
      isMandatory: true,
      allowedValues: [{ id: "x", value: "a", label: "A", displayOrder: 0 }],
    });
    expect(attributeError(a, { options: [] })).toMatch(/at least one/);
    expect(attributeError(a, { options: ["a"] })).toBeNull();
  });
});

describe("toAttributeInput — draft → wire mapping by data type", () => {
  it("maps text types to valueText", () => {
    expect(toAttributeInput(attr({ dataType: "short_text" }), { text: "hi" })).toEqual({
      attributeId: "a1",
      valueText: "hi",
    });
  });
  it("maps number to valueNumber", () => {
    expect(toAttributeInput(attr({ dataType: "number" }), { number: "3.5" })).toEqual({
      attributeId: "a1",
      valueNumber: 3.5,
    });
  });
  it("maps boolean to valueBoolean", () => {
    expect(toAttributeInput(attr({ dataType: "boolean" }), { boolean: true })).toEqual({
      attributeId: "a1",
      valueBoolean: true,
    });
  });
  it("maps multi_select to valueOptions", () => {
    expect(toAttributeInput(attr({ dataType: "multi_select" }), { options: ["a", "b"] })).toEqual({
      attributeId: "a1",
      valueOptions: ["a", "b"],
    });
  });
  it("returns null for an empty/unset value", () => {
    expect(toAttributeInput(attr({ dataType: "short_text" }), undefined)).toBeNull();
    expect(toAttributeInput(attr({ dataType: "number" }), { number: "" })).toBeNull();
  });
});

describe("type-level gating", () => {
  const type: ProductType = {
    id: "t1",
    key: "food",
    name: "Food",
    description: null,
    status: "active",
    attributes: [
      attr({ attributeId: "req", isMandatory: true, dataType: "short_text" }),
      attr({ attributeId: "opt", isMandatory: false, dataType: "number" }),
    ],
    createdAt: "",
    updatedAt: "",
  };

  it("attributesValid is false until the mandatory attribute is filled", () => {
    expect(attributesValid(type, {})).toBe(false);
    expect(attributesValid(type, { req: { text: "spicy" } })).toBe(true);
  });

  it("collectAttributeInputs skips empty values", () => {
    const inputs = collectAttributeInputs(type, { req: { text: "spicy" }, opt: { number: "" } });
    expect(inputs).toEqual([{ attributeId: "req", valueText: "spicy" }]);
  });
});

describe("basicsComplete", () => {
  it("requires name, category, a valid price, and a short description", () => {
    const full = {
      ...emptyDraft(),
      name: "Latte",
      primaryCategoryId: "c1",
      priceAmount: "4.50",
      shortDescription: "Hot milk coffee",
    };
    expect(basicsComplete(full)).toBe(true);
    expect(basicsComplete({ ...full, name: "  " })).toBe(false);
    expect(basicsComplete({ ...full, primaryCategoryId: null })).toBe(false);
    expect(basicsComplete({ ...full, priceAmount: "0" })).toBe(false);
    expect(basicsComplete({ ...full, shortDescription: "" })).toBe(false);
  });
});
