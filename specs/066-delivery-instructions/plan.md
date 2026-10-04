# Implementation Plan: Customer Delivery Instructions

**Branch**: `066-delivery-instructions` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/066-delivery-instructions/spec.md`

## Summary

A customer gives delivery instructions at checkout — a handover preference ("Leave at the door" /
"Meet at the door") and a note of up to 250 characters — optionally saved as an address's default.
They are fixed on the order at placement and shown to the assigned driver, to back-office staff and
back to the customer.

Two columns on `public."order"` and two on `public.customer_address`, one additive migration. The
order's values are written by the hot path at payment intent, beside the address snapshot. They are
**deliberately not put inside the `delivery_address` jsonb**: that snapshot has fifteen readers
across seven services, including the shop console and the receipt email, both of which the spec
forbids from showing instructions (research R1).

The driver app needs almost nothing: three screens already render `instructions`, and the service
hard-codes `null` with a comment saying "whoever adds the field at checkout unblocks this line".

## Technical Context

**Language/Version**: Go (`apis/core-api`), TypeScript on Node 22 (`apis/edge-api/{customer,driver,orders}`,
`packages/shared-types`), TypeScript/React 19 (`apps/customer-web` on Next 16, `apps/back-office`),
Kotlin 2.4 / Compose Multiplatform (`apps/customer-mobile`, `apps/driver-mobile`)

**Primary Dependencies**: none new.

**Storage**: PostgreSQL 16, raw SQL, one forward-only Goose migration (four nullable columns, four
CHECKs).

**Testing**: `go test` (unit + container), Vitest (unit + container against the real migrations),
Kotlin `commonTest` (Android host + iOS simulator compile), four contract drift guards, the
customer-web bundle gate.

**Target Platform**: customer-web, customer-mobile (Android + iOS), driver-mobile, back-office;
Fargate (core-api); Lambda (edge services).

**Project Type**: monorepo — two backend paths, two web apps, two mobile apps.

**Performance Goals**: no new request on the checkout path; the instructions ride the existing
intent call. Address reads and the driver drop read gain columns, not queries.

**Constraints**: note ≤ 250 characters enforced server-side and in the database (FR-007, SC-009);
never in emails, analytics or logs (FR-027, FR-028); never shown to shops (FR-025); plain text
everywhere (FR-026); customer-web guest bundle gate must not move.

**Scale/Scope**: 1 migration; 3 contract files; hot path (checkout write, receipt read); cold path
(address CRUD, driver drop read, back-office order read); 4 client surfaces.

### Unknowns

All resolved in [research.md](research.md): where the order's instructions are stored (R1), which
path writes them and when (R2), validation in one place (R3), the saved default and prefill (R4),
what the driver contract carries (R5), unattended-drop behaviour (R6), keeping the text out of
emails, logs and telemetry (R7), deploy order and old clients (R8).

## Constitution Check

| Principle | Verdict | Note |
|---|---|---|
| I. Spec-driven | PASS | Spec has no tech. Nothing found in research sends a change back to it. |
| II. Shared contracts | PASS | The two handover values and the 250 limit are declared once in `packages/shared-types` and consumed by every surface; Kotlin is generated. The Go side cannot import TypeScript, so it carries one mirror, pinned by a cross-language test (the 028/047 wire-contract pattern). |
| III. Dual-path discipline | PASS | Checkout write and receipt read → hot path (commerce). Address book → cold path, where it already lives (`edge-api/customer/addresses`). Driver and back-office reads → cold path. No path gains a new kind of work. |
| IV. Auth isolation | PASS | No new route or authorizer. The driver read keeps its driver-scoped predicate (FR-022); the shop pool's reads are untouched and a guard proves they select neither column (FR-025). |
| V. Design | PASS | No new token. The checkout control is a sectioned row with two choice chips and a text field — no card. Driver screens reuse the existing `InstructionCallout`. |
| VI. Layered architecture | PASS | handler → service → repository on both backends; rows mapped to DTOs. |
| VII. Observability | PASS | One analytics event with a bounded enum and a boolean — never the text (below). |

**Gate result**: no violations. Complexity Tracking is empty.

### Telemetry declared (Principle VII)

| Event | Surface | Properties | Purpose |
|---|---|---|---|
| `checkout_delivery_instructions_set` | customer-web, customer-mobile | `handover` (`leave_at_door` \| `meet_at_door` \| `none`), `hasNote` (bool), `fromSavedDefault` (bool) | Adoption, and whether the saved default is doing its job. ⚠ Never the note, its length, or the address. |

⚠ Known state, not introduced here: PostHog is not initialised on customer-web and mobile telemetry
is deferred, so this event is declared and typed but emits nothing until those land.

## Project Structure

### Documentation (this feature)

```text
specs/066-delivery-instructions/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── delivery-instructions.md
└── checklists/requirements.md
```

### Source code

```text
db/migrations/
└── <ts>_delivery_instructions.sql              # NEW — 2 columns on "order", 2 on customer_address

packages/shared-types/src/
├── delivery-instructions.ts                    # NEW — HandoverPreference, DELIVERY_NOTE_MAX, DTO, normalise()
├── address.ts                                  # AddressDTO + create/update gain default instructions
├── checkout.ts                                 # CreateCheckoutIntentRequest gains deliveryInstructions
├── order.ts                                    # customer receipt DTO gains deliveryInstructions
├── order-admin.ts                              # back-office order detail gains deliveryInstructions
└── driver.ts                                   # DeliveryDropDTO gains handover
# + regenerated: contract/Dto.kt, contract/CommerceDto.kt, contract-driver/DriverDto.kt

apis/core-api/internal/
├── platform/deliveryinstructions/              # NEW — Normalise + Validate (the Go mirror) + wire test
└── features/
    ├── checkout/{handler,service,store}.go     # accept, validate, write at intent
    └── orders/orders.go                        # receipt read returns them

apis/edge-api/
├── customer/src/addresses/{model,repo,service,http}.ts   # default instructions on an address
├── driver/src/work/delivery.ts                 # instructions + handover from the order (was null)
└── orders/src/orders/{repository,service}.ts   # back-office order detail

apps/customer-web/
├── app/checkout/DeliveryInstructions.tsx       # NEW — chips + note + "save to this address"
├── app/checkout/CheckoutFlow.tsx               # holds the draft; sends it on intent
├── app/(account)/addresses/_components/AddressForm.tsx
└── components/receipt/                         # shows them on confirmation + order page

apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/
├── checkout/{domain,data,presentation}/        # draft, intent, receipt
└── addresses/{domain,data,presentation}/       # default instructions on the form

apps/back-office/src/features/orders/OrderDetailScreen.tsx

apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/features/delivery/
├── domain/Delivery.kt · data/HttpDeliveryRepository.kt   # handover
└── presentation/{EnRouteScreen,ArrivedScreen,DeliveryScreens,ProofScreens}.kt
```

**Structure decision**: the vocabulary and the normalisation rule live in one new shared-types
module that every TypeScript surface imports and both Kotlin contracts are generated from. Go gets
one small platform package rather than a rule restated in the checkout handler.

## Phase plan

1. **Foundation** — migration; shared-types module + contracts regenerated; Go mirror with its
   cross-language test. Nothing user-visible.
2. **US1 give instructions** — hot path accepts, validates and writes at intent; receipt read
   returns them; checkout control and receipt display on web and mobile.
3. **US2 driver reads them** — driver drop read returns note + handover; driver screens say the
   preference in words; "leave at the door" leads into the existing unattended-photo proof.
4. **US3 saved on an address** — cold-path address CRUD; address forms; checkout prefill, per-order
   override, "save to this address".
5. **US4 placed order keeps it** — container proofs that an address edit or delete moves nothing.
6. **US5 staff** — back-office order detail.
7. **Polish** — telemetry, the no-leak sweeps (emails, logs, shop reads), accessibility, parity
   registers, quickstart walk.

## Risks

| Risk | Mitigation |
|---|---|
| The text reaches a shop or an email through an existing address reader | It is not in the `delivery_address` jsonb. A guard test greps `edge-api/shop` and `edge-api/notifications` and fails naming any file that selects either column (R1, R7). |
| The limit is enforced in three languages and one drifts | One shared-types constant, a Go mirror pinned by a shared fixture, and a database CHECK as the backstop. A bypass test posts 251 characters straight at the hot path (SC-009). |
| Stored XSS in back-office or customer-web | Rendered as React text nodes; a test renders `<script>`, an `<a>` and a `javascript:` URL and asserts no element is created (SC-006). No `dangerouslySetInnerHTML` anywhere in the slice. |
| A gate code lands in logs | core-api's request logging is checked not to log bodies; the sweep in quickstart greps a walked session's logs for a sentinel note (SC-007). |
| Prefill overwrites what the customer typed when they switch address | The draft records whether it was edited; switching address replaces it only per FR-015, and a test pins both directions. |
| Old mobile builds send no instructions | The field is optional on the intent request; absent means none. Old builds keep working. |
| customer-web bundle gate (`/checkout` is not a guest route, but shared chunks are) | The control is a client component inside the already-client checkout flow; run the gate and compare to baseline. |

## Complexity Tracking

No constitution violations to justify.
