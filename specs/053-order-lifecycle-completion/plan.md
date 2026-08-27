# Implementation Plan: Order Lifecycle Completion

**Branch**: `053-order-lifecycle-completion` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/053-order-lifecycle-completion/spec.md`

## Summary

Make an order capable of finishing, and give the people who run Effy somewhere to finish it from.

Today a standard package stops at the hub and nothing can record that it went further, so most orders
never terminate. This plan adds a **carrier handover** record and an **arrival** record, a **new
cold-path service and back-office console** to create them, an **email channel** on the existing
notification outbox so a web-only shopper hears about the arrival, and two **one-line corrections** to
rules that were right when written and were invalidated when 049 changed the delivery model underneath
them.

The customer surfaces gain **no new screen and no contract change**. Both corrections land server-side,
in one place each, and both customer surfaces pick them up unchanged — which is the return on 052 having
made the progress stage server-derived.

## Technical Context

**Language/Version**: Go 1.x (hot path, one file touched) · TypeScript / Node 22 (cold path, the bulk) ·
React 19 + TypeScript (back-office console) · SQL (one forward-only Goose migration)

**Primary Dependencies**: Gin + pgx/v5 (`core-api`) · Serverless Framework v3 + `@effy/edge-shared`
(cold path) · TanStack Router/Query/Table + `@effy/design-system/ui` + `@effy/web-kit/console` (console) ·
`@effy/email-kit` (the new template) · `@effy/shared-types` (DTOs)

**Storage**: PostgreSQL 16, raw SQL, no ORM. Two new tables, one altered, one migration.

**Testing**: `go test` (stage rule) · Vitest incl. testcontainers (both cold-path services) · Vitest +
Testing Library (console) · `make email-check` · existing workspace gates

**Target Platform**: AWS — Lambda behind the shared HTTP API (cold), Fargate (hot, unchanged), Amplify
Hosting (console, via 048's pipeline)

**Project Type**: Full-stack vertical slice — one new backend service, one new console feature, two
targeted backend corrections, one migration. No mobile change.

**Performance Goals**: Console order detail assembles in a single round of parallel reads; the order
history is one union query, not N. No customer-facing latency budget is affected — the hot path gains no
work (its one change is a lookup-table constant).

**Constraints**: ⚠ `apis/edge-api/admin` is at **77 functions** with `versionFunctions: false` already
spent — the CloudFormation 500-resource limit is the binding constraint on where these routes live
(research R7). ⚠ No carrier contract exists, so arrival is staff-recorded and the design must let a
carrier signal take that job over without a lifecycle rebuild (FR-009).

**Scale/Scope**: 2 new tables · 1 altered · ~6 new routes · 1 new console feature (2 screens) · 1 new
email template · 2 one-line rule corrections · 1 extension to the existing driver delivery write.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design. Both passes recorded.*

| Principle | Verdict | How this plan satisfies it |
|---|---|---|
| **I. Spec-Driven** | ✅ PASS | `spec.md` carries zero technology; both of its clarifications were settled and the reasoning recorded inline so planning does not re-litigate them. This plan cites the constitution throughout. |
| **II. Monorepo / Shared Contracts** | ✅ PASS | DTOs land in `@effy/shared-types` and the console is typed from them. The `isActiveStaff` / role-gate pair is **promoted** out of `admin/src/feedback/authz.ts` into `@effy/edge-shared` and consumed by both services rather than copied — the 028 pattern, and the proof is that admin's existing feedback tests pass unmodified. |
| **III. Dual-Path** | ✅ PASS *(one recorded crossing)* | Every piece declares its path in research R1. The console is cold, the customer read stays hot and untouched, closure and notifications are already cold. The one crossing — the cold path writing `shop_fulfillment` — is not new: `edge-api/shop` and `edge-api/driver` both already do it. Recorded below. |
| **IV. Auth Isolation** | ✅ PASS | The new service attaches to the **existing admin** authorizer by id from SSM. No new pool, no auth proxy, no cross-pool acceptance. Both gates are decided from the `admin.staff` **record**, never the claim; FR-015's split mirrors 046's. |
| **V. Design** | ✅ PASS | Monochrome, tokens from the design system, dark mode. **No cards** — sectioned pages, tables and detail rows, no metric row at the top. Reference is eBay Seller Hub's order management (research R9). ⚠ Flagged explicitly because an order detail is precisely where the card instinct fires. |
| **VI. Layered Architecture** | ✅ PASS | Handler → service → repository in the new service, raw SQL, explicit greppable wiring, no DI framework. The console keeps server state in TanStack Query and never hand-caches it. |
| **VII. Observability** | ✅ PASS | Four metrics and one alert declared in research R10. The alert is **not deferred** — 038 and 046 both deferred theirs, and this one guards the only message a web-only customer receives. |

**Post-Phase-1 re-check**: still passing. The design added no shared package, no new hue, no card
layout, no new pool, and no customer contract change. The single new cross-path write is the one already
recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/053-order-lifecycle-completion/
├── plan.md              # This file
├── spec.md              # WHAT/WHY (both clarifications settled)
├── research.md          # Phase 0 — R1..R11
├── data-model.md        # Phase 1 — tables, transitions, the two rule changes
├── quickstart.md        # Phase 1 — the validation walk
├── contracts/
│   ├── back-office-orders.contract.md
│   └── notification-channel.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_order_lifecycle_completion.sql      # carrier_handoff + package_arrival + notification_request.channel

apis/
├── core-api/internal/features/orders/
│   ├── stage.go                             # ⚠ ONE LINE: ready_for_pickup rank 2 → 1 (FR-016)
│   └── stage_test.go                        # the shop-shelf case, provable by reverting
├── edge-api/orders/                         # NEW cold-path service (research R7)
│   ├── serverless.yml                       # attaches to the shared gateway + admin authorizer by id
│   └── src/{orders,handoff,arrival,lib,functions}/
├── edge-api/driver/src/delivery/
│   └── repository.ts                        # ⚠ also writes package_arrival (source='driver_proof')
├── edge-api/customer/src/closure/
│   └── repo.ts                              # ⚠ ONE PREDICATE: <> 'collected' → <> 'delivered' (FR-023)
└── edge-api/notifications/src/worker/
    └── handler.ts, copy.ts                  # channel fan-out; the email branch

packages/
├── edge-shared/src/                         # ⚠ authz gates PROMOTED here, consumed by admin + orders
├── shared-types/src/order-admin.ts          # back-office order DTOs (separate family from the customer's)
└── email-kit/src/                           # NEW template: order-delivered

apps/back-office/src/
├── routes/orders.tsx
└── features/orders/                         # access.ts · model.ts · queries.ts · repo.ts ·
                                             # OrdersListScreen.tsx · OrderDetailScreen.tsx · components/
```

**Structure Decision**: a **new cold-path service** `apis/edge-api/orders` rather than a domain inside
`apis/edge-api/admin`. The forcing constraint is measured: admin declares 77 functions and already
carries `versionFunctions: false`, the mitigation 049 was forced to add when the driver routes tipped
that stack past CloudFormation's 500-resource limit. That lever is spent, and orders is the growth area
for the three slices queued behind this one (refunds, cancellation, returns). A3's gateway decomposition
exists for exactly this — a new service is an attachment, not a new gateway or a new pool. Everything
else extends a directory that already exists.

## Phase 0 — Research

Complete. See [research.md](research.md). Decisions that shape the build:

- **R3** — the handover is a **table, not a status**. `shop_fulfillment` is unchanged, which keeps the
  stage rank map edited for exactly one reason.
- **R5** — ⚠ the closure predicate is wrong in **both** directions, not one: an arrived order blocks and
  an in-transit one does not. The register that opened this feature understated it.
- **R6** — ⚠ the **existing driver path must also write** `package_arrival`, or every same-day arrival is
  unattributable and SC-010 is false.
- **R7** — ⚠ a **new service**, on a measured CloudFormation constraint.
- **R8** — one intent, two channels, on the outbox that already exists.

## Phase 1 — Design & Contracts

Complete: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

## Phase 2 — Tasks

Not produced here. Run `/speckit-tasks`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A **cold-path service writes `shop_fulfillment`**, a hot-path-owned table (Principle III) | The arrival is recorded by a back-office operator, which is cold-path work by definition. | Routing the write through `core-api` would put back-office RBAC on the hot path. It is also **not a new crossing**: `edge-api/shop` and `edge-api/driver` both already write this table, and recording an arrival is the same act the driver service performs, by a different actor. |
| A **new edge service** rather than a domain in `admin` | `admin` is at 77 functions with `versionFunctions: false` already spent; the 500-resource limit is real and was already hit once, in 049. | Adding ~6 routes to `admin` risks a mid-implementation stack failure whose only recovery is the split anyway — larger, and under pressure. ⚠ The arithmetic here is an **estimate**; the plan requires the resource count to be **measured** before building, not inferred. |
| **`notification_request` gains a `channel` dimension** | FR-019 needs a channel that reaches a customer with no app, and the arrival is one intent on two channels. | A second outbox table means a third drain, schedule and retry policy for a message whose idempotency already exists. Reusing `receipt_dispatch` was closer but blurs what that table means — it sends the receipt. |

## Risks

- **⚠ Nobody may actually record these arrivals.** With no carrier signal an order finishes only when a
  person says so. This plan makes completion *possible*, not automatic, and `order_completed_total`
  (R10) is the metric that will say whether it is happening. Recorded in the spec's Assumptions.
- **⚠ The CloudFormation estimate is an estimate.** Measure before building (R7).
- **⚠ A failed same-day delivery still strands its order** and becomes, after this ships, the last
  remaining way an order gets stuck. Deliberately out of scope, named in R11 and in the spec.
- **⚠ Nobody has looked at any of this.** 039 shipped four live defects with a fully green suite because
  layout, contrast and hierarchy are not properties a DOM assertion can see. The console is a new
  surface; it needs eyes, not only tests.
