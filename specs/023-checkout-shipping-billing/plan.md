# Implementation Plan: Checkout Shipping & Billing Addresses

**Branch**: `023-checkout-shipping-billing` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-checkout-shipping-billing/spec.md`

---

## Summary

Two connected capabilities on both customer surfaces at parity: (1) **rich checkout address selection**
— reconcile the 019 checkout flow to the 022 Address Book (default pre-selected, switch to a saved
address, or add a new one inline via the shared responsive form); and (2) **shipping + billing address
per order** — the order already snapshots a delivery (shipping) address; add a **billing** snapshot that
defaults to *exactly* the shipping address via a "same as shipping" toggle (ON by default) and may
diverge. Both snapshots are immutable at placement. The **shop (020) sees the shipping address only —
billing never reaches it**, which the design makes true *by construction* (a separate column the shop's
queries never select).

**Technical approach** — five moving parts, all extending proven seams:

1. **Migration (one, forward-only)** — `public."order"` gains a **nullable** `billing_address jsonb`.
   `NULL` means "same as shipping" (makes FR-016's receipt text and FR-013 trivial, and keeps the common
   case zero-duplication). The existing `delivery_address` **is** the shipping snapshot (formalised, not
   renamed — avoids churning 019/020/021 readers).
2. **core-api checkout (hot path)** — `IntentInput` gains an optional `BillingAddressID`; `CreateCheckoutIntent`
   snapshots it into `billing_address` when it differs from the shipping address (else writes `NULL`). The
   order INSERT/UPDATE in `store.go` carries the new column. A new-address-at-checkout is created through
   the **cold-path** address book first (US3), then its id flows in like any saved address.
3. **core-api orders (hot path)** — the receipt/history DTO gains `billingAddress` (nullable → "same as
   shipping").
4. **customer-web + customer-mobile checkout** — replace the bare inline `AddressForm` with a saved-address
   **picker** (default pre-selected) + **add-new** (reuse 022's `ResponsiveModal` / mobile bottom sheet) +
   a **"Billing same as shipping"** toggle that reveals a billing picker/new-address when OFF. Receipts show
   both. Parity.
5. **020 fulfilment (shop, cold path) — exposure guard, not a data change** — the shop repository already
   selects **only** `o.delivery_address`; adding `billing_address` as a separate column means billing is
   *structurally* out of every shop query and payload. The 020 amendment is a **guard test** proving no
   shop-facing SQL/DTO ever names billing (FR-018), plus a documented note.

---

## Technical Context

**Language/Version**: Go 1.25 (core-api checkout/orders) · React 19 + TypeScript (customer-web) ·
Kotlin 2.4.0 + Compose Multiplatform 1.11.1 (customer-mobile) · TypeScript (edge-api/shop guard test).

**Primary Dependencies**: existing only — pgx/v5 + raw SQL (core-api); Stripe `stripe-go/v82`
(unchanged); `@effy/design-system/ui` `ResponsiveModal`/`Drawer` + the 022 saved-address list; Compose
Material 3 (`ModalBottomSheet`, `FloatingActionButton`); Ktor + generated `CommerceDto.kt`. **No new
library.**

**Storage**: PostgreSQL 16 — `public."order"` gains `billing_address jsonb` (nullable). One forward-only
Goose migration. `public.customer_address` unchanged (reused, 022).

**Testing**: `go test` (checkout intent billing-snapshot + orders DTO; testcontainers for the migration
column) · Vitest + RTL (customer-web checkout address section, billing toggle, receipt) · Kotlin
`commonTest` (mobile checkout ViewModel) · Vitest (edge-api/shop **no-billing** guard test).

**Target Platform**: core-api (local Docker) · modern browsers · Android + iOS.

**Performance Goals**: unchanged — checkout is already a re-price-on-change flow; billing adds at most one
address snapshot read at placement. No new latency surface.

**Constraints**: billing defaults to shipping and may diverge (FR-008–FR-013); both snapshots immutable
(FR-014/FR-015); **billing never reaches the shop** (FR-018, the hard boundary); re-price on shipping
change before pay (FR-005); parity (FR-020); own-addresses-only (FR-021); **no card layouts** (FR-022);
no address PII to the wrong audience in telemetry (SC-009).

**Scale/Scope**: dev-scale. Net change: 1 migration column, ~2 hot-path files touched, receipt DTO + both
client checkout flows, 1 shop guard test.

---

## Path Assignment (Principle III — mandatory declaration)

> **Checkout intent, the order snapshot, and the receipt → `core-api` (hot).** Checkout amount + order
> finalization are commerce (019 FR-028, hot path, explicit). The billing snapshot is written on the hot
> path inside the same order-placement path as the shipping snapshot — checkout **data access**, exactly
> as `delivery_address` is written today. Re-pricing on a shipping change (021) is already hot-path.
>
> **The saved-address list read + new-address create at checkout → `edge-api/customer` (cold).** The
> checkout **picker** reads the 022 Address Book, and "add a new address at checkout" writes to the book —
> both on the cold path (022, the routing law), then the chosen address **id** flows into the hot-path
> intent. core-api validates/snapshots that id by reading `public.customer_address` **directly** (as it
> already does), so a just-created address is immediately visible.
>
> **Shop fulfilment exposure → `edge-api/shop` (cold), unchanged.** The shop reads only `delivery_address`;
> billing is a separate column it never selects. No proxying, no new exception. Recorded per
> [docs/api/path-assignment.md](../../docs/api/path-assignment.md).

No Principle-III exception is required.

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| **I. Spec-Driven** | ✅ PASS | spec (6 US / 22 FR / 9 SC, 0 markers) → this plan → tasks next. |
| **II. Monorepo & Shared Contracts** | ✅ PASS | Reuses the `AddressDTO` + order DTOs; the billing field is added **once** to `@effy/shared-types` (order + checkout) and generated to Kotlin. Reuses the design-system `ResponsiveModal` + the 022 saved-address list; no per-surface redefinition. |
| **III. Dual-Path Discipline** | ✅ PASS | Checkout/order/receipt on the hot path (commerce); address book read/write on the cold path (022); shop exposure on the cold path unchanged. Declared above; no exception. |
| **IV. Auth Isolation** | ✅ PASS | Customer pool throughout; every checkout/order query customer-scoped from the subject, never client input (FR-021). The shop boundary (FR-018) is an audience-isolation guarantee — billing PII never crosses to the shop audience. |
| **V. Native-Feel, Consistent Design** | ✅ PASS | Address selection is a **list/picker**, not cards (FR-022, R6). Reuses the responsive add form (dialog/drawer web, bottom sheet mobile) + fat-finger targets. Dark mode + tokens inherited. |
| **VI. Layered Architecture** | ✅ PASS | Backend service/repository over raw SQL, explicit wiring; web server-state via the app's existing pattern (no hand-cached server data); mobile MVVM immutable UiState. No DI framework. |
| **VII. Observability & Telemetry** | ✅ PASS | Declared below. |

**Result: PASS. No new library, no migration-splitting, no Principle-III exception. No unjustified
violations.**

### Telemetry declaration (Principle VII)

- **Product events (PostHog, customer-web)**: extend the existing checkout funnel with
  `checkout_address_changed`, `checkout_address_added`, `checkout_billing_diverged` — **no address
  fields**, subject id only (SC-009). Mobile telemetry deferred (the standing 013/014/015/020/021/022
  pattern), recorded not skipped.
- **The shop boundary is a telemetry constraint too**: no billing address in any shop-side log, metric, or
  event (FR-018 / SC-007). core-api/shop structured logs never log a billing snapshot.

---

## Project Structure

### Documentation (this feature)

```text
specs/023-checkout-shipping-billing/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/checkout-addresses.contract.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
db/migrations/
└── 2026072XXXXXXX_order_billing_address.sql            # NEW — ALTER order ADD billing_address jsonb (nullable, NULL = same as shipping)

apis/core-api/internal/features/checkout/               # HOT PATH
├── service.go                                          # MODIFIED — IntentInput.BillingAddressID; snapshot billing when divergent
├── store.go                                            # MODIFIED — order INSERT/UPDATE carries billing_address; a billing snapshot read
└── *_test.go                                           # billing same-as (NULL), divergent (snapshot), invalid billing id
apis/core-api/internal/features/orders/                 # HOT PATH
├── orders.go / handler.go                              # MODIFIED — receipt/history DTO gains billingAddress (nullable → "same as shipping")
└── orders_test.go                                      # both-addresses on the receipt; same-as vs divergent

apis/edge-api/shop/src/fulfillments/                    # COLD PATH — exposure guard, NO data change
└── no-billing.guard.test.ts                            # NEW guard — assert no shop SQL/DTO names billing (FR-018)

packages/shared-types/src/
├── order.ts                                            # MODIFIED — OrderDTO.billingAddress?: OrderAddressDTO | null
├── checkout.ts                                         # MODIFIED — CreateCheckoutIntentRequest.billingAddressId?: string | null
└── contract/CommerceDto.kt                             # REGENERATED (commerce-contract:gen)

apps/customer-web/app/checkout/                         # customer-web
├── CheckoutFlow.tsx                                    # MODIFIED — saved-address picker + add-new + billing toggle/picker
├── AddressPicker.tsx / BillingSection.tsx (NEW)        # the picker + the "same as shipping" section
└── *.test.tsx                                          # pre-select default, switch, add-new, billing same/divergent, re-price
apps/customer-web/app/(account)/orders/[id]/…, checkout/complete/…   # MODIFIED — show both addresses (same-as text)

apps/customer-mobile/shared/src/commonMain/.../features/checkout/    # customer-mobile (MVVM)
├── presentation/ (CheckoutViewModel, CheckoutScreen)   # MODIFIED — address picker + add-new (bottom sheet) + billing toggle
└── data/CheckoutMappers.kt + contract                  # MODIFIED — billingAddressId out, billingAddress in

specs/020-shop-order-fulfillment/                       # AMENDMENT (doc) — record the shipping-only exposure + guard
docs/audiences/customer-capabilities.md                 # MODIFIED — §023 rows
```

**Structure Decision**: no new organising idea. One migration column, the checkout intent + order
snapshot extended on the hot path, the receipt DTO extended, and both client checkout flows rebuilt
around the 022 saved-address list + responsive form. The shop side is a guard, not a change.

---

## Design Notes (Phase 1 outcomes)

**`billing_address` is nullable; `NULL` = "same as shipping"** (R1). The order already stores the
shipping snapshot as `delivery_address`; billing is a *second* snapshot written **only when it diverges**.
This makes FR-016 ("same as shipping" text) and FR-013 (toggle back ON discards the divergent choice) fall
out of the representation, keeps the common case zero-duplication, and means the receipt computes billing
as `COALESCE(billing_address, delivery_address)`.

**`delivery_address` stays the shipping snapshot — not renamed** (R2). Renaming would churn every 019/020/
021 reader (core-api orders, edge-api/shop fulfilment, both clients, the CommerceDto) for a cosmetic gain.
"Shipping" is formalised in docs and DTO labels; the column keeps its name.

**The shop boundary is enforced by column separation, not by filtering** (R3). The shop fulfilment query
already selects `o.delivery_address` and nothing else from the order; a *separate* `billing_address` column
is unreachable from it. FR-018 is proven by a **guard test** asserting no shop-side SQL or DTO names
billing — cheaper and stronger than a runtime redaction.

**New-address-at-checkout reuses the cold-path create** (R4). "Add address" at checkout is the same write
as the Address Book's (022, `POST /customer/v1/addresses`); the returned id is then used as the shipping
(or billing) selection. No new address-write path on the hot side.

**Billing selection is a snapshot, not a saved "billing address"** (R5). There is no billing-address type
or column on `customer_address`; the customer picks/enters an ordinary address and the order snapshots it.
This matches the spec's Key Entities and keeps the address book single-purpose.

**Stripe billing_details** (R6) — out of scope to *send* to Stripe in this slice; the order records the
billing address for the platform's receipt/invoice. Wiring `billing_details` into the PaymentIntent is a
recorded follow-up (no behaviour change to the amount).

---

## Complexity Tracking

No entries. No new library, no migration split, no Principle-III exception, no card layout. The one
schema change is a single nullable column; the shop boundary is a separation-of-columns guarantee proven
by test. The standing **mobile-telemetry deferral** (Principle VII) is inherited and declared above.

---

## Dependencies & sequencing note

- **Depends on 022 being present** — checkout reads the Address Book (`/customer/v1/addresses`) and reuses
  its `ResponsiveModal` + saved-address list. 022 (and 021) are still uncommitted in the tree; this slice
  builds on them.
- **020 amendment is doc + guard only** — no shop data or UI change; the shipping-only exposure already
  holds and is locked by the new test.
