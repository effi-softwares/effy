# Implementation Plan: Package Labels

**Branch**: `dev` (feature directory `089-package-labels`) | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/089-package-labels/spec.md` (driver backlog H1–H3).

## Summary

Every package gets a permanent 6-character code at payment, shops print a label per package from the
order detail, and the code reaches back-office and the driver's reads. Decisions
([research.md](research.md)):

1. **A column with a database default** (`new_package_code()`), backfilled in the migration (R1).
2. **One token definition** in `@effy/shared-types`: `EFY1:` + code, with a parser that ignores
   everything else (R2).
3. **No window on the label** — EFFY or COURIER only, the locked shop rule (R3, spec Clarifications).
4. **Label data on the existing shop detail**; no new route (R4).
5. **Barcodes drawn in the browser**: `qrcode-generator` for QR, our own Code 128 B encoder (R5); three
   layouts from one renderer, the pick-list pattern (R6).
6. **Additive driver fields** the installed app ignores (R7).

## Technical Context

**Language/Version**: TypeScript / Node 22 Lambdas; React 19 (shop-web, back-office); Kotlin 2.4 (contract only).
**Primary Dependencies**: `qrcode-generator` (shop-web only, MIT, no transitive dependencies) — the one addition.
**Storage**: PostgreSQL 16 — one migration ([data-model.md](data-model.md)).
**Testing**: Vitest (shared-types, shop-web, back-office, services), container tests (shared, shop,
driver), driver-mobile host test ([quickstart.md](quickstart.md) P1–P7).
**Target Platform**: shop-web in the shop's browser printing to thermal or laser printers; Lambda services.
**Project Type**: monorepo — services, web consoles, shared types.
**Performance Goals**: printing an order's labels opens in under a second; no per-label server call.
**Constraints**: shops never learn delivery windows or other shops; no PII on a label; installed driver
builds unaffected.
**Scale/Scope**: one code per package; tens to hundreds of packages a day.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | The window conflict resolved in the spec, not in code. |
| II. Shared contracts | ✅ | Token + alphabet in `@effy/shared-types`; DTO additions there; driver contract regenerated. |
| III. One backend; gateways | ✅ | No new route on either gateway. |
| III. One implementation | ✅ | One code generator (the DB default); one token parser; one label renderer. |
| IV. Auth isolation | ✅ | Existing routes and scopes; a shop sees only its own package's label. |
| V. Design | ✅ | "Print labels" beside the existing "Print pick list"; print output uses print colours (the pick-list exemption). |
| VI. Layering | ✅ | SQL in repositories; label rendering a pure function; Code 128 a pure function. |
| VII. Observability | ✅ | Analytics event `labels_printed` (layout, count) through the shop taxonomy. |
| Shop delivery words | ✅ | No window/day; `check-shop-delivery-words.sh` stays green. |
| Operator runs live changes | ✅ | Migration and deploys handed over. |

Post-design re-check: no violation.

## Project Structure

### Documentation (this feature)

```text
specs/089-package-labels/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/package-code.md
└── checklists/requirements.md
```

### Source Code

```text
db/migrations/20261016150000_package_code.sql                         NEW
packages/shared-types/src/package-code.ts (+ test)                    NEW
packages/shared-types/src/{shop-order-console,order-admin,driver}.ts  additive fields
packages/shared-types/contract-driver/                                regenerated
apis/edge-api/shop/src/…/order detail repository + service            `label`
apis/edge-api/orders/src/orders/{repository,service}.ts               `packageCode`
apis/edge-api/driver/src/work/{sql,service,delivery,manifest}.ts      codes on run/stop/drop
apps/shop-web/src/features/fulfillment/labels/{code128,labels}.ts (+ tests)   NEW
apps/shop-web/src/features/fulfillment/OrderDetailScreen.tsx          "Print labels" + code shown
apps/back-office/src/features/orders/…                                code beside each package
```

**Structure Decision**: existing services and consoles only; the label renderer sits beside the pick list.

## Deploy order (operator)

Migration (backfills codes) → `shop`, `orders`, `driver` → shop-web and back-office. The driver app needs
no new build.
