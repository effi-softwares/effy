# Implementation Plan: Customer Payment Experience

**Branch**: `051-customer-payment-experience` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/051-customer-payment-experience/spec.md`

## Summary

Rebuild the checkout payment step on both customer surfaces so it is about paying and nothing else, in
Effy's own design language, offering every payment option an Australian Effy can actually accept.

The technical shape, from [research.md](./research.md): **Effy draws everything except the PCI-scoped
inputs and the wallet buttons.** On web that means Stripe's split card elements (`CardNumberElement` /
`CardExpiryElement` / `CardCvcElement`) mounted inside Effy's own field shells, an Express Checkout
Element for the wallet row, and a Payment Element confined to the redirect-based methods. On mobile it
means Stripe's **in-app Embedded Payment Element** — which renders a method list inside an Effy screen
and exposes the selection as an observable — with Effy owning the chrome, the amount and the pay button.

Three server changes, all additive: one nullable `stripe_customer_id` column on `public.customer`, a
CustomerSession minted alongside every PaymentIntent, and two new routes for listing and removing kept
cards. The settlement path — server-authoritative amount, deterministic idempotency, the
signature-verified webhook finaliser — is **not touched**.

Two things gate delivery and neither is code: **no payment method domain is registered**, which is why
the wallet row has never rendered; and **coloured payment marks need a MINOR constitution amendment**
widening Principle V's third-party-mark exception from sign-in marks to third-party marks generally.

## Technical Context

**Language/Version**: Go 1.x (`apis/core-api`) · TypeScript 5.x / React 19 / Next.js 16 (`apps/customer-web`) · Kotlin 2.4.0 + Compose Multiplatform 1.11.1 (`apps/customer-mobile`) · SQL (Goose)

**Primary Dependencies**: `stripe-go/v82` (unchanged) · ⚑ `@stripe/stripe-js` 9.10.0 + `@stripe/react-stripe-js` 6.8.0 (**already installed; no dependency change on web**) · `stripe-android` (⚠ `EmbeddedPaymentElement` — version bump required) · `StripePaymentSheet` for iOS via SPM · `@effy/design-system` tokens as the single source for both Appearance objects

**Storage**: PostgreSQL 16, raw SQL, Goose. **One forward-only migration, one nullable column.** No new table — kept cards are provider-held and deliberately never mirrored ([data-model.md](./data-model.md) § 2)

**Testing**: `go test` (checkout service, billing-details derivation, customer get-or-create idempotency, payment-method ownership) · Vitest (web payment step, appearance mapping, failure states) · Playwright (the payment walk on a production build) · Kotlin `commonTest` + `:shared:testAndroidHostTest` + `compileKotlinIosSimulatorArm64` **and** `compileTestKotlinIosSimulatorArm64` (033's lesson: the iOS *test* compilation is a separate gate and had never run) · `make email-check` unaffected

**Target Platform**: Web (modern browsers, PPR/SSR) · iOS 15+ and Android minSdk 24 / target 36 · Fargate ARM64 for the hot path

**Project Type**: Multi-surface vertical slice — hot-path Go service + two customer clients + one migration

**Performance Goals**: The payment step is interactive within the storefront's existing budget; the intent call stays inside the 12 s checkout timeout set in 027. ⚠ The intent call now also mints a customer session — one extra provider round trip on a path that 027 already found latency-sensitive at ~135 ms per Sydney RDS hop. Mint it **concurrently** with the intent, not after it.

**Constraints**: No card data may touch Effy, be logged, or be stored, in any environment (FR-025, SC-012) · The amount charged must equal the amount shown, to the cent (FR-005) · No shopper may be charged twice by any sequence (FR-038) · `apps/customer-web`'s guest-route bundle gate is **unaffected** — ⚑ verified: `scripts/bundle-budget.mjs` does not list `/checkout`, so the added elements cost the gated routes nothing · Dark mode required on both surfaces · Australia and AUD only

**Scale/Scope**: 2 client surfaces × (1 rebuilt payment step + 1 new account screen) · 1 hot-path service extended · 2 new routes + 1 changed response · 1 migration · 6 user stories, 49 functional requirements, 16 success criteria

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — result at the end of this section.*

| Principle | Verdict | Justification |
|---|---|---|
| **I — Spec-first** | ✅ Pass | Spec precedes this plan. Q1 was resolved to Option B and recorded in the spec's Clarifications with the fact that it was adopted without an explicit operator answer. FR-024a/FR-024b and US6 were added to the **spec**, not invented here. |
| **II — Shared packages, single source** | ✅ Pass | Both Appearance objects (web Appearance API, mobile `PaymentSheet.Appearance`) are **generated from `packages/design-system/src/tokens.css`**, not transcribed — a token change must reach the payment step with no hand edit, which is the same rule 038 applied to email. The brand-mark module is one file per surface, and the two are the only permitted homes for a payment hue. |
| **III — Dual-path doctrine** | ✅ Pass | Every route is hot path. The routing law from 011 puts *payment* on the hot path explicitly, and the Stripe secret's custody boundary (`SC-012`: "the Stripe SECRET never leaves this package") makes a cold-path card-management route require a second copy of the secret. Full reasoning: research R9. |
| **IV — Four-pool auth** | ✅ Pass | Customer pool only. No new pool, client or group. ⚠ Mobile must send the **access** token to `core-api` (contract § header) — the 019/027 R12a defect. |
| **V — Design system** | ⚠ **Amendment required** | FR-031 (coloured payment marks) is **not permitted by the current text**, which scopes its third-party exception to *sign-in* marks. See § Complexity Tracking and research R13. Everything else conforms: monochrome chrome, both appearances, the accent still inverts, no card layouts (FR-035), touch targets (FR-033), dark mode required (FR-030). |
| **VI — Clean Architecture** | ✅ Pass | Hot path keeps handler → service → repository with the provider behind the existing `PaymentGateway` port — the new customer-session and payment-method calls extend that port rather than reaching around it. Mobile keeps `ViewModel → UseCase → Driver`; the embedded element enters through an extended `PaymentDriver` and an `expect`/`actual` composable slot, exactly as `AuthDriver` does. Web keeps the server-state cache authoritative. **No DI framework.** |
| **VII — Observability** | ✅ Pass | Method chosen and outcome only. ⚠ **No PAN, no CVC, no provider customer id, no payment method id** in any event, log or crash report — SC-012 is a sweep, not a promise. PostHog is initialised as of 050, so events emitted here are the first payment telemetry that will actually arrive. |
| **Real-World Identifiers** | ✅ Pass | This feature invents no address, endpoint or account id. The domains to register (R2) are the platform's existing, operator-owned ones. |

### Gate result

**PASS with one recorded violation** — FR-031 requires a MINOR constitution amendment, tracked in
§ Complexity Tracking with a stated off-ramp. No other gate fails. **Re-checked after Phase 1 design:
unchanged** — the design added no token, no DI container, no second Stripe secret, no cold-path payment
route and no new pool.

---

## Project Structure

### Documentation (this feature)

```text
specs/051-customer-payment-experience/
├── plan.md                        # This file
├── spec.md
├── research.md                    # R1–R14, incl. the live account audit
├── data-model.md
├── quickstart.md
├── contracts/
│   └── payment.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md                       # /speckit-tasks — NOT created here
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_customer_stripe_reference.sql        # NEW — one nullable UNIQUE column

apis/core-api/internal/features/checkout/
├── gateway.go                                # port: + CustomerSession, ListPaymentMethods, DetachPaymentMethod
├── stripegateway.go                          # adapter: get-or-create customer, mint session, list/detach
├── service.go                                # billing-details derivation; session minted concurrently
├── handler.go                                # + GET/DELETE /v1/payment-methods
└── store.go                                  # + read/write customer.stripe_customer_id

packages/design-system/
├── src/tokens.css                            # unchanged — SSOT
└── scripts/                                  # + generators emitting the two Appearance objects

packages/shared-types/src/
└── payment.ts                                # PaymentMethodDTO, BillingDetailsDTO, intent response (+ Kotlin generation)

apps/customer-web/app/
├── checkout/
│   ├── PaymentStep.tsx                       # REPLACES PaymentForm.tsx — Effy chrome + split elements
│   ├── _payment/{WalletRow,CardFields,MethodList,SavedCards,BrandMarks}.tsx
│   └── complete/page.tsx                     # FR-043 — itemise delivery on the receipt
└── (account)/payment-methods/page.tsx        # NEW — sibling of (account)/addresses

apps/customer-mobile/shared/src/
├── commonMain/.../features/payment/          # ViewModel + use cases + the screen with an expect slot
├── commonMain/.../features/paymentmethods/   # NEW — the account screen (mirrors features/addresses)
├── androidMain/.../core/payment/             # actual: EmbeddedPaymentElement Content()
└── iosMain/.../core/payment/                 # actual: Swift bridge
apps/customer-mobile/androidApp/src/main/res/font/   # ⚠ General Sans as an R.font resource (R8)

docs/audiences/customer-capabilities.md       # parity register — FR-044
.specify/memory/constitution.md               # MINOR amendment — FR-031
```

**Structure Decision**: A vertical slice in the established shape. Nothing new is scaffolded: the hot-path
checkout feature, the web checkout route group, the mobile feature-module layout and the account areas on
both surfaces all exist. The two genuinely new directories — `(account)/payment-methods` on web and
`features/paymentmethods` on mobile — are deliberately modelled on the existing address book, because
that is the sibling a shopper will compare them to.

---

## Implementation Phases

Ordered so that each phase leaves the platform in a releasable state, and so the two non-code blockers
are cleared before anything depends on them.

| Phase | What | Blocks |
|---|---|---|
| **0. Unblock** | Register payment method domains (R2). Move the constitution amendment (R13). Obtain brand asset kits (R14). Run spike **S1** (R11). | US2 entirely; FR-031; mobile US1 |
| **1. Server** | Migration · customer get-or-create · customer session · billing-details derivation · the two payment-method routes | Everything |
| **2. Web US1** | The payment step rebuilt: Effy chrome, split card elements, three fields, tokens-driven appearance, both modes | — |
| **3. Web US2 + US4** | Express Checkout Element; Klarna/Zip/Afterpay rows and their redirect returns | Phase 0 for US2 |
| **4. Web US3 + US5 + US6** | Saved cards and the save checkbox; the failure states; the account screen | Phase 1 |
| **5. Mobile US1–US6** | Embedded element behind the extended driver; the same six stories at parity | Phase 1, S1 |
| **6. Close** | Parity register · receipt delivery line (FR-043) · SC walk on both surfaces · secret/PII sweep | All |

⚠ **Deploy order is load-bearing** and 047 learned it the hard way: **`core-api` before `customer-web`**.
A reversed order briefly blocked dev checkout, because the client asks for a response field the server
does not yet return.

### Spikes (must run before the work they gate)

- **S1 — the mobile deferred-intent contract.** The embedded element's `createIntentCallback` passes a
  `confirmationToken` and expects a client secret back. Whether the server must create the intent *with*
  that token is SDK-version dependent. **This is the difference between "no server change" and "a new
  create-and-confirm path", so it is resolved before Phase 5 is estimated**, not during it.
- **S2 — does the split-element card route accept `billing_details` at confirm the same way the Payment
  Element does?** R4's mechanism is documented for `confirmPayment` with a Payment Element. The split
  elements confirm differently, and if the details cannot be attached there, FR-015 and FR-028 collide and
  one of them gives. **Cheap to test, expensive to discover in Phase 2.**

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Principle V amendment (MINOR)** — widen the third-party-mark exception from *sign-in marks* to *third-party marks generally* | FR-031 shows payment network, wallet and BNPL marks in their own colours. The current text permits this for sign-in marks only, so shipping it as-is would be a violation dressed as an exception. Payment marks are the same asset role, governed by the same kind of provider brand rules (R14). | **Monochrome marks** — genuinely simpler and it is the recorded off-ramp: drop FR-031, change nothing else. Rejected as the default because a payment page is where people scan for their card's logo, and a grey Visa mark is worse than useless — it reads as a disabled option. The amendment keeps every existing bound: asset role only, never a UI accent, never a token, never in the mobile theme, `tokens:check` passes unchanged. |
| **Two Stripe element types on one web page** (split card elements + a Payment Element for redirect methods) | FR-028 requires Effy's own design language, and the Payment Element's layout is fixed. Split elements give Effy the layout; they are card-only, so the redirect methods need the other element (R7). | **One Payment Element styled by the Appearance API** — fewer moving parts, and it was the first choice. Rejected because the Appearance API changes colours, fonts and radii but not layout, label position or row order, so "Effy's own design language" would stay a resemblance rather than a fact. |
| **A new account screen on each surface** (US6) | Clarification Q1 → Option B. FR-024 requires card removal; a payment-step-only affordance makes it reachable solely by starting a checkout. | **Payment-step-only removal (Option A)** — smaller, and it remains available if the operator prefers it. Rejected as the default because the address book already sets the expectation on both surfaces, and card removal is a trust action people take when they are *not* shopping. |

---

## Risks

- ⚠ **Google Pay and Afterpay are not available on the account** and cannot be acceptance-tested until it
  is activated (R1). They must ship dark under FR-013 rather than being shown before they work (FR-010).
- ⚠ **`typography.fontResId` will silently fall back** to the system font on Android if General Sans is
  not added as an `R.font` resource — nothing fails to compile, and the payment element renders in the
  wrong typeface beside Effy's own (R8).
- ⚠ **`IgnoreAPIVersionMismatch: true` must survive any SDK bump** (R10). Removing it 400s every webhook
  and strands every paid order at `pending_payment` — a live-only failure that no test catches.
- ⚠ **The mobile SDK bump for `EmbeddedPaymentElement`** is the largest unknown in the slice and is the
  one dependency change that is not additive.
- The intent call gains a provider round trip; mint the customer session concurrently (§ Performance).
