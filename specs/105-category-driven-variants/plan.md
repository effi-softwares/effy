# Implementation Plan: Variants Only From Category Attributes

**Branch**: `105-category-driven-variants` (no branch made; the operator commits) | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/105-category-driven-variants/spec.md`

## Summary

A product's variant options become exactly the attributes its category offers as options (101's library
attributes with `variant_option = true`). The platform's own option kind — **Pack size** (`product_option.kind =
'pack_size'`, its label taken from each variant's pack quantity) — is removed from the schema, the shared rules,
the one writer and every reader, and from both consoles, CSV import, review, the storefront API and the customer
contract. Each variant's existing `pack_quantity` / `pack_unit` stays, renamed in every screen to **net quantity**,
and remains the only input to unit pricing. The seeded clothing **Size** attribute (`clothing_size`) is removed with
its values and attachments. One forward migration cleans dev data first: products using Pack size or clothing Size
are deleted, except those with order history, which keep one variant (see [research.md](research.md) R2).

## Technical Context

**Language/Version**: TypeScript 5 (Node 22 Lambdas, React 19 consoles, Next.js 16 customer-web), Kotlin 2.4 (generated
customer contract only), PostgreSQL 16 SQL (Goose)

**Primary Dependencies**: `@effy/shared-types` (variant rules, DTOs), `@effy/edge-shared/catalog` (the one writer
`variants.ts`, readers `read.ts`, `authoring.ts`, `label.ts`), `@effy/web-kit/product-form` (editor), the
`catalog`, `shop`, `storefront` services

**Storage**: PostgreSQL — `product_option`, `product_option_value`, `product_variant`, `attribute_definition`,
`attribute_allowed_value`, `category_attribute`, `product_attribute_value`, `product_change`

**Testing**: vitest (unit + `*.container.test.ts` against a Postgres container), the Kotlin contract diff guard
(`commerce-contract:check`), console guards (`skeletons`, `list-screens`), design-system checks

**Target Platform**: AWS Lambda (shared + staff gateways), shop-web / back-office SPAs, customer-web, customer app
(contract regenerated; no screen code changes — it renders option names and values generically)

**Project Type**: monorepo web + serverless backend + generated mobile contract

**Performance Goals**: unchanged (no new reads; option reads lose one CASE)

**Constraints**: forward-only migration the operator applies; order history (`order_item`, append-only documents)
must survive; no compatibility fields (cleanup 2026-10-23) — the `kind` field goes from the wire

**Scale/Scope**: ~30 source files, ~12 tests, 1 migration, 1 regenerated contract

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Spec-driven | spec.md (operator-directed scope, two decisions taken up front) → this plan → tasks.md | Pass |
| II. Shared contracts | The option shape changes once in `@effy/shared-types` (`variants.ts`, `storefront.ts`); the Kotlin commerce contract is regenerated from it, not hand-edited | Pass |
| III. Single serverless backend | No new service, route or gateway; existing writers/readers in `apis/edge-api` change in place | Pass |
| IV. Auth isolation | No auth change | Pass |
| V. Design system | Editor changes reuse shadcn components already in the editor (Select, RadioGroup, Input); no new colours | Pass |
| VI. Layered architecture | The one writer of options stays `applyVariantSet`; readers keep their slices; migration is raw SQL | Pass |
| VII. Observability | No new event; `product_variants_saved` unchanged | Pass |
| Real-world identifiers | None introduced | Pass |

No exceptions; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/105-category-driven-variants/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R7 decisions
├── data-model.md        # schema before → after, migration steps
├── quickstart.md        # how to verify
├── contracts/
│   ├── variant-set.md   # OptionInputDTO / VariantSet wire change
│   ├── storefront.md    # storefront option DTO change (+ Kotlin contract)
│   └── csv-import.md    # import columns change
└── checklists/requirements.md
```

### Source Code (repository root)

```text
db/migrations/20261030090000_category_driven_variants.sql   # NEW: data clean-up, schema, clothing Size

packages/shared-types/src/
├── variants.ts          # OptionKind / PACK_SIZE_OPTION_NAME / pack-size rules removed; attributeId required
├── storefront.ts        # option DTO loses `kind`
└── variants.test.ts     # pack-size cases removed, net-quantity cases kept
packages/shared-types/contract/CommerceDto.kt, commerce-schema.json   # regenerated

packages/web-kit/src/product-form/
├── variants.ts          # `packs`, PackSizeDraft, packIndex/rowPack's pack branch removed
├── VariantEditor.tsx    # options = category's only; net quantity always per variant; no-options state
├── steps.ts, ReviewStep.tsx, LivePreview.tsx   # net-quantity wording; no pack branch
├── draft.ts             # drops `packs` from saved drafts
└── variants.test.ts, validation.test.ts

apis/edge-api/shared/src/catalog/
├── variants.ts          # label copy = allowed value label only
├── read.ts              # option name = attribute name
├── authoring.ts         # parses options without `kind`
└── *.container.test.ts  # fixtures move to attribute options
apis/edge-api/catalog/src/imports/rows.ts (+ test)   # no "Pack size" option name; net quantity columns
apis/edge-api/catalog/src/review/service.ts          # option summary from attributes; "Net quantity" row
apis/edge-api/storefront/src/catalog/service.ts (+ test)
apis/edge-api/shop/src/products/*.container.test.ts  # fixtures
apps/customer-web/lib/variant-selection.test.ts      # fixture
apps/shop-web, apps/back-office                      # only through web-kit; no direct pack code
```

**Structure Decision**: existing monorepo layout; every change lands in the module that already owns the concern.

## Phase 0 — Research

See [research.md](research.md): R1 drop `kind` rather than keep a one-value enum · R2 products with orders keep one
variant · R3 net quantity stays on the variant · R4 label copy only from allowed values · R5 clothing Size removal
order · R6 pending changes and imports · R7 the "no options" editor state.

## Phase 1 — Design

- [data-model.md](data-model.md): the migration's steps in order, the schema after, the draft shape after.
- [contracts/](contracts/): the three wire changes.
- [quickstart.md](quickstart.md): the walk that proves it.

## Post-design Constitution Check

Unchanged: one contract source, one writer, no new service, no new colour. Pass.

## Complexity Tracking

None.
