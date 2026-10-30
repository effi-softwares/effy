# Research: Variants Only From Category Attributes

## R1 — Drop the option `kind` from the model and the wire

- **Decision**: `product_option.kind` is dropped and `attribute_id` becomes NOT NULL. `OptionInputDTO.kind`,
  `OptionKind`, `PACK_SIZE_OPTION_NAME` and the storefront option's `kind` are removed; an option is identified by
  its `attributeId`.
- **Rationale**: with one kind left the column and field carry no information. The cleanup (2026-10-23) rule is
  "no compatibility fields": a field kept only so older code compiles is removed. No installed customer build
  exists, so the regenerated Kotlin contract can lose the enum.
- **Alternatives**: keep `kind` with one value `"attribute"` (dead field, and every reader would still branch on
  it); keep the column but forbid `'pack_size'` with a CHECK (same dead weight).

## R2 — What happens to products that use Pack size or clothing Size

- **Decision**: the migration deletes such products **unless** an order line references them. A product with
  order history is kept: all its options are deleted (values cascade; variants' option ids are set null), the
  lowest-position variant stays as it is, every other variant is set `state = 'removed'` (with `removed_at`), and
  its clothing-Size detail values are deleted. Before deleting a product the migration deletes the rows that
  restrict it — cart lines, cart saved lines, promotion targets.
- **Rationale**: the operator chose "delete" (dev test data). But `order_item` references products and variants
  `ON DELETE RESTRICT`, and orders, payments and tax documents are append-only history (096), so a product with
  orders cannot be deleted without destroying order history. Keeping one variant is the smallest change that leaves
  history intact: order lines already hold their own `variant_label` copy, and a removed variant is how 098 keeps
  history for a variant a shop stops selling.
- **Alternatives**: delete orders too (destroys append-only records — refused); fail the migration when any exist
  (likely in dev after 098's walks, so it would never apply); merge every product to one variant (the operator
  chose delete for the rest).
- **Spec impact**: FR-008 and the edge case are updated to say products with order history keep one variant.

## R3 — Net quantity stays on the variant

- **Decision**: `product_variant.pack_quantity` / `pack_unit` are kept as they are (same columns, same checks) and
  are called **Net quantity** in every screen, import header and review row. The product's `unit_basis` stays.
  Unit pricing reads only the variant's own columns.
- **Rationale**: these columns already exist and already feed unit pricing; only the Pack size option read them
  "through" an option value. Renaming the columns would touch every unit-price reader for no behavioural gain.
- **Alternatives**: rename columns to `net_quantity`/`net_unit` (wide churn); move net quantity to a library
  attribute (unit pricing would then depend on staff setting up an attribute in every category).

## R4 — The variant label copy

- **Decision**: `product_option_value.value` (the label copy every order line, manifest and document reads through
  `variantLabelSql`) is written only from the allowed value's label. The pack-size branch in `applyVariantSet` and
  the "a pack size value is the pack size of every variant naming it" rule are removed.
- **Rationale**: one source for a label; nothing else changes for readers.

## R5 — Removing clothing Size, in order

- **Decision**, inside the same migration after R2's product clean-up:
  1. delete `product_change` rows whose `proposed` names the attribute or a pack-size option (pending edits that
     would no longer apply);
  2. delete `product_attribute_value` rows for `clothing_size` (RESTRICT on the attribute);
  3. delete `category_attribute` rows for it (RESTRICT);
  4. delete the `attribute_definition` row (its `attribute_allowed_value` rows cascade);
  5. `SELECT public.rebuild_category_derived();` so `category_form` no longer shows it.
- **Rationale**: follows the foreign keys (`product_option.attribute_id` and `product_option_value.allowed_value_id`
  are RESTRICT and are cleared by R2 first).

## R6 — Pending changes and imports

- **Decision**: pending `product_change` rows that propose a pack-size option are deleted by the migration (the shop
  re-proposes through the new editor). Product imports already staged (`product_import_row`) are left; when applied
  they go through the new parser and a row naming "Pack size" is refused with the column named (contracts/csv-import.md).
- **Rationale**: an approval of a stale proposal would hit the removed column; imports re-validate on apply anyway.

## R7 — The editor when a category offers no options

- **Decision**: in Variants & prices, "With variants" is disabled and its text reads "This category has no options
  to choose between. Ask Effy to add one." The "Add an option" list holds only the category's option attributes,
  each with up to three of its values. Each variant's codes-and-shipping details always include Net quantity.
- **Rationale**: FR-005 / FR-006; the shop is never offered an option staff did not attach.
