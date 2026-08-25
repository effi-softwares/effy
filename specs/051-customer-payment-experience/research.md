# Research: Customer Payment Experience (051)

**Date**: 2026-08-25 · **Spec**: [spec.md](./spec.md)

Every finding below was verified against the live Stripe documentation and, where marked ⚑, against the
platform's own Stripe account (`acct_1ThgiY…`, test mode, read-only calls) or the repository source. A
claim carried from memory is not a finding.

---

## R1 — What the platform can actually accept ⚑

**Decision**: The offered set is **card, Apple Pay, Google Pay, Link, Klarna, Zip and Afterpay**, and
nothing else. PayPal, Amazon Pay, Cash App and Affirm are **struck from consideration**, permanently.

**Rationale**: The Stripe account is `country: AU`, `default_currency: aud`. The payment-method support
matrix's *business location* column excludes AU for PayPal and Amazon Pay, and both come back `null` on
the account's payment-method configuration — they are not "off", they do not exist for this merchant.
Cash App is US-only and Affirm is US/CA.

**Live account state** (`GET /v1/payment_method_configurations`, default configuration):

| Method | `display_preference.value` | `available` | Meaning for this feature |
|---|---|---|---|
| `card` | `on` | `true` | Usable now |
| `apple_pay` | `on` | `true` | Usable now — but see R2 |
| `link` | `on` | `true` | Usable now — but see R2 |
| `klarna` | `on` | `true` | Usable now |
| `zip` | `on` | `true` | Usable now |
| `google_pay` | `off` | **`false`** | Operator action — account not activated |
| `afterpay_clearpay` | `off` | **`false`** | Operator action — account not activated |
| `au_becs_debit` | `off` | `false` | Deliberately out of scope, see R3 |
| `paypal` / `amazon_pay` | — | `null` | **Impossible for an AU business** |

The account is a sandbox with `details_submitted: false` and `charges_enabled: false`, which is why
Google Pay and Afterpay report unavailable. Both are AU-supported per the matrix and will become
available on activation — which is an operator step, not a build task.

**Consequence for the build**: FR-013 (configuration, not code) is what lets the unavailable ones ship
dark and light up on activation without a release. FR-010 forbids offering any of them before they work.

**Alternatives considered**: Hard-coding the method list — rejected, it makes an operator action into a
release. Offering everything and letting Stripe filter — rejected, it violates FR-011 (a method that
vanishes without explanation is indistinguishable from a defect).

---

## R2 — Why the wallet row has never rendered ⚑

**Decision**: Register `dev.effyshopping.com` (and later `effyshopping.com`, `www.`) as Stripe payment
method domains. This is the highest-value single action in the feature and it is **not code**.

**Rationale**: `GET /v1/payment_method_domains` returns `{"data": []}` — **no domain is registered**.
Stripe's domain-registration doc lists Apple Pay (*required*), Google Pay, Link, Klarna, Amazon Pay and
PayPal as methods that will not render in Elements on an unregistered domain. Apple Pay and Link are
both `on` and `available` on the account and still cannot appear. This, not a code defect, is why the
current checkout shows a lone "Card" tab.

Registration is `POST /v1/payment_method_domains -d domain_name=…`, once per domain, per mode.
Registering in live mode also registers in sandboxes. Stripe handles Apple's merchant validation — no
Apple Merchant ID or CSR is needed.

**Consequence**: an operator task, sequenced before any wallet acceptance walk. Until it is done, US2 is
untestable and no amount of client work will change that.

**✅ RESOLVED 2026-08-25** — `dev.effyshopping.com` registered as `pmd_1U8Fa4LCcnBe97EEswqHo4x7`,
`enabled: true`.

⚠ **The response is a per-DOMAIN statement and must not be read as account eligibility.** It reports
`paypal` and `amazon_pay` as `"status": "active"` — yet both are `null` in the account's payment method
configuration, i.e. not offered to an AU business at all (R1). It reports `google_pay` active while the
account still says `available: false`. **Two independent gates; a method needs both.** Re-checked after
registration, the methods that now pass BOTH are: card, **apple_pay**, **link**, **klarna**, zip.
Google Pay and Afterpay remain blocked on account activation (T009).

---

## R3 — BECS Direct Debit is excluded on fulfilment grounds, not availability

**Decision**: Do not offer `au_becs_debit`, even once the account can.

**Rationale**: It is AUD/AU-supported and Payment-Element-supported, so availability is not the
objection. Settlement is. Effy's fulfilment fan-out is triggered by the order reaching `paid`; BECS
confirms days after the shopper submits. A same-day grocery order would sit unpicked until settlement,
or Effy would have to fulfil at risk. Neither is acceptable, and the spec records it under Assumptions.

**Alternatives considered**: Offer it with a "delivery begins when payment clears" caveat — rejected, it
contradicts the delivery promise made at checkout one screen earlier.

---

## R4 — Where the country and postcode came from, and how they go away

**Decision**: Set `fields.billingDetails.address: 'never'` (web) and
`BillingDetailsCollectionConfiguration(address = Never, name = Never, attachDefaultsToPaymentMethod = true)`
(mobile), and pass the real billing details at confirmation from data Effy already holds.

**Rationale**: `fields.billingDetails` defaults to `auto`, under which "Stripe determines which billing
fields to collect" — including a country it guesses from the shopper's IP. That is the entire cause of
the reported "Country: Sri Lanka" on an Australia-only storefront. The control-billing-details doc is
explicit: with `never`, "you must manually pass in the omitted billing fields at the confirmation time".

Effy already has them. `applyBilling` in `apis/core-api/internal/features/checkout/service.go` snapshots
the billing address onto the order (the delivery address where the shopper did not diverge, the chosen
billing address where they did), and the customer's name is on `public.customer.display_name`.

**⚠ This does not weaken authorisation.** The docs warn that *disabling address collection* can hurt
authorisation rates and network fees. That warning applies to `if_required`, which omits the data
entirely. With `never` the data is still sent — it is simply sourced from Effy instead of from the
shopper's keyboard. Same AVS signal, three fewer fields.

**Alternatives considered**: `if_required` — rejected, it drops the data and takes the authorisation
penalty for a smaller gain. Leaving `auto` and pre-filling `defaultValues` — rejected, the fields remain
on screen and the shopper can still contradict the verified address.

---

## R5 — Saved cards need one new column and one new server call

**Decision**: Add `stripe_customer_id` to `public.customer`; create a **CustomerSession** alongside every
PaymentIntent; return its client secret to the client beside the existing one.

**Rationale**: The Payment Element renders saved payment methods only when the Elements group is given a
`customerSessionClientSecret` (web) / the equivalent configuration (mobile), created against a Stripe
`Customer` with `components.payment_element.features.payment_method_redisplay: 'enabled'`. The save
checkbox comes from `payment_method_save: 'enabled'` on the same session.

⚑ **The platform holds no such reference today.** `grep -rn "stripe" db/migrations/*.sql` finds only
`payment.stripe_payment_intent_id` and the `stripe_event` dedup table. `public.customer` has
`cognito_sub`, `email`, `display_name` and no provider identifier. `CreatePaymentIntent` in
`stripegateway.go` passes amount, currency, capture method, automatic payment methods and two metadata
keys — no `customer`, no `setup_future_usage`.

**Consent is structural, not a policy note.** `payment_method_save` renders the checkbox and Stripe.js
then sets `setup_future_usage` and the payment method's `allow_redisplay` from what the shopper ticked.
Ticked → `always`; unticked → `limited`, which Stripe will not redisplay. FR-020 is therefore enforced by
the provider rather than by Effy remembering to honour it. Do **not** also set `setup_future_usage` on
the intent — the docs call combining it with `payment_method_save_usage` an integration error, and it
would save the card regardless of what the shopper chose.

### ⚠ R5 AMENDED 2026-08-25 by spike S2 — the customer session is **mobile-only**

S2 established that `stripe.confirmCardPayment` accepts `payment_method: { card: <cardNumber Element>,
billing_details: {…} }` **and** a `setup_future_usage` value in the same data argument. Three
consequences, and they simplify the web build rather than complicate it:

1. **Web does not need a CustomerSession.** Saved cards are rendered by Effy from
   `GET /v1/payment-methods` and confirmed with `payment_method: '<pm_id>'` (the documented
   "with an existing payment method" form). That is *more* of Effy's own UI than the customer-session
   route would have given, so it serves FR-028 better, not worse.
2. **The save consent is Effy's own checkbox**, and it drives `setup_future_usage: 'off_session'` plus an
   explicit `payment_method_data.allow_redisplay: 'always'` at confirm. R5's warning against combining
   `setup_future_usage` with `payment_method_save` still stands — it applies to the customer-session
   route, which web no longer takes.
3. **Mobile still needs the session**, because the embedded element renders the saved-card list itself.

So `customerSessionSecret` becomes **optional in the intent response** — populated for mobile, omitted
for web. The `customer` on the PaymentIntent is still required on both, or a saved card never attaches.

**What this does NOT change**: the intent must not carry `setup_future_usage` server-side. The choice is
still the shopper's, expressed at confirm time. FR-020 is unchanged; only who enforces it moves, from the
provider's checkbox to Effy's, which means Effy must now be *tested* on it — see T068, the negative that
matters.

**Alternatives considered**: Stripe's Accounts v2 `customer_account` — the docs recommend it for new
integrations, but it is in public preview for non-Connect users and requires a pinned preview API
version. Rejected for a payment path: a preview API version on the money path is not a defensible risk.
Recorded so the choice is deliberate and revisitable.

---

## R6 — Wallet buttons: Express Checkout Element, above the Payment Element

**Decision**: Web renders the wallet row with the **Express Checkout Element** mounted above a Payment
Element restricted to the non-wallet methods.

**Rationale**: The build-a-payment-page doc states that when both elements are on one page, "wallet
payment methods (Apple Pay, Google Pay) only appear in the Express Checkout Element to avoid
duplication" — so the two compose without a double-listing hack. ECE sorts by relevance to the customer
and renders only what the device can complete, which is what FR-008 and the second scenario of US2 ask
for. Klarna is ECE-supported; Zip and Afterpay are not, so they stay in the Payment Element list.

**These buttons are the one place Effy does not draw the UI**, and that is a brand rule rather than a
security one: Apple and Google require their own button art. FR-029 governs — style within what the
Appearance API allows, and no further.

---

## R7 — Everything else is ours: split Card Elements, not the Payment Element's card form ⚑

**Decision**: Mount `CardNumberElement`, `CardExpiryElement` and `CardCvcElement` into Effy's own
labelled field shells for the card route. Keep a Payment Element for the redirect-based methods.

**Rationale**: PCI forbids card data reaching Effy, so those three inputs must be provider-owned
iframes — but only those three. The installed SDK (⚑ `@stripe/react-stripe-js` 6.8.0, `@stripe/stripe-js`
9.10.0) exports `CardNumberElement`, `CardExpiryElement`, `CardCvcElement`, `PaymentElement`,
`ExpressCheckoutElement`, `LinkAuthenticationElement` and `AddressElement`, so no dependency change is
needed. Each split element takes a `style` object we drive from the design tokens, and the label, pill
shell, focus treatment, error copy, spacing and layout are ordinary Effy markup.

**⚠ Amended by S2**: `fields.billingDetails: 'never'` applies ONLY to the Payment Element carrying the
redirect methods. The split card elements have no billing fields to suppress — there is nothing to set,
and the details ride in the confirm call instead. A task written as "set `fields.billingDetails` on the
card form" is describing a control that does not exist there.

**Cost, stated plainly**: split card elements are card-only. They cannot carry Klarna, Zip or Afterpay,
which is why those keep a Payment Element. Two element types on one page is more moving parts than one —
that is the price of FR-028, and it is the reason FR-029 exists to bound where provider UI is acceptable.

**Alternatives considered**: A Payment Element for everything, styled by the Appearance API — fewer
moving parts, and the Appearance API is capable (theme, variables, rules, custom `fonts`). Rejected
because its layout is fixed: the label positions, the field grouping and the row order are Stripe's, so
"Effy's own design language" (FR-028) would remain a resemblance rather than a fact.

---

## R8 — Mobile: the in-app Embedded Payment Element, not the full PaymentSheet

**Decision**: `apps/customer-mobile` uses Stripe's **in-app (Embedded) Payment Element**, which embeds
the method list inside Effy's own screen, and Effy supplies the surrounding chrome, the amount and the
pay button. The existing `PaymentDriver` interface is extended rather than replaced.

**Rationale**: The current driver presents Stripe's full `PaymentSheet` — a modal whose entire interface
is Stripe's, which cannot satisfy FR-028. The Embedded Payment Element is the mobile analogue of the web
composition: on Android it exposes a `@Composable Content()` plus an observable `paymentOption` flow, so
Effy renders the selected method, the amount and the pay button itself; iOS has the equivalent. It
supports `defaultBillingDetails` + `BillingDetailsCollectionConfiguration` (R4), CustomerSession-backed
saved cards and the save checkbox (R5), and `PaymentSheet.Appearance` with separate `colorsLight` /
`colorsDark`, `shapes.cornerRadiusDp`, `shapes.borderStrokeWidthDp`, `typography.fontResId` and
`primaryButton` (FR-029, FR-030).

**⚠ Two consequences that will bite if unplanned.**

1. **The element is platform code inside a Compose Multiplatform screen.** `EmbeddedPaymentElement` is an
   Android artifact; iOS has a Swift one. The payment screen must therefore be a `commonMain` screen with
   an `expect`/`actual` composable slot for the element — the same shape the app already uses for
   `AuthDriver` and `PaymentDriver`. Do not attempt to render it from `commonMain`.
2. ⚑ **General Sans is a Compose Resource, not an Android font resource.** The faces live at
   `shared/src/commonMain/composeResources/font/general_sans_*.ttf`, but `typography.fontResId` needs an
   `R.font` id. Without adding the face to `androidApp/src/main/res/font/`, the mobile payment element
   will silently render in the system font beside Effy's own type — the exact "borrowed form" the feature
   exists to remove, and nothing will fail to compile.

**Alternatives considered**: Keep `PaymentSheet` and only re-skin it — rejected, it cannot meet FR-028 and
would leave web and mobile visibly different (FR-044). A hand-built mobile card form over Stripe's
`CardInputWidget` — rejected, it forfeits wallets, BNPL and saved cards to gain layout control the
embedded element already gives.

---

## R9 — The card-management screen goes on the HOT path, and this is not an exception

**Decision**: List and remove kept cards through `core-api` (hot path), not `edge-api/customer`.

**Rationale**: Two rules meet, and they agree. 011's routing law puts *payment* on the hot path and
customer *profile/account* on the cold path, which reads as ambiguous for a payment-methods screen. The
tiebreaker is the secret: `apis/core-api/internal/features/checkout` documents that "the Stripe SECRET
never leaves this package" (SC-012). Listing or detaching a payment method is a Stripe API call, so a
cold-path implementation would require issuing the Stripe secret to a second backend — replacing a
single custody boundary with two. The routing law's own words settle it anyway: this is payment.

**Alternatives considered**: Cold path with a hot-path proxy — rejected, an extra hop and a second
authorisation surface for no gain. Cold path with its own Stripe secret — rejected outright.

---

## R10 — Amount authority and the double-charge guarantee are already sound; do not rebuild them

**Decision**: Keep the existing server-authoritative amount, the deterministic idempotency key and the
signature-verified webhook finaliser exactly as they are. Extend, do not replace.

**Rationale**: `CreateIntentInput` already carries a deterministic `IdempotencyKey` derived from the
order id and amount, so a retried create returns the same intent; `stripe_event` dedups redeliveries;
the paid transition, the fan-out and the outbox write are one transaction. That machinery is what
FR-038, FR-039 and SC-006 depend on, and it has been proven live. This feature adds payment *options*
and a *presentation*; it must not disturb the settlement path.

**⚠ One live-only hazard is already handled and must stay handled**:
`ConstructEventWithOptions{IgnoreAPIVersionMismatch: true}` exists because the account's API version is
newer than the pinned SDK's, and removing it 400s every webhook and strands every paid order at
`pending_payment`. Any SDK bump in this feature must re-verify it.

---

## R11 — Deferred confirmation on mobile, existing flow on web

**Decision**: Mobile drives the element's `createIntentCallback` against the **existing**
`POST /v1/checkout/intent`. Web keeps creating the intent when the shopper leaves the review step.

**Rationale**: The embedded mobile element uses a deferred flow — it is configured with an
`IntentConfiguration` (amount, currency) and asks the app for a client secret at confirmation time. The
existing endpoint returns exactly that, so no new server endpoint is required for the common case.

**✅ S1 RESOLVED 2026-08-25 — no server change is needed.** Answered against the **bytecode** of the
pinned SDK (`com.stripe:stripe-android:23.17.0`), not against the docs, because the docs describe one
variant and the SDK offers three. `EmbeddedPaymentElement.Builder` has three constructors:

| Constructor | Flow | Server implication |
|---|---|---|
| `Builder(CreateIntentCallback, ResultCallback)` | **← CHOSEN.** `onCreateIntent(PaymentMethod, Boolean)` → `CreateIntentResult.Success(clientSecret)` | **None.** The existing `POST /v1/checkout/intent` already returns exactly this |
| `Builder(CreateIntentWithConfirmationTokenCallback, …)` | Server creates **and confirms** with a confirmation token | Would need a new create-and-confirm path |
| `Builder(PreparePaymentMethodHandler, …)` | Shared payment token | Not applicable |

The documented example shows the confirmation-token variant, which is what raised the question. Taking
`CreateIntentCallback` instead means mobile drives the existing endpoint and the settlement path stays
untouched — which is what R10 asks for.

**⚠ Note the second callback parameter**: `onCreateIntent` receives a `shouldSavePaymentMethod` boolean
alongside the `PaymentMethod`. That is the shopper's save consent arriving at the server, and it is the
mobile counterpart of the web checkbox in the R5 amendment. It must be honoured, not ignored — FR-020.

**Noted, not adopted**: moving web to deferred confirmation too would fix the reused-`pending_payment`
hazard that `complete/page.tsx` already documents and works around. It is a real improvement and it is
**out of scope here** — it changes the settlement path, which R10 says not to disturb in this feature.

---

## R12 — Two defects found in the current code, in scope because this feature rewrites their file

**D1 — the receipt does not itemise delivery.** `apps/customer-web/app/checkout/complete/page.tsx`
renders `Items` and `Total paid`; the delivery fee is inside the total and never shown as a line. For a
GST-inclusive Australian receipt that is a gap. FR-043 fixes it.

**D2 — the pay control can stick.** `PaymentForm.tsx` sets `busy` on submit and clears it only on
`submitError`. On the success path `onSuccess()` navigates while `busy` stays true, so the button reads
"Processing…" through a `router.push` and the receipt's two server round-trips, and stays there forever
if the navigation fails. It also calls `onSuccess()` without inspecting `paymentIntent.status`, so a
`processing` intent is treated as paid. FR-041 and FR-040 fix both.

**⚠ Not diagnosed**: the operator's screenshot showed a disabled "Processing…" over an empty card form.
That is consistent with D2 but cannot be confirmed from an image. A console trace from a real
reproduction is needed before claiming it is the same defect.

---

## R13 — Coloured payment marks require a constitution amendment, not an exception ⚑

**Decision**: Amend Principle V (MINOR) to widen its third-party-mark exception from **sign-in marks** to
**third-party marks generally**, before FR-031 is implemented.

**Rationale**: The constitution's text is narrower than it is often paraphrased. Verbatim: *"Two
exceptions, each an asset/data role rather than a UI accent: (1) a third-party sign-in mark whose
provider's brand guidelines require its own colours; and (2) a bounded categorical data-visualisation
palette."* Payment network, wallet and BNPL marks are the same asset role and are governed by the same
kind of provider brand rules — but "sign-in" is doing real work in that sentence, and payment marks are
not sign-in marks. Shipping them coloured under the existing wording would be a violation dressed as an
exception.

**Bounds the amendment must keep** (unchanged from the existing exception): an asset role, never a UI
accent, fill, border or text colour; never a design token; never surfaced to the mobile Compose themes;
the monochrome ramp still carries every UI accent role; WCAG AA and the retired-hue sweeps unchanged.

**Mechanical position**: the marks live in one component-local module per surface, the way 039's
coloured panels did (FR-005a). `tokens:check` must pass **unchanged** — that is the proof the colour did
not enter the design system. `check-no-emerald.sh` / `check-no-jade.sh` are unaffected: no brand hex
collides with a retired one.

**If the amendment is declined**: the marks render monochrome, FR-031 is dropped, and nothing else in
the feature changes. This is the cheapest possible off-ramp and it is deliberate.

---

## R14 — Brand assets must be obtained, not drawn

**Decision**: Ship no hand-drawn payment logo. Obtain each provider's official asset kit.

**Rationale**: Visa, Mastercard, American Express, Apple, Google, Klarna, Zip and Afterpay each publish
mandatory usage rules covering clear space, minimum size, permitted backgrounds and permitted colour
variants. A redrawn mark breaches all of them, and payment marks are the marks most likely to be audited.
The design canvas deliberately uses simplified stand-ins; those must not reach production.

**Not our problem**: the network marks *inside* Stripe's card field are Stripe's own and need nothing.


---

## R15 — FR-027 has no deletion path to attach to, and 051 cannot build one ⚑

**Finding**: **The platform has no account-erasure job.** Account closure (034) writes a
`customer_closure_request` with an `erase_after` 30 days out and flips `public.customer.closure_state`
to `'closing'`. ⚑ `grep -rn "erase_after"` finds exactly three files — the closure repo, its service and
their tests. **Nothing reads it.** 034's own spec is explicit: *"Permanent erasure at day 30 is
explicitly NOT built here"*, and it records the job as a **blocking dependency for store submission**.

**Consequence for this feature**: FR-027 ("deleting or barring a customer account MUST remove that
shopper's kept cards") cannot be fully satisfied by 051, because the deletion it hangs off does not
exist yet. This is not a gap 051 introduced and not one it can close.

**What is true today**:

- **Barring** — a barred customer is refused at the identity gate, so their cards become *unreachable*.
  Unreachable is not deleted, and FR-027 asks for deleted.
- **Closure** — the account enters `closing`; the cards stay at the provider indefinitely, because
  nothing ever runs the erasure.

**Decision**: do NOT improvise a deletion path inside this slice. Two things make that the wrong call
rather than the lazy one:

1. **The obvious hook is on the wrong side of the secret boundary.** Closure is a cold-path service
   (`apis/edge-api/customer/src/closure/`), and detaching a card is a provider call. Wiring it there
   needs either the Stripe secret in a second backend — which R9 rejected outright — or a new
   cold→hot service call, which is a cross-service authorisation surface invented on the way past.
2. **Deleting cards at the closure *request* would be a design decision, not an implementation
   detail.** It is defensible (cards are useless during the grace period, and a restored account can
   re-add one), but it makes closure partially irreversible in a way 034 deliberately made reversible.
   That belongs to whoever owns the erasure job.

**Recorded instead**: the ORDERING RULE, so that whoever builds the erasure job inherits it rather than
rediscovering it. **Provider cards and the provider customer must be deleted BEFORE the local
`stripe_customer_id` is cleared.** Reverse the order and the reference needed to find them is gone, and
the cards survive at the provider with nothing in Effy able to reach them — a retention breach that
leaves no trace in our own data (data-model § 5).

**⚠ This must be carried into the spec as an open dependency, not left in a research file**, because a
spec that claims FR-027 is met when no erasure exists is worse than one that says it is blocked.


---

## R16 — customer-web is light-only, and FR-030 was written without checking ⚑

**Finding**: ⚑ `apps/customer-web/app/layout.tsx` records that the public storefront is **LIGHT-ONLY by
operator decision** — it "ships no appearance switcher and never applies the design system's `.dark`
class" — and `globals.css` pins `color-scheme: light` so browser chrome cannot go dark over it.

**Impact on this feature**: FR-030 as originally written ("MUST follow the shopper's Light / Dark /
Follow-System choice, changing with it live") is **unbuildable on web**, because there is no such choice
to follow. The requirement was written from the design canvas — which shows a dark artboard — without
checking the surface it targets. That is a spec defect, and it is mine.

**Resolution** (spec amended in place, not patched in code): the payment step follows its surface. Mobile
has the switcher and gets both appearances plus live switching. Web gets the light appearance, and the
generated dark half ships unused so the storefront gaining a switcher later is a zero-work change for
the payment step.

**⚠ The larger conflict is recorded, not resolved.** Principle V requires dark mode on EVERY surface and
requires it to be user-selectable; customer-web has neither, by an operator decision that predates 051.
Reversing that inside a payment slice would be the wrong place for it. It is now written down.

**Why this matters beyond the wording**: the design canvas published for this feature shows a dark
payment page. Anyone reading it would reasonably expect dark mode on the web storefront. It is not
coming from this slice.


---

## R17 — ⚠ CORRECTION to R8/T050: iOS IS verifiable and IS buildable ⚑

**I was wrong, and this corrects it.** T050 was recorded as "cannot be verified from a command line, so
writing the Swift bridge would be guessing". That premise was false. `xcodebuild
-resolvePackageDependencies` resolves SPM outside Xcode, and the checked-out source then sits under
`~/Library/Developer/Xcode/DerivedData/<project>/SourcePackages/checkouts/`. I had not tried it.

**What the resolution shows** ⚑ — the project's `upToNextMajorVersion` 24.0.0 pin resolves to
**Stripe iOS 24.25.0**, and it carries the embedded element in full:

| Needed | Present at 24.25.0 |
|---|---|
| The element | `public final class EmbeddedPaymentElement` |
| Construction | `static func create(intentConfiguration:configuration:) async throws` |
| Confirmation | `public func confirm() async -> EmbeddedPaymentElementResult` |
| Selection | `public var paymentOption: PaymentOptionDisplayData?` |
| **A view for Compose interop** | **`public var view: UIView`** |
| Change notifications | `EmbeddedPaymentElementDelegate` (height, selection, will-present) |

`public var view: UIView` is the decisive one: Compose Multiplatform's `UIKitView` interop takes a
`UIView`, so the element can be embedded in the SAME `PaymentElementContent` slot the Android side uses.
There is no architectural obstacle — the shape mirrors Android's.

**Remaining real complications** (work, not unknowns): the element's height changes as the shopper
selects methods, so `embeddedPaymentElementDidUpdateHeight` must drive the interop view's measured
height or the list will clip; and `presentingViewController` must be set for the form sheet to appear.

**✅ BUILT 2026-08-25.** `SwiftPaymentElementBridge.swift` + `PaymentElement.ios.kt`, mirroring the
Android actual. Both complications are handled explicitly:

- **Height** — the bridge reports `view.systemLayoutSizeFitting(...)` on create AND on every
  `didUpdateHeight` / `didUpdatePaymentOption`, and the Kotlin side sizes the `UIKitView` box from it.
  ⚠ A Compose interop view keeps the height it was measured at, so without this the card form that
  expands under a selected method renders below the visible box and **the shopper simply cannot reach
  it**, with nothing on screen suggesting anything is wrong. `wrapContentHeight()` does not help — a
  UIKit view does not self-size inside Compose.
- **Presentation** — `configuration.presentingViewController` and the element's own
  `presentingViewController` are both set from a top-of-stack walk (the Compose host controller may
  itself be presented). Without it a shopper taps a method and nothing happens at all.
- **Confirmation** — the completion-handler `confirm(completion:)` variant, not `async`, because
  Kotlin/Native cannot call Swift `async`. Guarded so the callback fires exactly once: the Kotlin side
  resumes a `CancellableContinuation`, and resuming twice traps.
- **Teardown** — `DisposableEffect` calls `dispose()`. The element holds a live PaymentIntent and a view
  controller reference; leaving the screen without tearing it down leaks both and the next payment would
  build a second element over the first.

**Fallback retained**: if Swift never registers the factory, Kotlin falls back to a handle that refuses
honestly and says payments are unavailable — it does not silently do nothing.

**The lesson, since it is the second time in this slice**: "I cannot verify X" is a claim that needs
testing like any other. The Android answer came from unzipping an AAR and reading bytecode; the iOS
answer was available the same way and I asserted an impossibility instead of spending one command on it.
