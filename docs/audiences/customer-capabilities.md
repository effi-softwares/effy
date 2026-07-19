# Customer audience — capability parity register

**Binding on**: `apps/customer-web` (Next.js SSR storefront) and `apps/customer-mobile` (KMP + Compose).
**Origin**: [specs/011-customer-storefront-web](../../specs/011-customer-storefront-web/) (FR-031, SC-015).

The customer audience is served by **two** surfaces. This file is the **single place** the platform
records what that audience can do and which surface delivers it. It exists so that a capability added
to one surface cannot leave the other's state unstated — the drift a two-surface audience otherwise
slides into silently.

> **Rule**: a change that adds or removes a customer capability on either surface **must** update this
> table in the same change. A row with an unstated cell is a defect, not a TODO.

The mobile column is **outstanding by design**. `apps/customer-mobile` is still the base KMP template;
building it to this baseline is the operator's stated next slice, and this table is the definition of
done it will be held to.

## What makes this audience different

Every other audience on Effy is an **employee**: provisioned by staff, passwordless, invisible to the
public. The customer is none of those things. They **self-register**, they arrive from a **search
engine**, and most of them **never sign in at all**. Three consequences run through every row below:

- **Guest-first.** Browsing requires no account, and the store never asks for one until the customer
  tries to order.
- **Multiple credential routes, one identity.** Email+password and email code converge on a single
  Cognito profile (one `sub`) and a single `public.customer` record. **Google is PARKED** (2026-07-14):
  built, tested and dormant behind `customer_google_enabled`. Un-parking it REQUIRES the account-
  linking trigger in the same change — federation without it hands an existing customer a *second*
  account, and there is no retroactive merge.
- **Speed and search visibility are product features**, not engineering preferences — this is the only
  surface a stranger judges before deciding whether Effy exists.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Delivered and verified on that surface |
| ⏸ | **Parked** — built, tested, and dormant behind a flag. Not deleted; not live. |
| ⬜ | Outstanding — the capability exists for this audience but this surface does not have it |
| — | Not applicable to that surface |
| 🔒 | Blocked on an operator step (live AWS); code complete |

## Baseline — established by 011-customer-storefront-web

| # | Capability | Web (`customer-web`) | Mobile (`customer-mobile`) | Backend it depends on |
|---|---|---|---|---|
| 1 | Browse the store with **no account**, never prompted to sign in | ✅ | ⬜ | — |
| 2 | Public pages are **server-rendered** and present in the raw HTML | ✅ | — *(no crawler)* | — |
| 3 | Public pages carry **page-specific metadata + canonical + social preview** | ✅ | — | — |
| 4 | The storefront publishes a **sitemap** and **crawl directives** | ✅ | — | — |
| 5 | **Self-registration** — email + password | 🔒 | ⬜ | Cognito customer pool |
| 6 | **Self-registration** — email one-time code, **no password ever set** | 🔒 | ⬜ | Cognito customer pool |
| 7 | **Self-registration / sign-in** — Google | ⏸ **PARKED** | ⏸ | Cognito customer pool + Google IdP |
| 8 | All credential routes converge on **one identity** (one `sub`, one record) | 🔒 | ⬜ | Cognito (native routes); linking trigger (federation) |
| 9 | **Account recovery** by proving control of the verified email | 🔒 | ⬜ | Cognito customer pool |
| 10 | Session persists across reload/restart | ✅ | ⬜ | — |
| 11 | The sign-in demand is **deferred to the point of ordering** | ✅ | ⬜ | — |
| 12 | Authenticating **returns the customer to exactly where they were** | ✅ | ⬜ | — |
| 13 | **Declining** to sign in costs the customer nothing | ✅ | ⬜ | — |
| 14 | The platform keeps its **own customer record** (created on first appearance) | 🔒 | ⬜ | `edge-api/customer` · `public.customer` |
| 15 | A **barred** customer is refused despite a valid credential | 🔒 | ⬜ | `edge-api/customer` |
| 16 | The customer **maintains their own details** (display name) | 🔒 | ⬜ | `edge-api/customer` |
| 17 | A customer credential is **structurally refused** by every employee-facing service | 🔒 | ⬜ | gateway JWT authorizers |
| 18 | Commerce traffic is served by the **hot path** (`core-api`) | ✅ *(proven via ping)* | ⬜ | `core-api` |
| 19 | Dark mode, and the platform's design tokens only | ✅ | ⬜ | `@effy/design-system` |
| 20 | Consent-gated analytics; **no PII beyond the auth subject id** | ✅ | ⬜ | PostHog |

**🔒 rows are code-complete and blocked on the operator run** (Google OAuth client, `make apply`, the
two spikes, `make db-up`, `make edge-deploy`). See
[quickstart](../../specs/011-customer-storefront-web/quickstart.md).

> **⚠ CORRECTION (2026-07-14, by 012).** Row 10 previously read *"Session persists across
> reload/restart; **sign-out clears it**"* and was marked **✅ — delivered**.
>
> **The storefront had no sign-out at all.** It was never built. The two SPA consoles have one (via
> `@effy/web-kit`), and the row appears to have been written from that, or from intent. A customer
> could sign in and had no way to sign out from any page of the store.
>
> The claim is now split: persistence (which *was* delivered) keeps row 10; sign-out becomes row 24
> below, where 012 actually delivers it. **A parity register that overstates is worse than none — it
> is a lie the team trusts**, and the whole purpose of this file is to make an unstated capability
> impossible. It failed at exactly that, so the failure is recorded rather than quietly patched.

## Added by 012-customer-profile-management

| # | Capability | Web (`customer-web`) | Mobile (`customer-mobile`) | Backend it depends on |
|---|---|---|---|---|
| 21 | See **who Effy thinks you are** — name, email, **initials avatar** | ✅ | ⬜ | `edge-api/customer` |
| 22 | **Change your name**, reflected everywhere the platform greets you | 🔒 | ⬜ | `edge-api/customer` + Cognito attributes |
| 23 | **Set a first password** — gated behind a **freshly emailed code**, never a bare session | 🔒 | ⬜ | `edge-api/customer` + Cognito + SES |
| 24 | **Sign out** — reachable from **every page** | ✅ | ⬜ | `/sign-out` route handler |
| 25 | **Sign out on all devices** | 🔒 | ⬜ | `edge-api/customer` (GlobalSignOut) |
| 26 | **Change an existing password** (current password required) | 🔒 | ⬜ | `edge-api/customer` + Cognito |
| 27 | New passwords are **screened against public breach corpora** (≥ 12 chars, no composition rules) | 🔒 | ⬜ | `edge-api/customer` |
| 28 | The platform **knows** whether an account has a password (Cognito cannot be asked) | 🔒 | ⬜ | `public.customer.has_password` |
| 29 | Account **recovery** obeys the same password rules and updates the record | 🔒 | ⬜ | `edge-api/customer` (public route) |

**The mobile column is outstanding by design**, and rows 23 / 26 / 29 are the ones that will bite: a
mobile app that lets a passwordless customer set a password **from a bare session** would re-open, on
a second surface, the exact account-takeover primitive this slice was built to close. Whatever the
mobile slice does, **the emailed-code step-up is not optional** — it is the capability, not an
implementation detail of the web one.

Rows 21 and 24 are **✅ today** because neither needs a deployed backend to be true: the avatar is
derived client-side from the record the page already reads, and sign-out is a route handler that
clears cookies.

## What the customer audience does NOT have yet

Recorded so the mobile slice does not have to guess, and so nobody mistakes absence for oversight:

- **No catalog.** No products, categories, or search. `core-api` has no product tables at all.
- **No cart, no checkout, no payment.** `/checkout` exists only to prove the deferred-sign-in
  mechanism; it takes no money and holds no items.
- **No order history, no addresses, no delivery.**
- **No federated provider other than Google.** Adding one is a security decision, not a feature
  toggle — the account-linking rule depends on trusting the provider's `email_verified` assertion.

## Two rules the mobile surface inherits

These are not web concerns; they are **audience** concerns, and the KMP app must honour both.

1. **One person is one `sub`.** Whatever credential route the mobile app offers, it must land on the
   same Cognito profile and therefore the same `public.customer` row. It must not introduce a fourth
   credential route that bypasses the linking trigger.
2. **The platform record is authoritative for access.** A barred customer holds a perfectly valid
   token. The mobile app must not infer permission from the token alone, any more than the web does.

## 015 — Mobile app shell & adaptive navigation

`apps/customer-mobile` gains a **guest-first** navigation shell (spec 015): an **adaptive** primary
navigation — **bottom bar on a phone, navigation rail on a tablet** — over four tabs (**Home · Search ·
Orders · Account**). Home/Search are **public** (usable with no session); Orders/Account are visible but
**gated** — tapping one as a guest raises **deferred sign-in** and, on success, returns to the intended
tab (return-to-intent). The Account tab reuses the existing 013 auth/account sub-graph unchanged;
sign-out returns to the guest shell with public content intact. Built on the shared `packages/mobile-kit`
(the customer app's first adaptive layer). Verified: compiles + unit tests green on Android, links for
iOS. Live device/simulator sign-off is the operator's step.

## 019 — Customer commerce flow (browse → order)

The commerce journey, built across **both** surfaces and served by the **hot path** (`core-api`, per the
FR-028 routing law). Legend as above (✅ delivered+verified · 🔒 blocked on an operator step · ⬜
outstanding · ~ partial/documented).

| # | Capability | Web (`customer-web`) | Mobile (`customer-mobile`) | Backend |
|---|---|---|---|---|
| 30 | Merchandised **Home** (banner, category chips, rails, cards, badges, recently-viewed) | ✅ | ✅ *(iOS-verified)* | `storefront` |
| 31 | **Product detail** (gallery, attributes as detail rows, add-to-cart, save favourite) | ✅ | ✅ | `storefront` |
| 32 | **Search** — text + filters + **keyset infinite scroll** | ✅ | ✅ | `storefront` search |
| 33 | **Cart** — one unified Effy cart, no shop identity; qty edit/remove; totals | ✅ | ✅ | `cart` |
| 34 | Guest cart is **device-local**, **merged** into the server cart on sign-in | ✅ | ✅ | `cart` merge |
| 35 | **Checkout** — deferred sign-in, delivery address, **pay by card (Stripe)** | ✅ | ~ *(iOS bridge coded; Android PaymentSheet + Swift bridge = operator)* | `checkout` + `addresses` |
| 36 | Charged **once** for the whole cart; **idempotent** (no double order/charge) | ✅ | ✅ | `checkout` (webhook authority) |
| 37 | **Receipt** — webhook-authoritative order, itemized by product, **no shop identity** | ✅ | ✅ | `orders` |
| 38 | **Order history** — list + re-open receipt | ✅ | ✅ | `orders` |
| 39 | **Favourites** — save/un-save + list + add-to-cart | ✅ | ✅ | `favorites` |
| 40 | Multi-shop order **fans out** to per-shop `shop_fulfillment` + `order.placed` outbox | — *(invisible)* | — *(invisible)* | `checkout` finalizer |

**Verification**: web — typecheck + Vitest (63) + `pnpm build` (all commerce routes `◐ PPR`); backend —
`go test` (storefront/cart/checkout/money/addresses/orders); mobile — iOS Kotlin/Native compile + all
`commonTest` green. **⚠ Operator-gated to go LIVE**: `make db-up` (the commerce migration), Stripe test
keys (Secrets Manager + client env), `make core-run` + the webhook tunnel, the Android Stripe PaymentSheet
+ iOS `SwiftPaymentBridge.swift`, and E2E/on-device sign-off. `core-api` itself is local-only until its
own cloud slice — so this flow is **built + locally verifiable**, live go-live tracks the hot-path deploy.
