# Implementation Plan: Back-Office Shop Management

**Branch**: `009-shop-management` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-shop-management/spec.md`
(clarified 2026-07-10, 5 answers) + [operator-directives.md](./operator-directives.md).

## Summary

Deliver the platform's **shop-management capability** in the back-office console: create shops, govern
their lifecycle (active/suspended/disabled), and manage the people at each shop — provisioning shop
users as passwordless **shop-pool** Cognito accounts plus the platform's own record, keeping the two
consistent. It is the capability every prior slice deferred to; it makes shop and shop-user existence
**product data** and thereby **completes 007's deferred live sign-off** (SC-005b, SC-012).

**Technical approach** (from research): a new **`shops/` slice inside `apis/edge-api/admin`** (back-office
pool, cold path) exposing `/admin/v1/shops...` (R1); server-side Cognito Admin provisioning of shop-pool
users following 006's Cognito-first→DB idempotent pattern (R3/R4); the platform record extended by **one
forward-only migration** (`public.shop` gains a 3-value `status` + contact fields; new `admin.audit_log`)
and 007's boolean shop-active gate **reconciled to `status='active'` in lockstep with its tests** (R2); a
new **`features/shops/`** slice in `apps/back-office` reusing the shared web foundation, with the CRUD
primitives the design-system lacked added **to the shared packages** (R8). No new deployable service, no
new client surface, no new identity pool.

## Technical Context

**Language/Version**: TypeScript on **Node 22** (cold-path Lambdas); **React 19 + TS** (back-office SPA).
Go hot path untouched.

**Primary Dependencies**: `apis/edge-api/admin` (Serverless Framework v3 + esbuild, `pg`, `pino`,
`@effy/edge-shared`) **+ new `@aws-sdk/client-cognito-identity-provider`** (permitted library within the
cold-path standard, not a locked-tech swap). Web: `@effy/{design-system,web-kit,shared-types,api-client}`,
TanStack Router/Query/Table/Form/Store (all already installed).

**Storage**: PostgreSQL 16 — `public` (shop + shop staff/roles, extended from 007) and `admin`
(new `audit_log`). Raw SQL via `@effy/edge-shared` `query`/`withTransaction`. **No ORM.** One
forward-only Goose migration.

**Testing**: `vitest` (edge-api `shops` slice + updated 007 shop-gate tests + `api-client`; back-office
slice/nav). Live acceptance (SC-001…SC-015) per [quickstart.md](./quickstart.md).

**Target Platform**: AWS Lambda arm64 behind the shared HTTP API (dev); SPA in browser, local `:5173`
against the live dev backend (hosted deploy is a later slice, mirroring 005/007).

**Project Type**: web (SPA front end + serverless back end) + DB migration.

**Performance Goals**: low-frequency admin CRUD; cold start acceptable (cold path). Server-side
pagination/search/filter for the register (A12).

**Constraints**: passwordless only; raw SQL/no ORM; forward-only migration; **idempotent, recoverable**
provisioning with no orphaned accounts / ownerless records; no PII in telemetry or logs beyond the
subject id; uniform access-denied contract.

**Scale/Scope**: up to **hundreds of shops, low thousands of shop users total** (A12).

## Constitution Check

*GATE: passed pre-Phase-0; re-checked post-Phase-1 (below).*

- **I — Spec-Driven**: spec + clarifications committed; this plan + research/data-model/contracts/
  quickstart accompany it. Any downstream gap returns to the earliest artifact. ✅
- **II — Monorepo & Shared Contracts**: DTOs in `@effy/shared-types` (`shop.ts` additions); the CRUD
  UI primitives + generic `DataTable` + `api-client` write methods land **in the packages**
  (`@effy/design-system/ui`, `@effy/web-kit/console`, `@effy/api-client`), never app-local (R8). ✅
- **III — Dual-Path**: **cold path** — low-frequency back-office CRUD; explicitly *not* on the hot path
  (operator directive; Principle III). ✅
- **IV — Auth Isolation**: routes keep the **back-office** authorizer; no shop token is ever accepted
  here and no back-office token is presented to a shop-scoped service. The Cognito Admin writes to the
  **shop pool** are **authorized server-side provisioning** (IAM least-privilege to the shop pool ARN),
  the same act 006 performs on the admin pool — **not** token brokering / no auth proxy. Recorded as a
  design note (R3), not a deviation. ✅
- **V — Design System**: reuses `ConsoleShell` + tokens + dark mode; new shadcn primitives (`table`,
  `dialog`, `alert-dialog`, `select`, `badge`, `form`) are **added to the design system**, not the app;
  Jade accent unchanged (no theme defined locally). ✅
- **VI — Layered Architecture & Explicit Wiring**: edge-api three-layer slice (`functions/` →
  `service.ts` → `repository.ts` + `types.ts`), raw SQL in the repo, DTOs mapped explicitly and never
  leaked; web feature-slice (`repo.ts`/`queries.ts`/`model.ts`/screens) with the server-state cache as
  source of truth; **no DI framework** (cached module singletons + explicit imports; the Cognito client
  is a module singleton wired by hand). Conforms to ARCHITECTURE.md. ✅
- **VII — Observability & Telemetry**: PostHog product events per mutation (R9), PII-free (subject id
  only); web errors already routed to PostHog; structured pino logs (actor `sub` + shop id only);
  per-function CloudWatch alarms via the existing `serverless.yml` pattern. ✅

**Result: PASS — no violations.** Complexity Tracking is empty (the two notable items — a new AWS SDK
dependency and a cross-slice edit to 007 — are compliant, recorded in research, and require no
exception).

## Project Structure

### Documentation (this feature)

```text
specs/009-shop-management/
├── plan.md               # this file
├── spec.md               # WHAT/WHY (+ clarifications)
├── operator-directives.md# tech directives held out of the spec
├── research.md           # Phase 0 — R1..R9
├── data-model.md         # Phase 1 — entities, migration, DTOs
├── contracts/
│   └── shop-management.contract.md
├── quickstart.md         # Phase 1 — validation/run guide
└── tasks.md              # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
apis/edge-api/admin/src/
├── functions/                       # NEW handlers (thin edge), back-office authorizer
│   ├── shops-list-v1-get.ts         #   GET /admin/v1/shops
│   ├── shop-get-v1-get.ts           #   GET /admin/v1/shops/{id}
│   ├── shop-create-v1-post.ts       #   POST /admin/v1/shops
│   ├── shop-update-v1-patch.ts      #   PATCH /admin/v1/shops/{id}
│   ├── shop-status-v1-post.ts       #   POST /admin/v1/shops/{id}/status
│   ├── shop-delete-v1-delete.ts     #   DELETE /admin/v1/shops/{id}
│   ├── shop-user-create-v1-post.ts  #   POST /admin/v1/shops/{id}/users
│   └── shop-user-update-v1-patch.ts #   PATCH /admin/v1/shops/{id}/users/{userId}
├── shops/                           # NEW domain slice
│   ├── service.ts                   #   orchestration + validation + audit (no HTTP/SQL)
│   ├── repository.ts                #   raw SQL (public.shop*, admin.audit_log) + row→domain
│   ├── cognito.ts                   #   shop-pool Admin API adapter (module singleton)
│   ├── authz.ts                     #   isActiveStaff / isActiveShopManager (admin.staff record)
│   ├── types.ts                     #   domain types + domain error
│   └── *.test.ts                    #   idempotency, one-shop invariant, authz, delete-guard, gate
└── serverless.yml                   # + new functions, + Cognito IAM (shop pool ARN), + SHOP_USER_POOL_ID env

apis/edge-api/shop/src/staff/        # R2 reconciliation (this slice owns it)
├── repository.ts                    #   gate `st.is_active` → `st.status='active'`; projection→status
├── types.ts                         #   ShopSummary isActive→status
└── lifecycle.test.ts                #   updated fixtures/assertions

db/migrations/
└── <ts>_shop_management.sql         # public.shop status+contact cols (drop is_active); admin.audit_log

packages/
├── shared-types/src/shop.ts         # + management DTOs + ShopLifecycleStatus; ShopSummary status
├── api-client/src/client.ts         # + public post/patch/delete
├── design-system/src/ui/            # + table, dialog, alert-dialog, select, badge, form (+ index)
└── web-kit/src/console/             # + generic DataTable (on @tanstack/react-table)

apps/back-office/src/
├── features/shops/                  # NEW slice: repo.ts, queries.ts, model.ts,
│   │                                #   ShopsListScreen, ShopDetailScreen,
│   └── components/                  #   CreateShopDialog, EditShopDialog, AddShopUserDialog,
│                                    #   ShopStatusMenu, RemoveShopDialog
├── routes/shops.tsx                 # NEW routes under appRoute (+ register in router.tsx)
└── components/layout/nav.ts         # + Shops nav item (no requiredRole — csa reads; +nav.test.ts)
```

**Structure Decision**: **Extend, don't add.** One new domain slice in the existing back-office-pool
service (`apis/edge-api/admin`), one new feature slice in the existing back-office SPA, shared additions
in the four web packages, one migration, and an in-lockstep edit to the 007 shop service. No new
deployable service, no new surface, no new pool — the smallest footprint that satisfies the spec while
keeping every reusable concern in a shared package.

## Complexity Tracking

*No Constitution violations — table intentionally empty.* (The new `@aws-sdk/client-cognito-identity-provider`
dependency and the cross-slice edit to 007's shop service are compliant and recorded in research.md
R2/R3; neither is a deviation requiring justification.)
