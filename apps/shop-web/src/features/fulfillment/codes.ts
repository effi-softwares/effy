/**
 * How a line's codes are written everywhere a shop reads them: Effy's code for the variant first
 * (always there once sold), then the shop's own code when it has one — "V7K3Q9M · RICE-1KG".
 */
export function lineCodes(variantCode: string | null | undefined, sku: string | null | undefined): string {
  return [variantCode, sku].filter((c): c is string => !!c).join(" · ") || "—";
}
