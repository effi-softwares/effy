# Data Model: Variants Only From Category Attributes

## Schema — before → after

| Table / column | Before | After |
|---|---|---|
| `product_option.kind` | `text NOT NULL`, `CHECK (kind IN ('attribute','pack_size'))` | **dropped** |
| `product_option.attribute_id` | nullable, `= (kind = 'attribute')` | **NOT NULL**, FK to `attribute_definition` (RESTRICT) |
| index `product_option_pack_size_uq` | one pack-size option per product | **dropped** |
| constraint `product_option_attribute_check` | ties kind to attribute | **dropped** |
| `product_option_value.allowed_value_id` | nullable (null for pack sizes) | **NOT NULL** |
| `product_option_value.value` | label copy: allowed value label or pack label | label copy: allowed value label only |
| `product_variant.pack_quantity`, `pack_unit` | net quantity; also the Pack size option's value | unchanged columns; net quantity only |
| `product.unit_basis` | per_100g, per_kg, per_100ml, per_l, each | + per_10g, per_10ml, per_m, per_m2, per_100_sheets |
| `product_variant.pack_unit` | g, kg, ml, l, each | + m, m2, sheets |
| `attribute_definition` row `clothing_size` | seeded (101) | **deleted** with its 9 `attribute_allowed_value` rows and 7 `category_attribute` rows |

## Migration `20261030090000_category_driven_variants.sql` — steps in order

1. `affected` = products with an option of kind `pack_size`, or an option on `clothing_size`, or a
   `product_attribute_value` on `clothing_size`.
2. `kept` = `affected` products referenced by any `order_item`. `doomed` = the rest.
3. For `doomed`: delete `cart_item`, `cart_saved_item`, `promotion_target` rows naming them; delete the products
   (variants, options, values, media, stock movements, details, pending changes cascade).
4. For `kept`: delete all their `product_option` rows (values cascade, variant option ids → null); set every variant
   but the lowest-position one `state = 'removed', removed_at = now()`; delete their `clothing_size` detail values;
   delete their pending `product_change` rows; recompute listing summaries the way the writer does (per product).
5. Delete remaining `product_change` rows whose `proposed` mentions `pack_size` or the clothing Size attribute id.
6. Remove clothing Size: `category_attribute` → `attribute_definition` (allowed values cascade).
7. Schema: drop `product_option_pack_size_uq`, `product_option_attribute_check`, `product_option_kind_check`,
   column `kind`; `attribute_id SET NOT NULL`; `product_option_value.allowed_value_id SET NOT NULL`.
8. `SELECT public.rebuild_category_derived();`
9. Down: `SELECT 1; -- irreversible: fix forward (105)` (as 101).

The migration fails loudly (an exception naming the product) if step 4 leaves a kept product with more than one
active variant, rather than leaving an inconsistent product.

## Shapes after

- **OptionInputDTO**: `{ id, position: 1|2, attributeId: string, values: { id, allowedValueId: string, position }[] }`
- **VariantInputDTO**: unchanged (`packQuantity`, `packUnit` are the variant's net quantity).
- **VariantSetDraft** (web-kit): `{ unitBasis, options, variants }` — `packs` removed. A saved local draft with
  `packs` or a pack-size option loads with those options dropped (draft.ts), never crashes.
- **Storefront option**: `{ id, position, attributeId, name, values: { id, label }[] }` — no `kind`.

## Rules after (shared-types `variants.ts`)

- An option must name an attribute; two options cannot be the same attribute; values must be chosen from the
  attribute's list (`validateOptionsAgainstForm` — unchanged).
- Removed: pack-size option count, pack-size value ↔ variant pack quantity rules.
- Kept: net quantity pair (both or neither), unit compatible with the unit basis, unit price from each variant's own
  quantity.
