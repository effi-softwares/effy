import { describe, expect, it } from "vitest";

import type {
  CategoryFormRow,
  OptionInputDTO,
  ProductDetailDTO,
} from "@effy/shared-types";

import {
  addMissingRows,
  applyToAll,
  draftFromDetail,
  emptyRow,
  emptyVariantSet,
  labelledOptions,
  optionAttributes,
  rowLabel,
  syncRows,
  toInputs,
  variantSetErrors,
  type VariantSetDraft,
} from "./variants";

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const FLAVOUR = id();
const PLAIN = id();
const MANGO = id();
const COLOUR = id();
const RED = id();
const BLUE = id();
const flavourRow = {
  attributeId: FLAVOUR,
  key: "flavour",
  name: "Flavour",
  helpText: null,
  inputType: "single_select",
  unitFamily: null,
  units: [],
  min: null,
  max: null,
  decimals: null,
  maxLength: null,
  level: "optional",
  section: "Details",
  position: 1,
  values: [
    { id: PLAIN, label: "Plain" },
    { id: MANGO, label: "Mango" },
  ],
  filterable: true,
  customerVisible: true,
  variesByVariant: true,
  variantOption: true,
} as CategoryFormRow;
const colourRow = {
  ...flavourRow,
  attributeId: COLOUR,
  key: "colour",
  name: "Colour",
  values: [
    { id: RED, label: "Red" },
    { id: BLUE, label: "Blue" },
  ],
} as CategoryFormRow;
const rows = [
  flavourRow,
  colourRow,
  {
    ...flavourRow,
    attributeId: id(),
    key: "origin",
    name: "Origin",
    variantOption: false,
  },
];

const colourOption = (position: number, valueIds: string[]): OptionInputDTO => ({
  id: id(),
  position,
  attributeId: COLOUR,
  values: valueIds.map((v, i) => ({ id: id(), allowedValueId: v, position: i })),
});

const flavourOption = (
  position: number,
  valueIds: string[],
): OptionInputDTO => ({
  id: id(),
  position,
  attributeId: FLAVOUR,
  values: valueIds.map((v, i) => ({
    id: id(),
    allowedValueId: v,
    position: i,
  })),
});

describe("101 — shop-web variant sets", () => {
  it("a new product has no options and one variant", () => {
    const s = emptyVariantSet();
    expect(s.options).toEqual([]);
    expect(s.variants).toHaveLength(1);
  });

  it("offers only the category's variant-option attributes — nothing of the platform's own (105)", () => {
    expect(optionAttributes(rows).map((r) => r.name)).toEqual(["Flavour", "Colour"]);
  });

  it("labels every value from the library", () => {
    const set: VariantSetDraft = {
      ...emptyVariantSet(),
      options: [colourOption(1, [RED, BLUE]), flavourOption(2, [PLAIN, MANGO])],
    };
    const labelled = labelledOptions(set, rows);
    expect(labelled.map((o) => o.name)).toEqual(["Colour", "Flavour"]);
    expect(labelled.flatMap((o) => o.values.map((v) => v.value))).toEqual([
      "Red",
      "Blue",
      "Plain",
      "Mango",
    ]);
    const variants = syncRows([], set.options, set.variants);
    expect(variants.map((r) => rowLabel(set, r, rows))).toEqual([
      "Red / Plain",
      "Red / Mango",
      "Blue / Plain",
      "Blue / Mango",
    ]);
  });

  it("adding an option to a one-variant product keeps that variant as the first value, with its price", () => {
    const start: VariantSetDraft = { ...emptyVariantSet() };
    start.variants[0]!.shopPriceAmount = "3.20";
    const flavour = flavourOption(1, [PLAIN, MANGO]);
    const out = syncRows([], [flavour], start.variants);
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe(start.variants[0]!.id); // keeps its stock and history
    expect(out.map((r) => r.shopPriceAmount)).toEqual(["3.20", "3.20"]);
  });

  it("a deleted combination is not brought back by another change, only by 'Add missing'", () => {
    const flavour = flavourOption(1, [PLAIN, MANGO]);
    const kept = syncRows([], [flavour], [emptyRow(0)]).slice(0, 1);
    expect(syncRows([flavour], [{ ...flavour }], kept)).toHaveLength(1);
    expect(
      addMissingRows({
        unitBasis: "",
        options: [flavour],
        variants: kept,
      }),
    ).toHaveLength(2);
  });

  it("each variant is sent with its own net quantity; the option names its attribute", () => {
    const option = flavourOption(1, [PLAIN, MANGO]);
    const variants = syncRows([], [option], [emptyRow(0)]).map((r, i) => ({
      ...r,
      shopPriceAmount: "2.00",
      packQuantity: i === 0 ? "500" : "1",
      packUnit: (i === 0 ? "g" : "kg") as "g" | "kg",
    }));
    const out = toInputs({ unitBasis: "per_100g", options: [option], variants });
    expect(out.variants.map((v) => [v.packQuantity, v.packUnit])).toEqual([
      ["500", "g"],
      ["1", "kg"],
    ]);
    expect(out.options[0]).toMatchObject({ attributeId: FLAVOUR });
    expect(out.options[0]).not.toHaveProperty("kind");
    expect(
      variantSetErrors({ unitBasis: "per_100g", options: [option], variants }),
    ).toEqual({});
  });

  it("refusals arrive on the server's own field paths", () => {
    const s = emptyVariantSet();
    expect(variantSetErrors(s)["variants[0].shopPriceAmount"]).toBeTruthy();
    s.variants[0]!.shopPriceAmount = "4.50";
    expect(variantSetErrors(s)).toEqual({});
  });

  it("an unused option value is dropped before sending, with its library value", () => {
    const flavour = flavourOption(1, [PLAIN, MANGO]);
    const variants = syncRows([], [flavour], [emptyRow(0)])
      .slice(0, 1)
      .map((r) => ({ ...r, shopPriceAmount: "1.00" }));
    const out = toInputs({
      unitBasis: "",
      options: [flavour],
      variants,
    });
    expect(out.options[0]!.values.map((v) => v.allowedValueId)).toEqual([
      PLAIN,
    ]);
  });

  it("opens on the pending proposal when there is one; an assumed weight is seeded blank; net quantity stays the variant's", () => {
    const packValue = id();
    const detail = {
      unitBasis: null,
      options: [
        {
          id: "o1",
          position: 1,
          attributeId: FLAVOUR,
          name: "Flavour",
          values: [
            {
              id: packValue,
              value: "Plain",
              position: 0,
              allowedValueId: PLAIN,
            },
          ],
        },
      ],
      media: [],
      variants: [
        {
          id: "v1",
          position: 0,
          optionValueIds: [packValue, null],
          sku: null,
          gtin: null,
          shopPriceAmount: "2.00",
          shopCompareAtAmount: null,
          weightGrams: 500,
          weightIsAssumed: true,
          packQuantity: "500",
          packUnit: "g",
          mediaId: null,
          state: "active",
        },
      ],
      pendingChange: null,
    } as unknown as ProductDetailDTO;
    const draft = draftFromDetail(detail);
    expect(draft.variants[0]).toMatchObject({
      id: "v1",
      shopPriceAmount: "2.00",
      weightGrams: "",
    });
    expect(draft.variants[0]).toMatchObject({ packQuantity: "500", packUnit: "g" });
    const pending = {
      ...detail,
      pendingChange: {
        proposed: {
          options: [],
          variants: [
            {
              id: "v1",
              position: 0,
              optionValueIds: [null, null],
              shopPriceAmount: "2.50",
            },
          ],
        },
      },
    } as unknown as ProductDetailDTO;
    expect(draftFromDetail(pending).variants[0]!.shopPriceAmount).toBe("2.50");
  });
});

describe("applyToAll (098)", () => {
  it("copies the first row's price or weight down the column, and never a code", () => {
    const set: VariantSetDraft = {
      unitBasis: "",
      options: [],
      variants: [
        {
          ...emptyRow(0),
          shopPriceAmount: "4.50",
          weightGrams: "500",
          sku: "A",
        },
        { ...emptyRow(1), shopPriceAmount: "", weightGrams: "", sku: "B" },
      ],
    };
    const priced = applyToAll(set, "shopPriceAmount");
    expect(priced.map((r) => r.shopPriceAmount)).toEqual(["4.50", "4.50"]);
    expect(priced.map((r) => r.sku)).toEqual(["A", "B"]);
    expect(applyToAll(set, "weightGrams").map((r) => r.weightGrams)).toEqual([
      "500",
      "500",
    ]);
  });

  it("a new row has no Effy code until it is saved", () => {
    expect(emptyRow(0).code).toBeNull();
  });
});
