import type { ProductDetail } from "../model"

/** A draft-free, approved product in the 101 shape: filed in a leaf, facts set, no details yet. */
export function productDetail(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "p1",
    shopId: "s1",
    primaryCategoryId: "c1",
    categoryName: "Coffee",
    categoryPath: ["Drinks", "Coffee"],
    name: "Flat White",
    brand: "Effy Roastery",
    currency: "AUD",
    shortDescription: "Silky espresso",
    longDescription: null,
    gstStatus: "gst_free",
    storage: "ambient",
    ageRestricted: false,
    factDefaults: { storage: "ambient", gstStatus: "gst_free", ageRestricted: false },
    unitBasis: null,
    options: [],
    variants: [],
    status: "active",
    details: [],
    media: [],
    sections: [],
    missingRequired: [],
    hold: null,
    createdBy: "shop",
    createdAt: "2026-07-16T00:00:00Z",
    updatedAt: "2026-07-16T10:00:00Z",
    ...over,
  }
}
