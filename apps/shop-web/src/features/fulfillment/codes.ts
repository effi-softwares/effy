export function lineCodes(variantCode: string | null | undefined, sku: string | null | undefined): string {
  return [variantCode, sku].filter((c): c is string => !!c).join(" · ") || "—"
}
