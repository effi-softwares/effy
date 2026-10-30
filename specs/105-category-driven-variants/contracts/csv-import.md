# Contract: product import columns (back-office › Products › Import)

Source of truth: `IMPORT_COLUMNS` in `apis/edge-api/catalog/src/imports/rows.ts` (the template download and the
parser read the same list).

| Column | Before | After |
|---|---|---|
| Product key | "The same key on every row that is a size of one product." | "The same key on every row that is a variant of one product." |
| Option 1 name | "For a product in sizes: Pack size, or an option the aisle offers." | "For a product with variants: an option the aisle offers, e.g. Flavour." |
| Option 1 value | "This row's value, e.g. 500 g." | "This row's value, from that option's list, e.g. Strawberry." |
| SKU | "…for this size…" | "…for this variant…" |
| Pack quantity | "e.g. 500 (with Pack unit g)." | renamed **Net quantity** — "How much is in the pack, e.g. 500 (with Net unit g). For the unit price." |
| Pack unit | "g, kg, ml, l or each." | renamed **Net unit** — "g, kg, ml, l or each." |

Parsing:

- An option name is matched only against the row's category's option attributes. "Pack size" is no longer special:
  unless staff have made an attribute with that name, it is refused like any unknown option:
  `Option 1 name: "Pack size" is not an option this aisle offers`.
- A product on several rows with no option: `a product on several rows needs an option the aisle offers`.
- Header aliases: the old headers "Pack quantity" / "Pack unit" are refused with a message naming the new header
  (no silent mapping — a renamed column is the operator's to fix in the file).
