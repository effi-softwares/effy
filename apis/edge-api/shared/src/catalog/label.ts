// A variant's label and an order line's name, in SQL (098). The TypeScript twins are `variantLabel`
// and `lineName` in @effy/shared-types — the one way a variant is named anywhere.

/**
 * SQL for the label of variant `v`: its values in option order joined with " / ", NULL when it names
 * no value (a product with no options). A correlated scalar subquery over at most two rows.
 */
export function variantLabelSql(v: string): string {
  return `(SELECT string_agg(lov.value, ' / ' ORDER BY lo.position)
             FROM public.product_option_value lov
             JOIN public.product_option lo ON lo.id = lov.option_id
            WHERE lov.id IN (${v}.option1_value_id, ${v}.option2_value_id))`;
}

/**
 * SQL for an order line's single-string name: "Basmati Rice — 1 kg", or the product name alone.
 * Used where one string is all a reader has (a manifest line, a PDF line, an email line).
 */
export function lineNameSql(productName: string, label: string): string {
  return `CASE WHEN ${label} IS NULL THEN ${productName} ELSE ${productName} || ' — ' || ${label} END`;
}
