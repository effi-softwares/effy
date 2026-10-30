# Tasks: Variants Only From Category Attributes

**Input**: Design documents from `specs/105-category-driven-variants/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: no new test suites are requested; existing tests that use Pack size or clothing Size MUST move with the
code (they are listed as tasks so nothing is left asserting the old model).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

- [X] T001 Inventory every remaining reference before changing anything: `rg -n "pack_size|PACK_SIZE_OPTION_NAME|OptionKind|clothing_size|packs\b|PackSizeDraft|packIndex|rowPack" apps packages apis --glob '!**/node_modules/**'` and note the list at the end of specs/105-category-driven-variants/tasks.md under "Inventory" (used by T040 to prove the sweep is complete)

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the one option model — contract, rules, writer, readers, schema. Nothing compiles against the old
`kind` once T002 lands, so this phase is done in order.

- [X] T002 Remove `OptionKind`, `PACK_SIZE_OPTION_NAME` and `kind` from `OptionInputDTO` / `OptionDTO`; make `attributeId` and `allowedValueId` required strings; update doc comments in packages/shared-types/src/variants.ts (contracts/variant-set.md)
- [X] T003 In `validateVariantSet` remove the pack-size branch (`packOptions`, "a pack size option names no attribute", the "must be an attribute or pack size" kind check) and the whole "A pack size value is the pack size of every variant naming it" block; keep net-quantity pair and unit-basis checks in packages/shared-types/src/variants.ts
- [X] T004 Update packages/shared-types/src/variants.test.ts: delete pack-size cases, convert fixtures that used a pack-size option to an attribute option, keep and extend net-quantity/unit-price cases
- [X] T005 Regenerate the customer contract: `pnpm --filter @effy/shared-types commerce-contract:gen` (packages/shared-types/contract/CommerceDto.kt, packages/shared-types/contract/commerce-schema.json — `OptionKind` enum gone) and confirm `commerce-contract:check` is clean (contracts/storefront.md)
- [X] T006 Write the migration db/migrations/20261030090000_category_driven_variants.sql steps 1–5 and 7–9 of data-model.md (affected/kept/doomed products, cart_item / cart_saved_item / promotion_target clean-up, delete doomed, collapse kept to their lowest-position variant with the rest `state='removed', removed_at=now()`, delete pending `product_change` naming pack_size, drop `kind` / `product_option_pack_size_uq` / `product_option_attribute_check` / `product_option_kind_check`, `attribute_id` and `allowed_value_id` NOT NULL, `rebuild_category_derived()`, a NOTICE listing kept products, an exception if a kept product ends with more than one active variant); goose Up/Down markers as in db/migrations/20261026094826_catalogue_taxonomy.sql
- [X] T007 The one writer: drop the pack-label branch so `product_option_value.value` is the allowed value's label only, drop `kind` from the option INSERT/UPSERT and the "two options are the same" pack check, update the header comment in apis/edge-api/shared/src/catalog/variants.ts
- [X] T008 [P] Readers: option `name` is the attribute's name (no `PACK_SIZE_OPTION_NAME`), no `kind` selected, `attributeId`/`allowedValueId` non-null in apis/edge-api/shared/src/catalog/read.ts
- [X] T009 [P] Parse options without `kind` (require `attributeId`) in apis/edge-api/shared/src/catalog/authoring.ts
- [X] T010 Update the edge-shared container tests to attribute options only: apis/edge-api/shared/src/catalog/variants.container.test.ts, apis/edge-api/shared/src/catalog/product-details.container.test.ts, apis/edge-api/shared/src/catalog/rebuild-category-derived.container.test.ts

**Checkpoint**: `pnpm --filter @effy/shared-types test` and `pnpm --filter @effy/edge-shared test` green; the
migration applies on a local Postgres loaded with the baseline + 101/102/103 migrations.

---

## Phase 3: User Story 1 — A shop's variant options are exactly its category's (P1) 🎯 MVP

**Goal**: the editor offers only the category's option attributes; no options → "With variants" disabled.

**Independent test**: quickstart.md Walk 2–3.

- [X] T011 [US1] Remove `packs`, `PackSizeDraft`, the pack branch of `labelledOptions` / `rowPack` / `rowLabel` / `toInputs` / `variantSetDraftOf` / `draftFromDetail` / `sizeLabelOf`, and `kind` from new options in packages/web-kit/src/product-form/variants.ts (`packIndex` removed; `rowPack` returns the row's own quantity)
- [X] T012 [US1] Load older saved drafts safely: drop `packs` and any option without an `attributeId` (and reset that draft's variants to one) in packages/web-kit/src/product-form/draft.ts
- [X] T013 [US1] In packages/web-kit/src/product-form/VariantEditor.tsx: "Add an option" lists only `optionAttributes(rows)` (no Pack size choice), `OptionRow` keeps only the library-value branch (delete the pack qty/unit "Add size" UI), new options carry `attributeId` only
- [X] T014 [US1] In packages/web-kit/src/product-form/VariantEditor.tsx: when the category offers no option attributes, disable the "With variants" radio card with "This category has no options to choose between. Ask Effy to add one." (research R7); keep a product that already has options editable
- [X] T015 [P] [US1] Update packages/web-kit/src/product-form/variants.test.ts and packages/web-kit/src/product-form/validation.test.ts to attribute options only
- [X] T016 [P] [US1] Update shop service fixtures to attribute options: apis/edge-api/shop/src/products/variant-change.container.test.ts, apis/edge-api/shop/src/products/effy-owned.container.test.ts, apis/edge-api/shop/src/products/held.container.test.ts, apis/edge-api/shop/src/availability/repository.container.test.ts, apis/edge-api/shop/src/orders/repository.container.test.ts, apis/edge-api/catalog/src/products/controls.container.test.ts, apis/edge-api/commerce/src/cart/repository.container.test.ts
- [X] T017 [US1] Check shop-web / back-office compile against the new web-kit (InventorySection, InventoryRulesDialog, ProductActions, ProductEditDialogs, EffyProductForm): `pnpm --filter @effy/shop-web typecheck && pnpm --filter @effy/back-office typecheck`, fixing call sites in apps/shop-web/src/features/catalog/ and apps/back-office/src/features/products/

**Checkpoint**: web-kit, shop-web, back-office tests green; Walk 2 (options) and 3 (no options) pass in the harness.

---

## Phase 4: User Story 2 — Each variant keeps its own net quantity (P1)

**Goal**: net quantity is a per-variant fact in every variant's details; unit price from each variant's own.

**Independent test**: quickstart.md Walk 2 (net quantities + Per 100 g) and Walk 4's Net quantity row.

- [X] T018 [US2] In packages/web-kit/src/product-form/VariantEditor.tsx show Net quantity (amount + unit) in every variant's codes-and-shipping details (remove the `packK < 0` condition); the unit-price help says "Worked out from each variant's net quantity"; flag variants missing a quantity when a basis is set
- [X] T019 [P] [US2] Net-quantity wording and no pack branch in packages/web-kit/src/product-form/steps.ts (`stepSummary`, `previewSizes`), packages/web-kit/src/product-form/LivePreview.tsx, packages/web-kit/src/product-form/ReviewStep.tsx
- [X] T020 [US2] Back-office review: rename the "Pack size" detail row to "Net quantity" in apis/edge-api/catalog/src/review/service.ts (`packQuantity` row label)

**Checkpoint**: each variant's unit price shows in the editor, the preview and review.

---

## Phase 5: User Story 3 — The seeded clothing Size is gone (P2)

**Goal**: no `clothing_size` attribute, values, attachments or product references.

**Independent test**: quickstart.md Walk 1.

- [X] T021 [US3] Extend db/migrations/20261030090000_category_driven_variants.sql: include products using `clothing_size` (option or detail) in step 1's affected set; delete their `clothing_size` `product_attribute_value` rows for kept products; delete pending `product_change` rows naming its id; delete its `category_attribute` rows and the `attribute_definition` row (allowed values cascade) before `rebuild_category_derived()` (research R5)
- [X] T022 [P] [US3] Make the taxonomy container test stop expecting `clothing_size` in apis/edge-api/shared/src/catalog/rebuild-category-derived.container.test.ts (and any other `clothing_size` reference found by T001)

**Checkpoint**: on a local DB after the migration, `SELECT count(*) FROM attribute_definition WHERE key='clothing_size'` is 0 and Women's clothing's `category_form` has no Size.

---

## Phase 6: User Story 4 — Every surface follows (P2)

**Goal**: import, review, storefront, customer web/app work from category options only.

**Independent test**: quickstart.md Walk 4–7.

- [X] T023 [US4] CSV import: column help per contracts/csv-import.md, rename "Pack quantity"/"Pack unit" to "Net quantity"/"Net unit" (refuse the old headers naming the new ones), remove the "pack size" option-name special case and `kind`, new messages in apis/edge-api/catalog/src/imports/rows.ts
- [X] T024 [P] [US4] Update apis/edge-api/catalog/src/imports/rows.test.ts to the new columns and refusals
- [X] T025 [US4] Review option summary from attributes only ("Flavour: Strawberry, Vanilla"); drop `PACK_SIZE_OPTION_NAME` and `packOf` in apis/edge-api/catalog/src/review/service.ts
- [X] T026 [US4] Storefront: option `name` from the attribute, no `kind` in apis/edge-api/storefront/src/catalog/service.ts
- [X] T027 [P] [US4] Update apis/edge-api/storefront/src/storefront.container.test.ts fixtures to attribute options
- [X] T028 [P] [US4] Update the customer-web fixture in apps/customer-web/lib/variant-selection.test.ts (no `kind`, attribute option)
- [X] T029 [US4] Confirm the customer app builds against the regenerated contract (no reader of `OptionKind`): `rg -n "OptionKind|PackSize" apps/customer-mobile` returns nothing; if anything does, fix it in apps/customer-mobile/shared/src/commonMain/

**Checkpoint**: catalog, storefront, commerce, shop service tests green; customer-web tests green.

---

## Phase 7: Polish & cross-cutting

- [X] T030 [P] Wording sweep in the touched product screens: "size" → "variant" where it means a variant in packages/web-kit/src/product-form/ (spec FR-011)
- [X] T031 Run the T001 search again; only db/migrations/ may still mention `pack_size` / `clothing_size`; record the result under "Inventory" in this file
- [X] T032 Run quickstart.md "Local" in full; format touched app files (`npx prettier --write` in apps/shop-web, apps/back-office)
- [X] T033 Add the 105 entry to FEATURE-HISTORY.md (what changed, R2's kept-products rule, operator steps in order) and the 105 line to CLAUDE.md's "Features recorded"; update the CLAUDE.md Catalogue section's "library option" wording to say options come only from the category

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (T002 → T003 → T004/T005; T006 independent of code; T007 → T008/T009 → T010).
- US1 (Phase 3) and US2 (Phase 4) both need Phase 2; US2's T018 edits the same file as T013/T014, so run US1 first.
- US3 (Phase 5) extends T006's migration file: after T006.
- US4 (Phase 6) needs Phase 2; independent of US1–US3 except T020/T025 share apis/edge-api/catalog/src/review/service.ts (run T020 then T025).
- Polish last.

### Parallel opportunities

- Phase 2: T008 ∥ T009 after T007; T006 alongside T002–T005.
- US1: T015 ∥ T016 once T011–T014 land.
- US4: T024 ∥ T027 ∥ T028 after their source tasks.

## Implementation Strategy

1. Phase 1–2: the model is single-source and compiles end to end (MVP foundation).
2. US1: shops can only use category options — the visible fix (MVP).
3. US2: unit pricing intact on per-variant net quantity.
4. US3: clothing Size removed (data only).
5. US4: import, review, storefront, customer surfaces aligned.
6. Polish: sweep, docs, operator steps.

## Inventory

T001 (2026-10-30) — files naming pack_size / PACK_SIZE_OPTION_NAME / OptionKind / clothing_size / packs / packIndex /
rowPack (count of lines): shared-types variants.ts (6), variants.test.ts (1), units.ts (2 — `packs` is a count unit,
unrelated), contract CommerceDto.kt (3), commerce-schema.json (3); web-kit variants.ts (20), variants.test.ts (12),
VariantEditor.tsx (15), steps.ts (3), draft.ts (1), validation.test.ts (1); edge-shared catalog variants.ts (1),
read.ts (4), authoring.ts (1), variants/product-details/rebuild-category-derived container tests; catalog
imports/rows.ts (2) + test, review/service.ts (3), products/controls.container.test.ts; storefront catalog/service.ts
(2), catalog/repository.ts (2), storefront.container.test.ts (2); shop availability/orders/effy-owned/held/
variant-change container tests; commerce cart container test; customer-web variant-selection.test.ts.
Also passing `kind` through without naming pack_size: shop products/change.ts (proposal JSON `k`),
products/handler-support.ts, products/repository.ts.

T031 (2026-10-30) — after the change, `pack_size` / `clothing_size` appear only in db/migrations (101's two applied
migrations, which are history, and 105's own). No `PACK_SIZE_OPTION_NAME`, `OptionKind`, `PackSizeDraft`, `packIndex`
or `packs` remains in apps, packages or apis. T022 needed no edit: no test expected `clothing_size`.
