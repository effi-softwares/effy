import { describe, expect, it } from "vitest";

import type { ProductAttributeValue, ProductDetail, ProductMedia } from "./model";
import {
  discountText,
  formatAttributeValue,
  formatMoney,
  orderedMedia,
  primaryMedia,
  storefrontText,
} from "./detailFormat";

// T066: the detail page maps a typed EAV value → a human-readable `<dl>` cell, and orders media
// primary-first for the gallery.

function attr(over: Partial<ProductAttributeValue>): ProductAttributeValue {
  return {
    attributeId: "a1",
    key: "k1",
    name: "Attr",
    dataType: "short_text",
    unit: null,
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueOptions: null,
    ...over,
  };
}

describe("formatAttributeValue", () => {
  it("renders text / select values", () => {
    expect(formatAttributeValue(attr({ dataType: "short_text", valueText: "Kenya" }))).toBe("Kenya");
    expect(
      formatAttributeValue(attr({ dataType: "single_select", valueText: "hot" })),
    ).toBe("hot");
  });
  it("appends the unit to a number", () => {
    expect(formatAttributeValue(attr({ dataType: "number", unit: "g", valueNumber: 250 }))).toBe(
      "250 g",
    );
    expect(formatAttributeValue(attr({ dataType: "number", unit: null, valueNumber: 3 }))).toBe("3");
  });
  it("renders a boolean as Yes/No", () => {
    expect(formatAttributeValue(attr({ dataType: "boolean", valueBoolean: true }))).toBe("Yes");
    expect(formatAttributeValue(attr({ dataType: "boolean", valueBoolean: false }))).toBe("No");
  });
  it("joins multi-select options", () => {
    expect(
      formatAttributeValue(attr({ dataType: "multi_select", valueOptions: ["vegan", "gf"] })),
    ).toBe("vegan, gf");
  });
  it("shows an em dash for an unset value", () => {
    expect(formatAttributeValue(attr({ dataType: "short_text", valueText: null }))).toBe("—");
    expect(formatAttributeValue(attr({ dataType: "number", valueNumber: null }))).toBe("—");
  });
});

describe("formatMoney", () => {
  it("prefixes the currency and dashes an empty amount", () => {
    expect(formatMoney("4.50", "AUD")).toBe("AUD 4.50");
    expect(formatMoney(null, "AUD")).toBe("—");
  });
});

describe("media ordering", () => {
  function media(over: Partial<ProductMedia>): ProductMedia {
    return {
      id: "m",
      url: "https://x/m",
      storageKey: "k",
      isPrimary: false,
      displayOrder: 0,
      altText: null,
      ...over,
    };
  }
  const detail = {
    media: [
      media({ id: "b", displayOrder: 2 }),
      media({ id: "primary", isPrimary: true, displayOrder: 5 }),
      media({ id: "a", displayOrder: 1 }),
    ],
  } as ProductDetail;

  it("puts the primary first, then the rest by displayOrder", () => {
    expect(orderedMedia(detail).map((m) => m.id)).toEqual(["primary", "a", "b"]);
  });
  it("resolves the primary image", () => {
    expect(primaryMedia(detail)?.id).toBe("primary");
    expect(primaryMedia({ media: [] } as unknown as ProductDetail)).toBeNull();
  });
});

describe("discountText (057 pricing block)", () => {
  it("states the saving a compare-at price advertises", () => {
    expect(discountText("8.00", "10.00")).toBe("20% off");
    expect(discountText("6.65", "9.99")).toBe("33% off");
  });

  it("says nothing when there is no saving to state", () => {
    // ⚠ A "was" at or below "now" is not a discount; "0% off" or "-5% off" would claim one.
    expect(discountText("8.00", null)).toBe("—");
    expect(discountText("8.00", "8.00")).toBe("—");
    expect(discountText("8.00", "7.50")).toBe("—");
    expect(discountText(null, "10.00")).toBe("—");
  });
});

describe("storefrontText", () => {
  it("names what a shopper sees, never the internal status", () => {
    expect(storefrontText("active")).toBe("On sale");
    expect(storefrontText("unavailable")).toMatch(/hidden from shoppers/);
    expect(storefrontText("draft")).toMatch(/never published/);
    expect(storefrontText("archived")).toMatch(/^Archived/);
  });
});
