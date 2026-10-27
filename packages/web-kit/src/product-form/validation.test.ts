import { describe, expect, it } from "vitest";

import type { CategoryFormDTO, CategoryFormRow } from "@effy/shared-types";

import { emptyDraft, type ProductDraft } from "./draft";
import {
  basicsComplete,
  detailErrors,
  draftMissing,
  factsComplete,
  isValidPrice,
  optionAttributeIds,
  sendableDetails,
  setDetail,
} from "./validation";
import { emptyRow, syncRows } from "./variants";

describe("isValidPrice", () => {
  it("accepts positive amounts with at most two decimals", () => {
    expect(isValidPrice("4.50")).toBe(true);
    expect(isValidPrice("4")).toBe(true);
    expect(isValidPrice("0")).toBe(false);
    expect(isValidPrice("4.505")).toBe(false);
    expect(isValidPrice("abc")).toBe(false);
  });
});

const row = (over: Partial<CategoryFormRow>): CategoryFormRow =>
  ({
    attributeId: "a-allergens",
    key: "allergens",
    name: "Allergens",
    helpText: null,
    inputType: "multi_select",
    unitFamily: null,
    units: [],
    min: null,
    max: null,
    decimals: null,
    maxLength: null,
    values: [
      { id: "milk", label: "Milk" },
      { id: "nuts", label: "Nuts" },
    ],
    level: "required",
    section: "Food",
    position: 1,
    filterable: true,
    customerVisible: true,
    variesByVariant: true,
    variantOption: false,
    ...over,
  }) as CategoryFormRow;

const FLAVOUR = row({
  attributeId: "a-flavour",
  key: "flavour",
  name: "Flavour",
  inputType: "single_select",
  level: "optional",
  variantOption: true,
  values: [
    { id: "plain", label: "Plain" },
    { id: "mango", label: "Mango" },
  ],
});
const form: Pick<CategoryFormDTO, "sections"> = {
  sections: [
    {
      title: "Food",
      rows: [
        row({}),
        row({
          attributeId: "a-weight",
          key: "net_weight",
          name: "Net weight",
          inputType: "number",
          unitFamily: "mass",
          units: ["g", "kg"],
          level: "recommended",
          variesByVariant: false,
          values: [],
        }),
        FLAVOUR,
      ],
    },
  ],
};

const base = (): ProductDraft => ({
  ...emptyDraft(),
  name: "Yoghurt",
  primaryCategoryId: "leaf",
  shortDescription: "Thick",
});

describe("101 — the details step", () => {
  it("basics need a name, a leaf and a short description; facts are their own step", () => {
    expect(basicsComplete(base())).toBe(true);
    expect(basicsComplete({ ...base(), name: " " })).toBe(false);
    expect(basicsComplete({ ...base(), primaryCategoryId: null })).toBe(false);
    expect(
      factsComplete({
        storage: "chilled",
        gstStatus: "gst_free",
        ageRestricted: false,
      }),
    ).toBe(true);
    expect(
      factsComplete({
        storage: "chilled",
        gstStatus: null,
        ageRestricted: false,
      }),
    ).toBe(false);
  });

  it("a required detail left empty is missing; a value that does not fit is an error on its field", () => {
    const draft = base();
    expect(draftMissing(form, draft)).toEqual(["Allergens"]);
    const bad = {
      ...draft,
      details: setDetail(
        [],
        { attributeId: "a-weight", value: { number: "abc", unit: "g" } },
        "a-weight",
      ),
    };
    expect(detailErrors(form, bad)["details.net_weight"]).toBe(
      "Net weight must be a number",
    );
    const good = {
      ...draft,
      details: setDetail(
        [],
        { attributeId: "a-allergens", value: { valueIds: ["milk"] } },
        "a-allergens",
      ),
    };
    expect(draftMissing(form, good)).toEqual([]);
    expect(detailErrors(form, good)).toEqual({});
  });

  it("a detail that differs by size is missing for each size not filled in, named by its size", () => {
    const flavour = {
      id: "00000000-0000-4000-8000-000000000001",
      position: 1,
      kind: "attribute" as const,
      attributeId: "a-flavour",
      values: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          allowedValueId: "plain",
          position: 0,
        },
        {
          id: "00000000-0000-4000-8000-000000000003",
          allowedValueId: "mango",
          position: 1,
        },
      ],
    };
    const variants = syncRows([], [flavour], [emptyRow(0)]);
    const draft = {
      ...base(),
      variantSet: {
        unitBasis: "" as const,
        options: [flavour],
        packs: {},
        variants,
      },
    };
    const plainOnly = setDetail(
      [],
      {
        attributeId: "a-allergens",
        perVariant: [
          { variantId: variants[0]!.id, value: { valueIds: ["milk"] } },
        ],
      },
      "a-allergens",
    );
    expect(draftMissing(form, { ...draft, details: plainOnly })).toEqual([
      "Allergens (Mango)",
    ]);
    expect(optionAttributeIds(draft)).toEqual(["a-flavour"]);
    // The option's own attribute is never asked as a detail.
    const asDetail = setDetail(
      plainOnly,
      { attributeId: "a-flavour", value: { valueIds: ["plain"] } },
      "a-flavour",
    );
    expect(
      detailErrors(form, { ...draft, details: asDetail })["details.flavour"],
    ).toBeTruthy();
  });

  it("an emptied field is left out, and a 'differs by size' with nothing filled is not sent", () => {
    const one = setDetail([], { attributeId: "x", value: { text: "a" } }, "x");
    expect(setDetail(one, null, "x")).toEqual([]);
    expect(
      sendableDetails([{ attributeId: "y", perVariant: [] }, ...one]),
    ).toEqual(one);
  });
});
