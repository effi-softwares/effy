# Implementation Plan: Information Banners

**Branch**: `dev` (no feature branch) | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/108-information-banners/spec.md`

## Summary

A fifth promotion kind, `banner`, in the same `public.promotion` table, so groups, skins, pictures, states, the
activity log and both clients' renderers work unchanged. A banner has no offer: the offer-only columns become
nullable and one CHECK says a banner has none of them, and an offer has all of them (R1). Because an offer's
destination is derived from its discount targets, a banner stores its own destination (`link_kind` + an aisle or a
product, R2). The engine never sees a banner (R3). Words may carry **live values** (`{free_delivery_amount}`,
`{order_minimum}`), filled from the active setting by the one promotion reader. A banner whose value is empty is
hidden with a reason (R4). Back-office gets a banner editor, a list filter, a detail page without offer panels, a
live-values route and a tour (R6, R7). Both customer clients drop the offer page link for banners. The app's
generated contract learns the kind (R8). A dev seed adds four banners (R9).

## Technical Context

**Language/Version**: TypeScript 5.9 (Node 22 Lambdas, React 19 web), Kotlin 2.4 (customer app), PostgreSQL 16 SQL

**Primary Dependencies**: existing only: `@effy/edge-shared/promotions`, `@effy/shared-types`, `@effy/web-kit`
(promo-skin, tour, data-table), TanStack Router/Query, quicktype contract generator. **No new package.**

**Storage**: `public.promotion`, plus one migration: kind `banner`, nullable offer columns, a shape CHECK, and link
columns with FKs.

**Testing**: vitest (unit + container tests on a local Postgres, per the repo's container-test recipe), the promotions
guard, back-office tours word-for-word test, Kotlin host tests for the mapper, quickstart walk.

**Target Platform**: staff gateway (admin-promotions stack), shared gateway (storefront, commerce), back-office SPA,
customer-web (Next.js 16), customer app (KMP).

**Project Type**: monorepo: serverless services + web apps + mobile app + shared packages.

**Performance Goals**: group reads unchanged when no banner uses a live value. Otherwise one extra read per group
request (the active plan + order policy, two indexed single-row reads).

**Constraints**: one reader of promotion tables (`candidates.ts` + admin), one evaluator (`engine.ts`), one writer of
uses (`uses.ts`). The staff gateway gains one route. No timers. Words live in shared-types.

**Scale/Scope**: tens of banners. 1 migration, ~10 backend files, ~8 back-office files, 3 customer-web files, the
regenerated contract + 1 Kotlin mapper, 1 seed, 1 Makefile target.

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | spec.md → this plan → tasks.md. ✓ |
| II Shared contracts | Kind, live-value keys and their words in `@effy/shared-types`. The Kotlin contract is regenerated, never hand-edited. ✓ |
| III One serverless backend | New route in the existing `admin-promotions` stack (staff gateway), and changes in `storefront`/`commerce` via the shared library. No new compute. ✓ |
| IV Auth isolation | Admin routes keep the back-office authorizer and the promotions authz (read: every role, write: manager/admin). ✓ |
| V Native feel / design | Back-office uses the shadcn kit, `@effy/web-kit` patterns, data-table and tours. Customer surfaces reuse the skin renderers: no new look. ✓ |
| VI Layered architecture | Handler → service (`promotion-service.ts`) → repository. Live values in one shared module. ✓ |
| VII Observability | Admin writes audit as today. Live-value misses are logged once per read with the key (no PII). ✓ |
| Real-world identifiers | Seeded banners name no person, address or account. ✓ |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/108-information-banners/
├── spec.md
├── plan.md            # this file
├── research.md        # R1–R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── admin-banners.md
│   └── shopper-groups.md
├── checklists/requirements.md
└── tasks.md           # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261106090000_information_banners.sql     # R1, R2
db/seeds/108_banners_dev.sql                               # R9
Makefile                                                   # seed-banners
packages/shared-types/src/promotions.ts                    # kind, link, live values, words
packages/shared-types/contract/{CommerceDto.kt,commerce-schema.json}   # regenerated
apis/edge-api/shared/src/promotions/
  ├── live-values.ts        # NEW: the keys, token parsing, loading, filling (R4)
  ├── candidates.ts         # banner rows, link target, fill + hide, no engine use
  ├── terms.ts              # banner words (no terms, no gives)
  └── promotions.guard.test.ts  # + banner rules
apis/edge-api/admin/src/promotions/{promotion-service,promotion-repository,promotion-extras,list}.ts
apis/edge-api/admin/src/functions/promotions-live-values-v1-get.ts   # NEW route
apis/edge-api/admin/serverless.promotions.yml
apis/edge-api/admin/src/promotion-groups/repository.ts   # preview reason
apis/edge-api/storefront/src/promotions/service.ts       # no promotion page for a banner
apps/back-office/src/features/promotions/
  ├── BannerEditorScreen.tsx   # NEW
  ├── components/LinkPicker.tsx, LiveValueWords.tsx   # NEW
  ├── PromotionsListScreen.tsx, PromotionDetailScreen.tsx, PromotionEditorScreen.tsx, promotionDraft.ts, model.ts
apps/back-office/src/routes/promotions.tsx               # /promotions/banners/new
apps/back-office/src/features/tours/tours.ts + specs/107-backoffice-guided-tours/spec.md   # banner tour
apps/customer-web/app/(shop)/promotion-groups.ts         # no offer page for a banner
apps/customer-mobile/.../catalog/data/CatalogMappers.kt  # nullable target
```

**Structure Decision**: Everything lands in the existing promotions slices: no new service, package or app.

## Phase 0 / Phase 1

See [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/) and
[quickstart.md](quickstart.md). Post-design constitution re-check: unchanged, all ✓.

## Deploy order (for the operator)

1. `make db-up ENV=dev` (migration `20261106090000`).
2. `make edge-deploy ENV=dev SERVICE=admin-promotions`, then `SERVICE=storefront`, `SERVICE=commerce`.
3. Back-office and customer-web through their pipelines (push), the customer app from Android Studio / Xcode.
4. `make seed-banners ENV=dev`.

## Complexity Tracking

None.
