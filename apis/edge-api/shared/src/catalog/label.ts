// A variant's label and an order line's name in SQL; the TypeScript twins are `variantLabel` and `lineName` in @effy/shared-types.

/** Values in option order joined with " / "; null with no options. A scalar subquery over at most two rows. */
export function variantLabelSql(v: string): string {
  return `(SELECT string_agg(lov.value, ' / ' ORDER BY lo.position)
             FROM public.product_option_value lov
             JOIN public.product_option lo ON lo.id = lov.option_id
            WHERE lov.id IN (${v}.option1_value_id, ${v}.option2_value_id))`;
}

/** "Basmati Rice — 1 kg", or the product name alone, where one string is all a reader has. */
export function lineNameSql(productName: string, label: string): string {
  return `CASE WHEN ${label} IS NULL THEN ${productName} ELSE ${productName} || ' — ' || ${label} END`;
}
