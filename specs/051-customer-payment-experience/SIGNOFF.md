# Sign-off: 051 — Customer Payment Experience

**Date**: 2026-08-25 · **Status**: 🚧 **CODE-COMPLETE AND MACHINE-VERIFIED ON WEB + ANDROID.
NOT DEPLOYED. NOT WALKED BY A PERSON. iOS UNVERIFIED.**

**91 / 108 tasks.** Every user story is built. What remains is 3 operator gates, 13 operator walks,
and 1 task of mine that those gates block.

⚠ **This document exists to record what was NOT done.** A sign-off that lists only achievements is a
press release. Every deferral below is stated, not implied.

---

## What was built

All six user stories, on both customer surfaces:

| | Web | Android | iOS |
|---|---|---|---|
| US1 — payment step carries the amount and nothing else | ✅ | ✅ | ⚠ unverified |
| US2 — wallets (Apple Pay, Google Pay, Link) | ✅ | ✅ | ⚠ unverified |
| US3 — saved cards + save consent | ✅ | ✅ | ⚠ unverified |
| US4 — pay over time (Klarna, Zip) | ✅ | ✅ | ⚠ unverified |
| US5 — failure states | ✅ | ✅ | ⚠ unverified |
| US6 — payment methods in the account | ✅ | ✅ | ✅ |

**The shopper-visible change**: the payment step no longer restates the order, asks for three card
fields instead of six, offers every option an Australian Effy can actually accept, remembers cards the
shopper chose to keep, and is drawn by Effy rather than by the payment provider.

**Schema**: one nullable `UNIQUE` column (`public.customer.stripe_customer_id`). Applied to dev
2026-08-25 and verified: 5 customers, 0 with a provider reference — nothing creates them eagerly.

---

## Machine verification (all green)

- **Go** — 14 packages, 0 failures · `gofmt` · `go vet` clean
- **Workspace** — `pnpm -r typecheck` clean · `turbo run test` **32/32 tasks** · `turbo run build`
- **customer-web** — **412 tests / 46 files** · production build · bundle within budget on all 10 gated routes
- **customer-mobile** — **297 tests / 0 failures** · Android + iOS compile, **main AND test** · `:androidApp:assembleDebug`
- **Guards** — `cm-guard` · `cm-tokens-check` (10 generated files) · `check-no-emerald` · `check-no-jade`
- **Sweeps** — no card data in source · no provider customer id in client code · no secrets · banned address absent

**Five guards were proved by deliberately breaking them**: the `setup_future_usage` structural guard,
the save-consent negative, the config-contract env check, the `tokens:check` drift guard, and the
telemetry PII guard. A guard that has never failed is a guard nobody has tested.

---

## ⚠ NOT DONE — mine, blocked on an operator gate

- **T044–T046 — coloured payment marks.** Blocked on **T002**, the Principle V amendment. The marks
  currently render **monochrome**, which is constitutionally correct today. The exception's text is
  scoped to *sign-in* marks; payment marks are the same asset role but not the same words, so shipping
  them coloured now would be a violation dressed as an exception (research R13).
- **T043 — the Playwright walk.** Not written. The 412 unit tests do not substitute for a browser
  completing a real payment against a production build.

---

## ⚠ NOT DONE — operator gates (3)

| | What | Blocks |
|---|---|---|
| **T002** | Move the Principle V amendment (`/speckit-constitution`, MINOR) | T044–T046 |
| **T003** | Obtain official brand asset kits | release — the current marks are **stand-ins** and must not ship |
| **T009** | Activate the Stripe account (`details_submitted`) | Google Pay + Afterpay |

---

## ⚠ NOT DONE — operator walks (13)

**Nothing in this feature has been used by a person.** Deploy (⚠ **`core-api` BEFORE `customer-web`** —
a reversed order briefly blocked dev checkout in 047), then:

- **T102 / T103** — SC-001…SC-016 on web and on mobile. ⚠ **Android as well as iOS** — Android has
  never been looked at across 028, 029, 033 and 035, and this is a payment screen.
- **T104** — prove SC-006 four ways: double-click, reload mid-payment, browser back, `stripe events resend`.
- **T105** — the three negatives a happy-path walk misses: the **unticked card absent on return**, the
  abandoned provider payment, the ineligible option never offered.
- **T106** — ⚠ check the mobile payment element's **typeface on an Android device**. A missing `R.font`
  resource renders the system font beside Effy's own type and **nothing errors**.
- **T062** — Apple Pay on Safari/macOS and a real iPhone; Google Pay on a real Android device.
- **T100 (second half)** — read a real payment's logs. The grep is clean; a grep is necessary and not sufficient.
- **T108** — the commit.

---

## ⚠ Carried gaps that this feature could not close

**1. iOS payments are unverified, and the blocker predates 051.**
The Swift bridge and its Kotlin `actual` are written, and the Kotlin half compiles for iOS (main and
test). The Swift half has **never compiled**, because ⚑ **the iOS app has not built since feature 050**:
`xcodebuild` dies on `Unable to resolve module dependency: FirebaseCore / FirebaseCrashlytics /
PostHog`. PostHog is not even a package reference in the project. `CLAUDE.md:281` records it.
`SwiftPaymentElementBridge.swift` produced **zero errors of its own**, but the module never finished, so
nothing about it is proven. A fallback ships that refuses honestly rather than showing a dead screen.
**Closes when** the operator adds those SPM packages in Xcode and a build reports SUCCEEDED.

**2. FR-027 cannot be met — there is no account-erasure job.**
034 writes a 30-day `erase_after` and explicitly defers the worker that acts on it. `grep -rn
"erase_after"` finds three files and nothing reads it. A closed account's kept cards therefore survive
at the provider indefinitely. 051 deliberately did **not** improvise a fix: the hook sits on the cold
path, on the wrong side of the payment secret's custody boundary, and deleting cards at the closure
*request* would make closure partially irreversible — which belongs to whoever owns erasure. What 051
contributes is the **ordering rule** that job must follow: provider records first, local reference
second (research R15).

**3. Dark mode on customer-web — a standing conflict with Principle V.**
`apps/customer-web` is light-only by operator decision. FR-030 was written assuming otherwise and was
**amended during implementation** (research R16). The dark palette is generated and ships unused, so a
future switcher is a one-line change. ⚠ The conflict with Principle V's "dark mode on every surface,
user-selectable" is **not created by 051 and not resolved by it** — but it is now written down.

**4. Pre-existing: `@effy/brand` test fails.** `check-brand-assets` reports orphaned
`apps/{back-office,shop-web}/public/robots.txt` — added by **048**. ⚑ Confirmed untouched by 051
(`git status` clean on those paths). Not fixed here; it is not this slice's.

---

## Amendments made during implementation

Four things were written down rather than quietly worked around:

1. **FR-030 amended** — customer-web is light-only; the original wording was unbuildable (R16).
2. **Clarification Q1 resolved to Option B** without an explicit operator answer, and recorded as such.
3. **data-model § 1 narrowed** — the provider customer id DOES reach the mobile client, because both
   SDKs require it beside the session secret. The rule became "only beside a session, only on mobile,
   never in the web response, never logged, never accepted as input", and is guarded by two Go tests.
4. **T026 resolved as blocked**, not as done (R15).

Two of my own claims were **corrected after being tested**: that the iOS SDK could not be verified from
a command line (it can — R17), and that customer-web had an appearance switcher (it does not — R16).

---

## Spec artifacts

[spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) (R1–R17) ·
[data-model.md](./data-model.md) · [contracts/payment.contract.md](./contracts/payment.contract.md) ·
[quickstart.md](./quickstart.md) · [tasks.md](./tasks.md)

Parity register: [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) § 051
