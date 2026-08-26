# Implementation Plan: Order Confirmation & Emailed Receipt

**Branch**: `dev` (no feature branch; the git extension is not installed) | **Date**: 2026-08-26 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/052-order-confirmation-invoice/spec.md`

**Artifacts**: [research.md](./research.md) · [data-model.md](./data-model.md) ·
[contracts/receipt.contract.md](./contracts/receipt.contract.md) · [quickstart.md](./quickstart.md)
**Design canvas**: https://claude.ai/code/artifact/b00826d5-9d64-45ae-b58b-96fb5d904f6e

---

## Summary

Redesign the order-complete page on both customer surfaces into a document-grade receipt, and email
that receipt to the customer when an order is paid — with a self-service resend.

The technical shape is smaller than the spec suggests, because three pieces already exist:
`unitPriceAmount` is **already on the wire** and simply never rendered (research R9); the
`order-confirmation` MJML template has been in `@effy/email-kit` since 038 with **no call site**; and
the 050 notifications service already runs a scheduled, idempotent outbox drain whose mechanics this
slice copies. The genuinely new work is one migration, one drain function, one resend route, a
server-derived order stage, a payment-method capture, and the two client redesigns.

Three findings shape it more than any design choice:

- ⚠ **The delivery promise is date-granular.** `promised_from`/`promised_to` are `date` columns. The
  design canvas drew a time window; that is corrected to a date range (research R4).
- ⚠ **A compliant tax invoice is not buildable**, and the two blockers are an unsupplied ABN and an
  unmodelled per-item GST treatment — neither of which is engineering work in this slice (R13).
- ⚠ **`notification_request` cannot carry this**, because its `UNIQUE` dedupe key is exactly what
  makes push exactly-once and exactly what would forbid a deliberate resend (R2).

---

## Technical Context

**Language/Version**: Go 1.25 (hot path) · Node 22 + TypeScript (cold path) · Kotlin 2.4.0 /
Compose Multiplatform 1.11.1 (mobile) · React 19 + TypeScript, Next.js 16 (web)

**Primary Dependencies**: Gin + pgx/v5 · Serverless Framework v3 · `@effy/email-kit` (MJML +
Handlebars, existing) · `@aws-sdk/client-sesv2` (existing) · `stripe-go/v82` (existing) ·
`@effy/shared-types`, `@effy/design-system` — **no new runtime dependency on any surface**

**Storage**: PostgreSQL 16, raw SQL, Goose, forward-only. One migration: 3 nullable columns on
`public.payment`, one new table `public.receipt_dispatch`.

**Testing**: `go test` (incl. testcontainers) · Vitest · Playwright · Kotlin `commonTest` +
`testAndroidHostTest` + the iOS simulator compile · `make email-check` · `tokens:check`

**Target Platform**: `apps/customer-web` (Next 16 SSR) · `apps/customer-mobile` (Android + iOS) ·
`apis/core-api` (Fargate) · `apis/edge-api/{customer,notifications}` (Lambda arm64)

**Project Type**: Full-stack vertical slice — two backend paths, two customer surfaces, one shared
email package.

**Performance Goals**: The receipt read stays inside the existing order-detail budget. ⚠ The email
send is **off every user path** — the resend route writes one row and returns; it never awaits SES.

**Constraints**: Gmail's ~102 KB email budget under a ≥25-item basket · WCAG AA on both surfaces in
both appearances · no fulfilment structure in any customer-facing payload · **no byte budget on
`/checkout/complete`** (research R7 — it is authenticated and outside the `(shop)` quarantine)

**Scale/Scope**: One migration · 1 new cold-path route · 1 new scheduled function · ~2 hot-path
read extensions + 1 write · 2 client redesigns · 1 email template rewrite.

---

## Constitution Check

*GATE — evaluated before Phase 0 and re-evaluated after Phase 1. Constitution v1.13.0.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-Driven** | ✅ PASS | spec → plan → tasks. ⚠ The spec was amended during planning rather than patched in code: **FR-018a** (the shared content column) was added after the operator raised it, and research R4's date-granularity finding corrects the design canvas, not just the implementation. |
| **II. Monorepo & Shared Contracts** | ✅ PASS | Every new field lands in `packages/shared-types/src/order.ts` and reaches mobile through the **generated** `CommerceDto.kt`, never a hand-written Kotlin type. The email lives in the existing `@effy/email-kit`; no second mailer. The status palette is the one thing deliberately **not** shared — see the exception below. |
| **III. Dual-Path Discipline** | ✅ PASS | Stated per responsibility in research R1: receipt **read** = hot (a latency-sensitive customer read, already there); receipt **send** = cold (async, off every user path); **resend** = cold (low-frequency action whose work is an email). Both rejected alternatives are recorded. |
| **IV. Auth Isolation** | ✅ PASS | The resend route sits behind the existing **customer** authorizer on the shared gateway; no new pool, no new client, no cross-pool call. ⚠ The route resolves the recipient **server-side from the authenticated subject** — the request body has no `email` field, because one would make it an open relay for a personalised document. |
| **V. Design** | ⚠ **PASS WITH ONE RECORDED EXCEPTION** | Monochrome ramp, General Sans, pinned radii, dark mode, AA — all from the design-system SSOT. **Card layouts**: justified below. **A third hue**: the amber same-day badge is a genuine exception, recorded in Complexity Tracking. |
| **VI. Layered Architecture** | ✅ PASS | Three-layer slices throughout: `handler → service → repository` in Go and in the edge service; `ViewModel → UseCase → Repository` on mobile. Raw SQL, no ORM, explicit wiring. ⚠ The stage rollup is a **pure function** in the service layer, unit-testable without a database. |
| **VII. Observability** | ✅ PASS | Declared in research R10: three product events, drain outcome counters, and a send-failure alarm. ⚠ The alarm is **in scope** rather than deferred — 038 and 046 both deferred theirs with "the service already logs it", and this slice's entire premise is that a missing receipt is invisible until a customer complains. |
| **Real-World Identifiers** | ✅ PASS | The ABN, legal entity name and registered address stay **unsupplied placeholders**; FR-031 requires their **absence**, not placeholder text, and SC-012 proves it. `hello@effyshopping.com` is the approved customer-facing mailbox and the only address the receipt shows. |
| **Technology Standards** | ✅ PASS | No locked technology swapped. No new library on any surface. |

### Principle V — card-layout justification (required by the principle itself)

The receipt renders inside bordered containers. That is **not** the banned pattern:

- The banned pattern is a **dashboard aesthetic** — tiled content boxes and metric/summary cards at
  the top of a page. This page has no metric cards, no summary cards, and no tiling.
- A receipt is a **document**. The border is the edge of the paper and the shaded block is a totals
  block — both are the conventional anatomy of an invoice, and eBay/Amazon order detail (Principle
  V's own reference platforms) render exactly this.
- The alternative the principle prefers — sectioned pages, tables, detail rows — is what the
  document's *interior* already is: a line-item table, a totals table, and labelled detail rows.

---

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **A third UI hue** — amber `#b45309` (light) / `#f0a04b` (dark) for the same-day badge, against Principle V's "exactly two semantic colours … no third hue may be introduced as a UI colour" | Same-day and standard are the delivery distinction the customer paid a different fee for, and the one status on the receipt that is genuinely *time-critical*. Operator direction on 2026-08-26 explicitly asked for badges and colour. | **Monochrome-only was offered and not chosen.** It remains buildable (weight and fill can distinguish two states), so this is a product decision, not a technical necessity — which is exactly why it is recorded here rather than argued as inevitable. |

**Bounds on the exception** — the same ones 039's FR-005a established for the storefront's coloured
panels, and each is mechanically checkable (SC-010):

1. It is a **component-local constant**, one per surface. It does **not** enter `tokens.css`, and
   `tokens:check` must pass **unchanged** — that is the proof it never became a design token.
2. It is **never surfaced to the mobile Compose theme**, so no `EffyTheme` colour is added.
3. It is **never** a page accent, fill, border, or body-text colour. Its only use is a status
   indicator.
4. ⚠ **The hue is never text.** The badge is a tinted pill with a coloured **dot** and a
   ramp-coloured **label** — which is also what keeps `--success` inside its constitutional bound
   (it clears 3:1 as a non-text indicator and fails 4.5:1 as text, which is why it has no
   `-foreground` pair).
5. **Colour is never the sole carrier**: remove every hue and the document still reads correctly.
6. Removal is **deleting one definition**.

No constitution amendment is proposed. If this palette later wants to be a platform-wide status
system, that is an amendment with its own evidence — not a side effect of a receipt redesign.

---

## Project Structure

### Documentation (this feature)

```text
specs/052-order-confirmation-invoice/
├── plan.md                        # This file
├── spec.md
├── research.md                    # Phase 0
├── data-model.md                  # Phase 1
├── quickstart.md                  # Phase 1
├── contracts/
│   └── receipt.contract.md        # Phase 1
├── checklists/requirements.md
└── tasks.md                       # /speckit-tasks — NOT created here
```

### Source code

```text
db/migrations/
└── <ts>_order_receipt.sql                     # NEW — payment.method_*, public.receipt_dispatch

packages/
├── shared-types/src/order.ts                  # EDIT — stage, paymentMethod, deliveryPromises, item imageUrl
└── email-kit/
    ├── src/catalog.ts                         # EDIT — widen `order-confirmation` vars (id KEPT)
    ├── src/templates/order-confirmation.mjml   # REWRITE
    └── src/generated/                         # REGENERATED — committed, drift-guarded

apis/core-api/internal/
├── features/orders/                           # EDIT — image join, promise read, stage on the DTO
│   └── stage.go                               # NEW — the pure rollup (research R5)
└── features/checkout/
    └── store.go                               # EDIT — capture the method summary AFTER commit

apis/edge-api/
├── customer/src/receipts/                     # NEW — the resend slice (handler/service/repository)
└── notifications/src/receipts/                # NEW — the receipt drain (a sibling of worker/drain.ts)

apps/customer-web/app/
├── checkout/complete/page.tsx                 # REDESIGN — `container`, two-column, full document
└── (account)/orders/[id]/page.tsx             # EDIT — same document, same column (research R12)

apps/customer-mobile/shared/src/commonMain/kotlin/.../features/checkout/
├── domain/Receipt.kt                          # EDIT — carry unit price, stage, promise, method
└── presentation/ReceiptScreen.kt              # REDESIGN
```

**Structure Decision**: the platform's standard vertical slice. Each new backend area is a
three-layer slice (`handler → service → repository`); the receipt drain mirrors
`notifications/src/worker/` — a pure, dependency-injected `drainOnce` with the repository and the
mail client injected, so it is unit-testable with fakes and no cloud access, exactly as 050's is.

---

## Phase 0 — Research

**Complete** → [research.md](./research.md). Thirteen findings; no `NEEDS CLARIFICATION` remains.
The four that change what gets built:

- **R2** — `receipt_dispatch` is a new table, not a reuse of `notification_request`.
- **R3/R4** — the payment method is captured **after** the finalize commit; the promise is a **date**.
- **R9** — unit price is already on the wire, so half of FR-003 is a client fix.
- **R13** — the two tax-invoice prerequisites, written down so they are tracked rather than
  rediscovered (FR-034).

## Phase 1 — Design & Contracts

**Complete** → [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md). Agent context updated to point at this plan.

### Post-design Constitution re-check

Re-evaluated after the artifacts existed. **No verdict changed.** Two things were confirmed rather
than assumed:

- **Principle II held under pressure.** The temptation was a hand-written Kotlin `OrderStage` enum
  to avoid regenerating the contract. The contract records the generated path instead, plus the
  `WireInt` rule — because 027 R13 is the precedent where a hand-shaped mobile type silently broke
  every write and 100 tests missed it.
- **Principle IV held under pressure.** The temptation was an `email` field on the resend request so
  a shopper could send a receipt elsewhere. Rejected in the contract: it turns an authenticated route
  into an open relay for a document containing someone's name, address and purchase history.

---

## Risks

| Risk | Mitigation |
|---|---|
| ⚠ **A receipt is emailed for an order that is not paid** | The dispatch row is written only inside the existing status-guarded `pending_payment → paid` transaction, which already runs exactly once per order under duplicated webhooks. |
| ⚠ **Back-receipts flood existing customers on first deploy** | No backfill, deliberately (data-model §5). Only orders paid after deploy enqueue. |
| ⚠ **The stage rollup disagrees between surfaces** | It is server-derived and on the DTO; no client computes it (R5). |
| ⚠ **The email grows past the Gmail budget** | `make email-check` gates it under a ≥25-item render; the guard already exists and already names the offending template. |
| ⚠ **The status palette leaks into the design system** | `tokens:check` must pass **unchanged** — SC-010 is a mechanical proof, not a promise. |
| **Stripe's method capture fails** | Best-effort and post-commit; the receipt omits the line. A paid order is never at risk. |
| ⚠ **Two pages render the same document at two widths** | R12 — `/checkout/complete` and `(account)/orders/[id]` move to `container` **together**. |

---

## Out of scope (restated from the spec, so tasks cannot drift into it)

PDF attachment · print stylesheet · GST modelling and any tax calculation · refunds and
cancellations · live tracking or a re-estimated arrival · post-purchase merchandising ·
receipts for any audience but the customer · any change to checkout or payment itself.
