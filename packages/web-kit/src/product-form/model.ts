import type {
  ShopTaxonomyCategoryDTO,
  ShopTaxonomyDTO,
} from "@effy/shared-types";

/** The category tree the form picks from: every active category, and the leaves used most recently. */
export type ShopTaxonomy = ShopTaxonomyDTO;
export type ShopCategory = ShopTaxonomyCategoryDTO;

/** A category's path as people read it: "Dairy › Milk › Full cream". */
export const pathText = (path: readonly string[]) => path.join(" › ");
