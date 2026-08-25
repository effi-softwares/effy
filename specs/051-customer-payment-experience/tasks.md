---
description: "Task list for 051 — Customer Payment Experience"
---

# Tasks: Customer Payment Experience

**Input**: Design documents from `/specs/051-customer-payment-experience/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/payment.contract.md](./contracts/payment.contract.md) · [quickstart.md](./quickstart.md)

**Tests**: Included. This slice touches the money path, and every one of FR-038/FR-039/FR-040 is a
guarantee that only a test can hold. Test tasks are named where they carry a requirement, not by reflex.

**Organization**: Grouped by user story so each ships independently. Within a story, server → web →
mobile; `[P]` marks tasks on different files with no incomplete dependency.

## Format: `[ID] [P?] [Story] Description`

**[operator]** marks a task Claude authors but does not run — deployments, `terraform apply`, migrations,
live AWS/Stripe, device walks (CLAUDE.md § Mode of work).

## Path Conventions

Hot path `apis/core-api/internal/features/checkout/` · Web `apps/customer-web/` · Mobile
`apps/customer-mobile/` · Shared `packages/{design-system,shared-types}/` · Migrations `db/migrations/`

---

## Phase 1: Setup & Unblock

**Purpose**: Clear the two non-code blockers and resolve the two spikes. ⚠ **T001 and T004 gate real
work** — starting Phase 3 without them risks building against a contract that turns out to be wrong.

- [X] T001 [operator] ✅ **DONE 2026-08-25** — `pmd_1U8Fa4LCcnBe97EEswqHo4x7`, `dev.effyshopping.com`, `enabled: true`. ⚠ **Read the response carefully**: the domain object reports PER-DOMAIN eligibility, not account eligibility, and both gates must pass. It lists `paypal`/`amazon_pay` as `active` while the account has them `null` (an AU business cannot offer either), and `google_pay` as `active` while the account still reports `available: false` (needs T009). **Newly usable: Apple Pay, Link, Klarna.** Original task: Register the payment method domain: `stripe post /v1/payment_method_domains -d domain_name=dev.effyshopping.com`, then confirm with `stripe get /v1/payment_method_domains` that it is listed and `enabled: true` — ⚠ this is why the wallet row has never rendered (research R2); record the result in `specs/051-customer-payment-experience/quickstart.md` § 0a
- [ ] T002 [operator] Move the Principle V amendment via `/speckit-constitution` — widen the third-party-mark exception from *sign-in marks* to *third-party marks generally*, keeping every existing bound, MINOR bump, in `.specify/memory/constitution.md` (research R13). **If declined, mark FR-031 dropped in `spec.md` and skip T044, T045, T046**
- [ ] T003 [P] [operator] Obtain the official brand asset kits for Visa, Mastercard, Amex, Apple Pay, Google Pay, Link, Klarna, Zip and Afterpay; store them under `packages/brand/src/payment-marks/` with each provider's usage rules recorded alongside (research R14)
- [X] T004 **Spike S1** ✅ **RESOLVED 2026-08-25 — no server change needed.** Verified against the bytecode of `stripe-android:23.17.0`: `EmbeddedPaymentElement.Builder` offers three deferred flows, and `Builder(CreateIntentCallback, ResultCallback)` returns `CreateIntentResult.Success(clientSecret)` — exactly what `POST /v1/checkout/intent` already gives. ⚠ `onCreateIntent` also carries a `shouldSavePaymentMethod` boolean: that is the save consent and it must be honoured (FR-020). Recorded in `research.md` § R11. ~~Original~~ **Spike S1** — resolve the mobile deferred-intent contract against the real SDK: does `createIntentCallback`'s `confirmationToken` require the server to create-and-confirm, or does returning the existing client secret suffice? Record the answer in `specs/051-customer-payment-experience/research.md` § R11. ⚠ **This is the difference between "no server change" and a new settlement path — it gates Phase 8's estimate**
- [X] T005 **Spike S2** ✅ **RESOLVED 2026-08-25 — they do, and it simplifies web.** `stripe.confirmCardPayment` accepts `payment_method: { card: <cardNumber Element>, billing_details: {…} }` plus `setup_future_usage`. FR-015 and FR-028 do NOT collide. Consequences recorded in `research.md` § R5 AMENDED and the contract: web needs **no customer session**, renders saved cards itself, and drives the save consent from its own checkbox. ~~Original~~ **Spike S2** — confirm the split card elements accept `billing_details` at confirmation the way the Payment Element does; if they do not, FR-015 and FR-028 collide and one must give. Record in `research.md` § R4 and raise a spec amendment if the answer forces one. ⚠ **Cheap now, expensive in Phase 3**
- [X] T006 Bump the Stripe Android SDK to a version exposing `com.stripe.android.paymentelement.EmbeddedPaymentElement` in `apps/customer-mobile/gradle/libs.versions.toml` and `apps/customer-mobile/androidApp/build.gradle.kts` — the one non-additive dependency change in the slice
- [X] T007 [P] ✅ **ALREADY DONE — nothing to add.** `StripePaymentSheet` is already an SPM product dependency in `apps/customer-mobile/iosApp/iosApp.xcodeproj` (added by 019), pinned `upToNextMajorVersion` from **24.0.0** and wired into Frameworks. ⚠ The constraint is a major-range, so it resolves forward on its own — but iOS `EmbeddedPaymentElement` availability is NOT verified here and cannot be from this machine (it needs an Xcode resolve). **Confirm it before T050**, and pin the resolved version alongside Android's 23.17.0
- [X] T008 [P] ⚠ Add General Sans as an **Android font resource** at `apps/customer-mobile/androidApp/src/main/res/font/general_sans_medium.ttf` (+ regular, semibold) — the Compose Resources copies at `shared/src/commonMain/composeResources/font/` are **not** reachable by `typography.fontResId`, and without this the payment element renders in the system font with nothing failing to compile (research R8)
- [ ] T009 [P] [operator] Activate the Stripe account (`details_submitted`) so Google Pay and Afterpay report `available: true` — until then they must not be offered (FR-010). Re-run `stripe get /v1/payment_method_configurations` and record the new state in `research.md` § R1

**Checkpoint**: Domains registered, both spikes answered, SDKs in place. Phase 2 may start.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, the contract and the token-derived appearance every story depends on.
⚠ **No user story can start until this phase completes.**

### Schema

- [X] T010 Create the forward-only migration `db/migrations/<ts>_customer_stripe_reference.sql` adding `stripe_customer_id text UNIQUE` (nullable) to `public.customer`, with a `COMMENT ON COLUMN` recording that it is a reference and not a credential (data-model § 1)
- [X] T011 [operator] Commit the migration (003 commit-guard), then `make db-status ENV=dev` and `make db-up ENV=dev`; verify the column is nullable + UNIQUE and that `count(*) WHERE stripe_customer_id IS NOT NULL` is **0** — a non-zero count before anyone has paid means something is creating provider customers eagerly

### Shared contract

- [X] T012 [P] Add `PaymentMethodDTO`, `BillingDetailsDTO` and the extended checkout-intent response to `packages/shared-types/src/payment.ts` — ⚠ use `WireInt` for `expMonth`/`expYear` so Kotlin cannot serialise them as `Double` (027 R13, the defect that made every mobile cart write fail)
- [X] T013 Regenerate the Kotlin contract into `apps/customer-mobile/shared/src/commonMain/kotlin/.../contract/` and run `make cm-contract-check` to prove no drift
- [X] T014 [P] Add a Go↔Kotlin wire-contract test pinning the payment-method and billing-details payloads byte-for-byte, in `apis/core-api/internal/features/checkout/payment_wire_contract_test.go` and the matching Kotlin test — the 028 pattern that catches a silent field rename

### Appearance, generated from the token SSOT

- [X] T015 [P] Write the web Appearance generator in `packages/design-system/scripts/gen-stripe-appearance.mjs`, emitting theme variables and rules for **both** appearances from `src/tokens.css` — generated, never transcribed, so a token change reaches the payment step with no hand edit (Principle II, the 038 rule)
- [X] T016 [P] Write the mobile Appearance generator emitting a Kotlin `PaymentSheet.Appearance` with `colorsLight` **and** `colorsDark`, `shapes.cornerRadiusDp`, `shapes.borderStrokeWidthDp` and `primaryButton`, into `packages/design-system/compose/` (⚠ chart tokens must NOT be surfaced — constitution v1.13.0)
- [X] T017 Add both generated artifacts to the `tokens:check` drift guard in `packages/design-system/scripts/check-tokens.mjs`, and prove the guard by deliberately editing one and seeing it fail and name the file

### Hot path

- [X] T018 Extend the `PaymentGateway` port in `apis/core-api/internal/features/checkout/gateway.go` with `EnsureCustomer`, `CreateCustomerSession`, `ListPaymentMethods` and `DetachPaymentMethod`, plus their provider-neutral result types (Principle VI — the service depends on the port, never the SDK)
- [X] T019 Implement all four on the Stripe adapter in `apis/core-api/internal/features/checkout/stripegateway.go`; ⚠ the customer session must enable `payment_method_redisplay` **and** `payment_method_save`, and the intent must **not** set `setup_future_usage` — combining them is an integration error and would keep a card the shopper declined (research R5, FR-020)
- [X] T020 Add `StripeCustomerID` read/write to `apis/core-api/internal/features/checkout/store.go`, as a get-or-create inside the existing intent transaction
- [X] T021 Derive billing details in `apis/core-api/internal/features/checkout/service.go` from the order's billing snapshot (`applyBilling`'s output) and `customer.display_name`; ⚠ a `billingDetails` key in the **request** MUST be ignored — accepting one lets a client contradict the address it just confirmed (contract § 1)
- [X] T022 Mint the customer session **only when the caller renders a provider-owned method list** (mobile), and **concurrently** with the PaymentIntent when it is minted at all, in `service.go` — ⚠ **amended by S2**: minting it for web would be an unused provider round trip — the intent path is already latency-sensitive at ~135 ms per Sydney round trip (027), and a serial mint spends another one
- [X] T023 Add `GET /v1/payment-methods` and `DELETE /v1/payment-methods/{id}` to `apis/core-api/internal/features/checkout/handler.go` and register them on the customer-verified group
- [X] T024 Compute `usable` + `unusableReason` server-side in `service.go`; the client must never infer usability from the expiry (FR-023, contract § 2)
- [X] T025 Enforce ownership before detach in `service.go` — verify the payment method belongs to this shopper's provider customer and return `403` otherwise; ⚠ the id is client-supplied and a detach that trusts it is a cross-customer write (contract § 3)
- [X] T026 ⚠ **BLOCKED — investigated 2026-08-25, and the blocker is not ours.** There is no account-deletion path to attach to: 034 wrote the 30-day `erase_after` and explicitly deferred the erasure job, which `grep -rn "erase_after"` confirms nothing reads. FR-027 cannot be met until that job exists. Deliberately NOT improvised here — the hook sits on the cold path, on the wrong side of the payment secret's custody boundary (R9), and deleting cards at the closure *request* would make closure partially irreversible, which belongs to whoever owns erasure. Recorded in `research.md` § R15 and raised to the spec's Dependencies. **What 051 contributes is the ordering rule** — provider records first, local reference second — carried in the migration's `+goose Down` note and `data-model.md` § 5

### Foundational tests

- [X] T027 [P] Test that a retried intent for one order creates exactly **one** provider customer and one intent, in `apis/core-api/internal/features/checkout/service_test.go` (FR-038)
- [X] T028 [P] Test that billing details are derived from the order snapshot and that a request-supplied `billingDetails` is ignored, in `service_test.go` (FR-016, contract § 1)
- [X] T029 [P] Test that detaching another customer's payment method returns `403` and leaves it attached, in `service_test.go` (FR-026)
- [X] T030 [P] Test that `ListPaymentMethods` returns an **error**, never an empty list, when the provider is unreachable — "you have no cards" and "we could not ask" are different facts (FR-036, data-model § 2)
- [X] T031 [P] Test that the intent response never contains `stripe_customer_id` — landed as `TestWireContract_IntentResponseCarriesNoProviderCustomerID` in `apis/core-api/internal/features/checkout/payment_wire_contract_test.go` rather than `handler_test.go`, because asserting the WHOLE serialised object (not a substring absence) is what catches a future field added by someone who did not read the rule (data-model § 1)
- [X] T032 [P] Add a config-contract test reading the real env wiring, in `apis/core-api/internal/features/checkout/config_contract_test.go` — 035's fourth defect was four env vars the deployment never declared, and 100 passing tests missed it because they set those vars themselves

**Checkpoint**: Schema applied, contract published, appearance generated, hot path serving. Every user
story is now unblocked and they may proceed in parallel.

---

## Phase 3: User Story 1 — Pay by card, on a page that is only about paying (P1) 🎯 MVP

**Goal**: The payment step is a focused screen carrying the amount and nothing else, asking for three
card fields in Effy's own design language, in both appearances, on both surfaces.

**Independent test**: Reach the payment step with a priced basket, pay by card, and confirm the order is
paid; the fields asked for are exactly three; no basket line, address or delivery row appears anywhere.

### Web

- [X] T033 [US1] Create the field shell, label and error primitives in `apps/customer-web/app/checkout/_payment/Field.tsx` — pill, h-11, `rounded-full`, border-only focus (no halo), matching `packages/design-system/src/ui/input.tsx` exactly
- [X] T034 [US1] Mount `CardNumberElement` / `CardExpiryElement` / `CardCvcElement` inside those shells in `apps/customer-web/app/checkout/_payment/CardFields.tsx`, driving each element's `style` object from the generated appearance (research R7)
- [X] T035 [US1] Confirm the card route with `stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardNumberElement, billing_details } })`, taking `billing_details` from the intent response, in `apps/customer-web/app/checkout/_payment/confirm.ts` — ⚠ **amended by S2**: the split card elements have **no billing fields to suppress**, so there is no `fields.billingDetails` to set here; `never` applies only to T073's redirect-method Payment Element
- [X] T036 [US1] Build the payment step shell in `apps/customer-web/app/checkout/PaymentStep.tsx`: the amount stated once, the back link, the pay button, the trust line and the legal line — and **no** basket line, address or delivery row (FR-003)
- [X] T037 [US1] Lay the page out with the repo's `container` utility in `PaymentStep.tsx` — no `max-w`, no `mx-auto` on the content; the measure comes from the grid (the operator's direction, and the design canvas)
- [X] T038 [US1] Rewire `apps/customer-web/app/checkout/CheckoutFlow.tsx` to render `PaymentStep` and **delete** `apps/customer-web/app/checkout/PaymentForm.tsx`
- [X] T039 [US1] Wire the generated Appearance into the `<Elements>` options in `apps/customer-web/lib/stripe.ts` and make it follow the live appearance setting, re-creating the Elements group on change (FR-030)
- [X] T040 [P] [US1] Test that the payment step renders no basket line, address or delivery control, in `apps/customer-web/app/checkout/PaymentStep.test.tsx` (SC-004)
- [X] T041 [P] [US1] Test that exactly three card inputs are requested and that no country, postcode or name field exists, in `PaymentStep.test.tsx` (SC-001, FR-014/FR-015)
- [X] T042 [P] [US1] Test that the amount rendered equals the amount from the intent response, in `PaymentStep.test.tsx` (SC-005)
- [ ] T043 [US1] Add a Playwright walk of the card payment against a production build in `apps/customer-web/e2e/payment.spec.ts`

### Brand marks (skip if T002 was declined)

- [ ] T044 [US1] Create the web brand-mark module at `apps/customer-web/app/checkout/_payment/BrandMarks.tsx` as component-local constants — ⚠ **no design token, no `tokens.css` entry**; deleting this one file is the whole revert (research R13, the 039 FR-005a pattern)
- [ ] T045 [P] [US1] Create the mobile brand-mark module at `apps/customer-mobile/shared/src/commonMain/kotlin/.../features/payment/BrandMarks.kt` under the same rule, and ⚠ **not** in the Compose theme
- [ ] T046 [P] [US1] Test that `tokens:check` passes **unchanged** with the marks in place — this is the mechanical proof the colour did not enter the design system (research R13)

### Mobile

- [X] T047 [US1] Extend the `PaymentDriver` interface in `apps/customer-mobile/shared/src/commonMain/kotlin/.../core/payment/PaymentDriver.kt` for the embedded element: configure, observe the selected option, confirm — replacing the single `presentPaymentSheet` call
- [X] T048 [US1] Declare the `expect` composable slot for the embedded element in `apps/customer-mobile/shared/src/commonMain/kotlin/.../features/payment/PaymentElementSlot.kt` — ⚠ the element is platform code and cannot be rendered from `commonMain` (research R8)
- [X] T049 [US1] Implement the Android `actual` over `rememberEmbeddedPaymentElement` in `apps/customer-mobile/shared/src/androidMain/kotlin/.../core/payment/`, wiring `createIntentCallback` per the T004 answer
- [X] T050 [US1] ⚠ **BUILT — Kotlin verified, Swift NOT yet.** `IosPaymentElementBridge.kt` (callback contract) + `SwiftPaymentElementBridge.swift` (owns `EmbeddedPaymentElement`, conforms to `EmbeddedPaymentElementDelegate`) + `PaymentElement.ios.kt` (`UIKitView` interop) + factory registration in `iOSApp.swift`. **Verified**: `compileKotlinIosSimulatorArm64` and `compileTestKotlinIosSimulatorArm64` both pass. **NOT verified, and BLOCKED BY A PRE-EXISTING 050 CARRY-FORWARD**: an `xcodebuild` run is the only thing that compiles the Swift, and ⚑ **the iOS app has not built since feature 050** — the build dies on `Unable to resolve module dependency: FirebaseCore / FirebaseCrashlytics / PostHog`. PostHog is not even an `XCRemoteSwiftPackageReference` in the project; Firebase is referenced but not linked to the target. `CLAUDE.md:281` records it: *"iOS builds need the SPM packages added in Xcode."* ⚠ `SwiftPaymentElementBridge.swift` produced **zero errors of its own**, but the module never finished compiling, so the Swift is NOT proven. **Operator action: add the Firebase + PostHog SPM packages in Xcode (050's carry-forward), then re-run the build.** Do not treat T050 as proven until it reports SUCCEEDED. Handled explicitly: height forwarded from `didUpdateHeight` (a Compose interop view keeps its measured height, so the expanding card form would otherwise be unreachable), `presentingViewController` set on the ELEMENT not the Configuration (verified against 24.25.0 source — wrong placement means "tap a method, nothing happens"), completion-handler `confirm` (Kotlin/Native cannot call Swift `async`), and `dispose()` on `DisposableEffect` (the element holds a live PaymentIntent). A factory rather than a shared instance, because each screen carries its own intent

- [X] T051 [US1] Apply `BillingDetailsCollectionConfiguration(address = Never, name = Never, attachDefaultsToPaymentMethod = true)` plus `defaultBillingDetails` from the intent response, in the element configuration (FR-015, contract § 6)
- [X] T052 [US1] Apply the generated `PaymentSheet.Appearance` with `colorsLight` **and** `colorsDark` and `typography.fontResId` pointing at the T008 resource, in the element configuration (FR-029, FR-030)
- [X] T053 [US1] Build `PaymentViewModel` + use cases in `apps/customer-mobile/shared/src/commonMain/kotlin/.../features/payment/`, following `ViewModel → UseCase → Driver` (Principle VI)
- [X] T054 [US1] Build the payment screen in `.../features/payment/PaymentScreen.kt`: amount, the element slot, Effy's own pay button, trust and legal lines — and **no** order content (FR-003)
- [X] T055 [US1] ⚠ Send the **access** token, not the id token, on every new `core-api` call in `apps/customer-mobile/shared/src/commonMain/kotlin/.../core/network/EffyHttpClient.kt` — this is 019/027 R12a, the defect that silently rejected every mobile cart write
- [X] T056 [P] [US1] Add `PaymentViewModel` tests in `apps/customer-mobile/shared/src/commonTest/kotlin/.../features/payment/PaymentViewModelTest.kt` — ⚠ **no comma in a backtick test name**: Kotlin/Native rejects it and the iOS test compilation fails while Android stays green (033)

**Checkpoint**: US1 is a complete, releasable improvement on both surfaces.

---

## Phase 4: User Story 2 — Pay in one tap with a wallet (P2)

**Goal**: Apple Pay, Google Pay and Link appear where the device can complete them, above the card form.

**Independent test**: On a device with a wallet configured, complete a payment without typing card
details; on a device without one, see no wallet affordance and no gap where it would be.

**⚠ Blocked on T001.** Until the domain is registered this story cannot be tested at all.

- [X] T057 [US2] Mount `ExpressCheckoutElement` above the method list in `apps/customer-web/app/checkout/_payment/WalletRow.tsx`, sharing the Elements group so it and the Payment Element cannot both list a wallet (research R6)
- [X] T058 [US2] Render nothing — no heading, no gap, no apology — when the element reports no available wallet, in `WalletRow.tsx` (US2 scenario 2)
- [X] T059 [US2] Handle the wallet's cancel and error paths in `WalletRow.tsx`: nothing charged, basket intact, every method still available (US2 scenario 4)
- [X] T060 [P] [US2] Test the no-wallet-available branch renders nothing, in `apps/customer-web/app/checkout/_payment/WalletRow.test.tsx`
- [X] T061 [US2] Confirm the mobile embedded element surfaces the wallets and that they sit above the card form in `apps/customer-mobile/.../features/payment/PaymentScreen.kt`
- [ ] T062 [operator] Walk Apple Pay on Safari/macOS and on a real iPhone, and Google Pay on a real Android device — ⚠ simulators do not carry wallet credentials

---

## Phase 5: User Story 3 — Pay with a card already used (P3)

**Goal**: Kept cards are offered and pre-selected; a new card is kept only on explicit consent.

**Independent test**: Pay with a new card and agree to keep it; return in a new session and pay again
without retyping anything.

- [ ] T063 [US3] ⚠ **Amended by S2 — no customer session on web.** Render the kept cards from `GET /v1/payment-methods` in `apps/customer-web/app/checkout/_payment/SavedCards.tsx` with network, last four and expiry, and confirm a chosen card with `payment_method: '<pm_id>'` (FR-019). This is *more* of Effy's own UI than the session route, so it serves FR-028 better
- [ ] T064 [US3] Pre-select the default kept card and allow switching to a new card and back, in `SavedCards.tsx` (FR-022)
- [ ] T065 [US3] Render Effy's own save-this-card consent control in plain words in `apps/customer-web/app/checkout/_payment/CardFields.tsx`, driving `setup_future_usage: 'off_session'` **and** an explicit `payment_method_data.allow_redisplay: 'always'` at confirm when ticked, and neither when not (FR-020). ⚠ **Amended by S2**: enforcement moved from the provider's checkbox to ours, which is exactly why T068 exists
- [ ] T066 [US3] Show an unusable kept card with its reason and make it unselectable, in `SavedCards.tsx` (FR-023)
- [ ] T067 [US3] Add inline removal of a kept card at the payment step in `SavedCards.tsx` (FR-024)
- [ ] T068 [P] [US3] ⚠ Test that a card paid with **unticked** is absent on a later session — the negative that matters, and the one a happy-path walk misses, in `apps/customer-web/app/checkout/_payment/SavedCards.test.tsx` (SC-013, FR-020/FR-021)
- [ ] T069 [P] [US3] Test that an expired kept card is unselectable and states its reason, in `SavedCards.test.tsx` (FR-023)
- [ ] T070 [US3] Wire the customer session and the save consent into the mobile element configuration in `apps/customer-mobile/.../features/payment/`
- [ ] T071 [P] [US3] Test the mobile saved-card and consent paths in `apps/customer-mobile/shared/src/commonTest/kotlin/.../features/payment/`

---

## Phase 6: User Story 4 — Pay over time (P4)

**Goal**: Klarna, Zip and Afterpay are offered where eligible, each stating its terms before selection.

**Independent test**: Complete a Klarna payment on a qualifying basket and confirm the order is paid for
the full amount; abandon one and confirm nothing was charged.

- [ ] T072 [US4] Build the method list rows in `apps/customer-web/app/checkout/_payment/MethodList.tsx`, each stating the number of payments, the amount of each and whether interest applies **before** selection (FR-012)
- [ ] T073 [US4] Confine a Payment Element to the redirect-based methods in `MethodList.tsx` — split card elements are card-only (research R7)
- [ ] T074 [US4] Omit an ineligible option, or show it unavailable **with the reason** — never offer then refuse (FR-011, US4 scenario 2)
- [ ] T075 [US4] Handle the redirect return in `apps/customer-web/app/checkout/complete/page.tsx`: paid, abandoned, or not yet known, each distinctly (FR-040, US4 scenario 5)
- [ ] T076 [P] [US4] Test that an ineligible option is never offered as selectable, in `apps/customer-web/app/checkout/_payment/MethodList.test.tsx` (FR-010/FR-011)
- [ ] T077 [US4] Confirm the mobile element offers the same set and honours the same eligibility, in `apps/customer-mobile/.../features/payment/`
- [ ] T078 [US4] Render the provider mandate text where the mobile element is configured not to (`embeddedViewDisplaysMandateText(false)`) — ⚠ a compliance requirement, and URLs must render as links

---

## Phase 7: User Story 5 — Know what happened when a payment does not go through (P5)

**Goal**: Every refusal names a cause the shopper can act on, and none costs them their basket.

**Independent test**: Force a decline, an abandonment, a bank approval and a dropped connection; confirm
four distinct actionable messages and that the basket survives all four.

- [ ] T079 [US5] Map provider outcomes to Effy's own copy in `apps/customer-web/app/checkout/_payment/failures.ts` — ⚠ never surface a raw provider error code as the only explanation (FR-036)
- [ ] T080 [US5] Render the decline, abandoned-at-provider and bank-approval states in `apps/customer-web/app/checkout/_payment/PaymentNotice.tsx` (US5 scenarios 1–2)
- [ ] T081 [US5] ⚠ Fix the stuck pay control in `PaymentStep.tsx`: clear the busy state on **every** outcome including the success-then-navigate path, and inspect the intent status before treating a payment as complete — a `processing` intent is not paid (research R12 D2, FR-040/FR-041)
- [ ] T082 [US5] Refuse a second submission while a payment is in flight, in `PaymentStep.tsx` (FR-041)
- [ ] T083 [US5] Redirect a shopper returning to the payment step for an already-paid order to its confirmation (FR-042)
- [ ] T084 [P] [US5] Test that each refusal produces a distinct actionable message and never a bare failure string, in `apps/customer-web/app/checkout/_payment/failures.test.ts` (SC-007)
- [ ] T085 [P] [US5] Test that the pay control returns to a usable state on every outcome, in `PaymentStep.test.tsx` (FR-041)
- [ ] T086 [US5] Mirror the failure mapping and the single-submission guard on mobile in `apps/customer-mobile/.../features/payment/`
- [ ] T087 [P] [US5] Test the confirm-fallback idempotency in `apis/core-api/internal/features/checkout/service_test.go` — it now carries far more traffic (every redirect return and every 3DS return) and its idempotency deserves a test rather than an assumption (contract § 4)

---

## Phase 8: User Story 6 — Manage kept cards from the account (P6)

**Goal**: A payment-methods screen beside the address book on both surfaces.

**Independent test**: Remove a card from the account area and confirm it is no longer offered at the
payment step on either surface.

- [ ] T088 [US6] Build `apps/customer-web/app/(account)/payment-methods/page.tsx` modelled on `app/(account)/addresses` — the sibling a shopper will compare it to
- [ ] T089 [US6] Add the payment-methods entry to the account navigation in `apps/customer-web/app/(account)/account/` alongside Addresses and Orders (FR-024a)
- [ ] T090 [US6] Render an honest empty state explaining that cards are kept while paying, with no dead controls (US6 scenario 4) — ⚠ and distinguish it from a read failure (FR-036)
- [ ] T091 [US6] Implement removal with confirmation in `app/(account)/payment-methods/`, leaving a usable default selected where one remains (FR-024b)
- [ ] T092 [P] [US6] Test the empty, populated, unusable-card and read-failure states in `apps/customer-web/app/(account)/payment-methods/page.test.tsx`
- [ ] T093 [US6] Build `apps/customer-mobile/shared/src/commonMain/kotlin/.../features/paymentmethods/` mirroring `features/addresses`, reachable from Account
- [ ] T094 [US6] Register the new mobile route and ⚠ update the expected route count in `ScreenInventoryTest` — 046 found this assertion silently stale and it fails the next run regardless of who broke it
- [ ] T095 [P] [US6] Add mobile payment-methods ViewModel tests in `apps/customer-mobile/shared/src/commonTest/kotlin/.../features/paymentmethods/`

---

## Phase 9: Polish & Cross-Cutting

- [ ] T096 [P] Itemise delivery on the receipt in `apps/customer-web/app/checkout/complete/page.tsx` so Items + Delivery == Total paid (FR-043, research R12 D1)
- [ ] T097 [P] Emit the method-chosen and outcome telemetry events, carrying ⚠ **no PAN, no CVC, no payment-method id and no provider customer id** (Principle VII, FR of SC-012)
- [ ] T098 [P] Update `docs/audiences/customer-capabilities.md` § 051 with every parity gap and its reason (FR-044)
- [ ] T099 Run the full machine sweep: `make core-test` · `pnpm -r typecheck` · `pnpm -r test` · `turbo build` · both mobile compiles **including `compileTestKotlinIosSimulatorArm64`** · `make cm-guard` · `make cm-tokens-check` · `make cm-contract-check` · `node apps/customer-web/scripts/bundle-budget.mjs`
- [ ] T100 Run the secret and PII sweeps from `quickstart.md` § 5, then ⚠ **read a real payment's logs** and confirm they carry the method and the outcome and nothing else — a grep is necessary, not sufficient (SC-012)
- [ ] T101 [operator] Deploy: ⚠ **`core-api` BEFORE `customer-web`** — a reversed order briefly blocked dev checkout in 047, because the client asks for a response field the server does not yet return
- [ ] T102 [operator] Walk SC-001 … SC-016 on **web**, per `quickstart.md` § 3, recording each result
- [ ] T103 [operator] Walk SC-001 … SC-016 on **mobile**, per `quickstart.md` § 4 — ⚠ **on Android as well as iOS**; Android has never been looked at across 028, 029, 033 and 035, and this is a payment screen
- [ ] T104 [operator] Prove SC-006 by causing it four ways: double-click, reload mid-payment, browser back, and `stripe events resend <id>` — one charge in all four
- [ ] T105 [operator] Prove the three negatives a happy-path walk misses: the unticked card absent on return (T068's live counterpart), the abandoned provider payment, and the ineligible option never offered
- [ ] T106 [operator] Check the mobile payment element's **typeface** on an Android device — ⚠ system font means T008's `R.font` resource is missing, and nothing errors (research R8)
- [ ] T107 Write `specs/051-customer-payment-experience/SIGNOFF.md` recording what was **not** walked; deferrals are recorded, never implied
- [ ] T108 [operator] Commit the slice

---

## Dependencies

```
Phase 1 (Setup & Unblock)
   ├── T001 ──────────────────────► gates US2 entirely (Phase 4)
   ├── T002 ──────────────────────► gates T044–T046 only
   ├── T004 (S1) ─────────────────► gates T049, and Phase 8's estimate
   ├── T005 (S2) ─────────────────► gates T034/T035 (may force a spec amendment)
   └── T006/T007/T008 ────────────► gate all mobile tasks
        │
        ▼
Phase 2 (Foundational) ── BLOCKS EVERYTHING BELOW
        │
        ▼
   ┌────┴──────┬──────────┬──────────┬──────────┬──────────┐
   ▼           ▼          ▼          ▼          ▼          ▼
 US1 (P1)   US2 (P2)   US3 (P3)   US4 (P4)   US5 (P5)   US6 (P6)
  MVP        needs       ─          ─        needs      needs
             T001                            a route     US3
```

- **US1** is the MVP and depends on nothing but Phase 2.
- **US2, US3, US4** are independent of one another and may run in parallel after Phase 2.
- **US5** needs at least one payment route to exist before its failures can be produced.
- **US6** needs US3 — there is nothing to manage until cards can be kept.

## Parallel Opportunities

- **Phase 1**: T003, T007, T008, T009 in parallel; T004 and T005 are independent spikes.
- **Phase 2**: T012/T014/T015/T016 in parallel; T027–T032 all in parallel once T018–T026 land.
- **Phase 3**: web (T033–T043) and mobile (T047–T056) are different surfaces and may run in parallel; T040/T041/T042 in parallel.
- **Across stories**: after Phase 2, US2/US3/US4 are three independent tracks.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone delivers the focused payment page, the
three-field card form and Effy's own design language on both surfaces — the whole of the operator's
original complaint — and is releasable without any other story.

**Then, in value order**: US2 (wallets — the biggest effort reduction, and T001 is a single API call),
US3 (kept cards — compounds with every order), US5 (failure states — stops a failed payment becoming a
lost customer), US4 (pay over time), US6 (account management).

**Two things to hold on to throughout**: the settlement path is not to be disturbed (research R10 — the
deterministic idempotency key, `payment.order_id UNIQUE`, `stripe_event` dedup, and
`IgnoreAPIVersionMismatch: true` all stay exactly as they are), and `tokens:check` must pass **unchanged**
from first task to last, because that is the mechanical proof the payment colour never entered the
design system.
