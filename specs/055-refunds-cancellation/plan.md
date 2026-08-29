# Implementation Plan: Refunds & Order Cancellation

**Branch**: `055-refunds-cancellation` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/055-refunds-cancellation/spec.md`

## Summary

Give Effy the ability to give money back. Closes gap **G3** — the platform can take payment and has no
way to return it, while already publishing a policy that promises four refund outcomes and a
cancellation control that does not exist.

The approach follows the money. **Issuing a refund lives in `core-api`**, because that is where the
payment secret lives and it is the only place that can both call the provider and answer the operator's
one real question — *did the money go?* `core-api` gains a **second pool verifier** for back-office
staff, which Principle IV explicitly permits (per-pool validation, pinned issuer) and which is not the
auth-brokering it forbids. The back-office console reads the order from `edge-api/orders` as it does
today, and calls `core-api` to act.

Three things from Phase 0 shaped the design more than the requirements did: a refund is a **state
machine** the bank can reject 30 days later (R2); there is **no free cancellation** because Effy captures
at payment, so cancelling *is* refunding (R3); and refunded totals are **derived from the refund rows,
never stored**, which is the same call 027 made for promo redemptions and what makes FR-024 automatic
(R7).

## Technical Context

**Language/Version**: Go 1.25 (hot path) · Node 22 + TypeScript (cold path) · React 19 + TypeScript
(back-office, customer-web) · Kotlin 2.4 / Compose Multiplatform (customer-mobile, shop-mobile)

**Primary Dependencies**: Gin, pgx/v5, raw SQL, `stripe-go/v82` (already present — the Refunds API is
new surface on an existing client, not a new dependency); Serverless Framework v3 + `@effy/edge-shared`;
TanStack Query/Router + `@effy/design-system`; `@effy/shared-types` with the existing Kotlin generators.
**No new third-party dependency in any surface.**

**Storage**: PostgreSQL 16, Goose forward-only. One migration: `public.refund`, `public.refund_line`,
`public.refund_request`, plus two CHECK widenings (`stock_movement.reason`, `shop_fulfillment.status`).

**Testing**: `go test` incl. container-backed proofs for the refund ceiling under concurrency and
webhook idempotency; Vitest (edge services, consoles); Kotlin `commonTest` + `testAndroidHostTest` and
the iOS simulator compile.

**Target Platform**: Fargate (hot path) · Lambda arm64 behind the shared gateway (cold path) ·
Amplify-hosted consoles and storefront · Android + iOS.

**Project Type**: Monorepo vertical slice touching money — 1 migration, hot-path service + a new admin
route group, 2 cold-path services, back-office, customer-web, customer-mobile.

**Performance Goals**: the refund action returns a definite answer within one provider round trip;
reading an order gains no additional round trip (refund totals come back with the order, not after it).

**Constraints**:
- ⚠ The Stripe secret MUST NOT leave `core-api` (019 SC-012). This is what decides R1.
- ⚠ The refund ceiling MUST hold under concurrency — two staff refunding at once (SC-002).
- The paid transaction is untouched. Nothing here runs inside `FinalizeSucceeded`.
- ⚠ `apis/edge-api/admin` remains at 434/500 CloudFormation resources with `versionFunctions: false`
  spent. No route may be added to it; `edge-api/orders` (6 functions) has room.

**Scale/Scope**: 1 migration · **6 new hot-path routes** (4 back-office, 2 customer) plus three existing
responses gaining fields · **1 new cold-path route** (the shop's unfulfillable exit) plus two existing
reads extended · **5 surfaces changed** (back-office, customer-web, customer-mobile, shop-web,
shop-mobile) · 1 email template · **1 published legal document superseded**.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1. Constitution v1.13.0.*

| Principle | Assessment |
|---|---|
| **I. Spec-Driven** | Spec written, then clarified (5 questions). Two findings that contradict the spec's own starting assumptions are recorded in [research.md](./research.md) R3/R11 rather than patched in code. ✅ |
| **II. Monorepo & Shared Contracts** | Refund DTOs enter `@effy/shared-types` and reach mobile through the existing generators with their `:check` drift guards. The refund service is written once in `core-api` and serves both the customer and back-office routes — the difference is the gate, not the logic. ✅ |
| **III. Dual-Path Discipline** | Declared per work item in [research.md](./research.md) R4. Money and provider calls on the hot path; console reads and the shop's fulfilment exit on the cold path. ✅ |
| **IV. Auth Isolation** | ⚠ **The one that needed thinking about.** `core-api` gains a **back-office** `PoolVerifier` alongside the customer one. This is per-pool validation with a pinned issuer — the sanctioned shape — and explicitly **not** the auth proxy the principle forbids. The alternative (the cold path forwarding an operator's token to `core-api`) *would* have been. Write authority is decided from the `admin.staff` record, never from the claim. ✅ |
| **V. Design** | Refunds appear as detail rows and tables in the existing 053 order console and on the existing order pages. **No cards.** Monochrome — a failed refund is carried by weight and words, with the platform's error colour used only where it is genuinely an error state. ✅ |
| **VI. Layered Architecture** | handler → service → repository in Go and TS; ViewModel → UseCase → Repository on mobile. Raw SQL, no ORM. The provider call sits behind the existing `PaymentGateway` interface, extended — not a second way of talking to Stripe. ✅ |
| **VII. Observability** | Four counters, two alerts ([research.md](./research.md) R9). ⚠ **The alerts are written and inert** — no Prometheus stack exists. Recorded in Complexity Tracking. ✅ with a recorded deviation. |
| **Real-World Identifiers** | None introduced. ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/055-refunds-cancellation/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/refunds-api.contract.md
├── checklists/requirements.md
└── spec.md   (tasks.md comes from /speckit-tasks)
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_refunds_cancellation.sql         # NEW — refund, refund_line, refund_request;
                                          #   widens stock_movement.reason + shop_fulfillment.status

apis/core-api/
├── cmd/core-api/main.go                  # EDIT — back-office PoolVerifier (R1); CORS origin; routes
├── internal/platform/auth/               # EDIT — a back-office staff gate reading admin.staff
├── internal/platform/metrics/metrics.go  # EDIT — 4 counters (R9)
└── internal/features/refunds/            # NEW — the whole domain
    ├── service.go                        #   ceiling, kinds, idempotency, classification (FR-005d)
    ├── repository.go                     #   SUM-under-lock ceiling; append-only refund rows
    ├── handler.go                        #   customer routes + back-office routes, one service
    ├── webhook.go                        #   refund.updated / refund.failed → recorded state
    └── stock.go                          #   FR-030 return, only where knowable (R8)

apis/core-api/internal/features/checkout/
├── gateway.go / stripegateway.go         # EDIT — CreateRefund + refund events on the EXISTING client
└── handler.go                            # EDIT — route the new event types to refunds

apis/edge-api/orders/src/                 # EDIT — read refunds, requests and proposals on the order
apis/edge-api/shop/src/fulfillments/      # EDIT — US6's unfulfillable exit

packages/shared-types/src/refund.ts       # NEW  (+ regenerated Kotlin contracts)
packages/email-kit/                       # NEW  — 12th template: refund confirmation
packages/legal-content/src/documents/refunds-returns/v2.md   # NEW — ⚠ FR-016a supersedes v1
packages/legal-content/src/generated/documents.ts            # REGENERATED (legal:gen) — committed
apps/customer-mobile/.../legal/generated/LegalContent.kt     # REGENERATED — committed

apps/back-office/src/features/orders/     # EDIT — issue, dismiss a proposal, read the history
apps/customer-web/app/(account)/orders/   # EDIT — cancel, request, and what was refunded
apps/customer-mobile/.../features/orders/ # EDIT — the same, at parity
apps/shop-web/src/features/…              # EDIT — US6's unfulfillable control
apps/shop-mobile/shared/…/features/…      # EDIT — the same, at parity (FR-030 shop parity)

infra/observability/alerts/055-refunds-cancellation.yml   # NEW — written and inert (R9)
```

**Structure Decision**: one new hot-path feature package plus edits to what already exists. The only
structural novelty is the back-office route group inside `core-api`, which is R1's consequence.

## Phase ordering

1. **Migration + the refund domain read-only** — records and totals, with nothing able to issue yet.
2. **US1 staff refunds** — the provider call, the ceiling, idempotency. The money starts moving.
3. **US4 the failure path** — webhooks, retries, the honest state. ⚠ Before any customer sees a refund.
4. **US2 cancellation** + the legal prose correction (FR-016a) — they ship together or the policy lies.
5. **US5 customer visibility** + the email.
6. **US3 customer requests** and **US6 the shop exit** — both cuttable.

⚠ **Step 3 before step 5 is deliberate.** Showing a customer "refunded" before the platform can learn
that a refund failed would mean confidently telling people money is on its way when it is not.

## Risks

- **⚠ This slice moves real money, and a bug is not a wrong pixel.** The ceiling (SC-002) and
  idempotency (SC-003) are container-backed proofs, not unit tests with fakes, because both are
  database properties. 054's lesson stands: run them with Docker up or they silently skip.
- **⚠ The back-office verifier is new attack surface on `core-api`.** Until now it accepted only
  customer tokens. The negative proof — a customer token must be rejected by an admin route and vice
  versa — is a first-class task, not polish.
- **A partial refund's arithmetic must reconcile.** 051/052 twice shipped a receipt whose lines did not
  add up; a refund adds a second set of numbers to the same document.
- **The reversal problem** (R2): a refund issued soon after payment may show the original charge simply
  disappearing, with no credit line. FR-026's wording must not promise a credit the customer will not
  see.
- **Nobody has looked at any of this.** 039 shipped four live defects with a fully green suite.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **Principle VII — the alerts are specified, not live** | A failed refund is money the platform believes it returned and did not; it must be alertable. The rule ships to `infra/observability/alerts/`, the home 032 created. | No Prometheus stack exists and nothing scrapes `/metrics` — a pre-existing platform gap this slice inherits (054 recorded the same). A CloudWatch alarm would put this slice's alert on a different mechanism from every hot-path metric beside it, and there is still no log metric filter anywhere in the repository to hang one on. |

*No other deviation.* The back-office verifier in `core-api` is **not** one — it is the shape Principle
IV sanctions, and the rejected alternative is the one that would have violated it (R1).
