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

## §021 — Delivery zones & pricing (per-shop split delivery)

Replaces 019's flat $5 fee with **per-shop split delivery** (AliExpress/Daraz model, sellers hidden). A
multi-shop cart becomes one anonymous **package** per shop, each priced/timed from that shop's origin
zone to the customer's destination zone; the customer places **one order, pays once**, and sees an
anonymised per-package breakdown. Delivered on **both** customer surfaces at parity.

| Capability | customer-web | customer-mobile | Notes |
|---|---|---|---|
| Package-aware cart (anonymous "Package N", opaque key) | ✅ | ✅ | No shop name/location (SC-006) |
| Per-package delivery options at checkout (fee + window) | ✅ | ✅ | `POST /v1/checkout/quote` (hot path) |
| Default preference + per-package override | ✅ | ✅ | fastest/cheapest, overridable |
| Scheduled-date pick + derived windows | ✅ | ✅ | method-dependent |
| Serviceability: auto-exclude undeliverable + explicit confirm | ✅ | ✅ | items never a shop (FR-004); all-undeliverable blocks |
| Server-authoritative per-package fee, captured-quote window | ✅ | ✅ | client never sends a fee (SC-004); 409 → re-quote |
| Anonymised per-package receipt breakdown | ✅ | ✅ | `OrderFulfillmentDTO` delivery fields |

**Management (back-office, not a customer capability):** zones (postcode sets), shop locations, and the
(origin→dest, method) rate grid — cold-path `edge-api/admin` `delivery/`, cloning 009, audited via
`admin.audit_log`, no cards.

**Shop side (020, enriched):** each portion now carries its **real** ready-by + service level from the
customer's chosen package method (the 020 promise seam, one file); the shop **never** sees the delivery
fee (FR-021a). Same-day portions genuinely outrank multi-day in the queue.

**Money-path integrity (US3):** per-package fees are computed server-side from zones×offerings, captured
on the pending order, honored within a validity window, snapshotted into `shop_fulfillment` inside 019's
atomic `FinalizeSucceeded` transaction (no partial paid order). Verified: **644 JS/TS tests**, full Go
suite incl. per-package fee/exclusion/expiry tests, 152 mobile tests (Android+iOS), 020's 156 shop tests
still green post-seam-swap.

⚠ **Not live-verified yet** — `core-api` is local-only; SC-001…SC-013 need a two-shop live checkout (like
020's) against a seeded zone/rate config. ⚠ **Guest bundle** ticked 167.3→167.5 KB (pre-existing breach;
021's cart-store change adds ~0.2 KB) — needs its own fix, not 021's to own.

## §022 — Customer address book (manage saved addresses)

Makes address management a **first-class account capability** on both customer surfaces, over the
existing 019 `customer_address` model (no migration, no new DTOs). Previously addresses could only be
added inline at checkout; now the customer views, adds, edits, sets-default, and deletes saved
addresses from their account. Reuses `/v1/addresses` (hot path, 019) with **one** backend change: a
server-side **delete-default guard** (409).

| Capability | customer-web | customer-mobile | Notes |
|---|---|---|---|
| View all saved addresses (list, default marked) | ✅ | ✅ | A **list**, not cards (Principle V); empty state; account-gated |
| Add an address (responsive form) | ✅ | ✅ | web: shadcn **Dialog ≥ breakpoint / Drawer below** (`ResponsiveModal`); mobile: **FAB → `ModalBottomSheet`** |
| Home / Work / Other **label chips** | ✅ | ✅ | write the existing free-text `label`; round-trip on read (presentation only) |
| Edit an address (row-body opens editor) | ✅ | ✅ | set-default/delete controls do NOT open edit (FR-017a) |
| Set an address as default | ✅ | ✅ | exactly-one-default already server-safe (019 CTE); checkout pre-selects it |
| Delete an address (confirmation) | ✅ | ✅ | deleting the **default while others exist** is blocked → reassign prompt; **server 409** is the backstop (FR-016a, SC-010) |
| Own-addresses-only | ✅ | ✅ | customer-scoped from the token; never client input (FR-020, SC-005) |

**Path (Principle III):** address management is customer profile → the **cold path**
(`edge-api/customer`, `/customer/v1/addresses`), per the routing law (011 FR-028). 022 **moved** the CRUD
here from the hot path (where 019 first built it) and **removed** it from core-api; checkout keeps its
own direct `customer_address` SQL read for the order snapshot. The one added behaviour is the
delete-default guard, a single race-free guarded `DELETE` (409).

**Shared primitive (Principle II):** the responsive add/edit container is added **once** to the
design-system — `ResponsiveModal` (Dialog/Drawer via `useIsMobile`) + the shadcn `Drawer` (vaul, a
within-standards library addition) — rather than hand-rolled per surface.

**Telemetry (Principle VII):** `address_added` / `address_edited` / `address_deleted` /
`address_default_set` / `address_delete_default_blocked` — **no address fields**, subject id only
(SC-008). Mobile telemetry deferred (013/014/015/020/021 pattern).

⚠ **Not live-verified yet** — the address book is on the deployable cold path, so going live is
`make edge-deploy SERVICE=customer ENV=dev` (no migration, no Terraform). SC-001…SC-011 (incl. the
direct-API delete-default **409** proof and the cross-customer refusal) then walk against the dev
gateway. The checkout inline `AddressForm` is deliberately left unreconciled to the new shared form
(scope boundary). The book lives in the `(account)` signed-in tree, so it does not touch the
pre-existing guest-bundle breach.

## §023 — Checkout shipping & billing addresses

Reconciles checkout to the 022 Address Book and gives every order a distinct shipping + billing address.
Checkout pre-selects the default, lets the customer switch or add a saved address, and records a billing
address that defaults to the shipping one (a "same as shipping" toggle) but may diverge. Both surfaces at
parity.

| Capability | customer-web | customer-mobile | Notes |
|---|---|---|---|
| Default shipping address pre-selected at checkout | ✅ | ✅ | 0 address fields to reach pay (SC-001); deterministic when none default |
| Switch shipping to another saved address | ✅ | ✅ | picker over the saved list; re-prices delivery (021) before pay (FR-005); per-order, default unchanged |
| Add a new address during checkout | ✅ | ✅ | reuses the 022 responsive form (dialog/drawer web; bottom sheet mobile) → saved to the book + selected |
| Billing address per order (default = shipping) | ✅ | ✅ | "Billing same as shipping" toggle ON by default; sends `billingAddressId` only when diverged |
| Divergent billing address | ✅ | ✅ | OFF → pick/enter a different billing; toggle back ON discards it (FR-013) |
| Receipt shows both / "same as shipping" | ✅ | ✅ | `OrderDTO.billingAddress` null → "same as shipping" (FR-016); both immutable snapshots |

**Data:** one migration — `public."order".billing_address jsonb` **nullable** (NULL = same as shipping).
`delivery_address` stays the **shipping** snapshot (not renamed). No new address rows — billing is an
order snapshot, not a saved-address type.

**Path (Principle III, no exception):** checkout intent + order snapshot + receipt → **hot path**
(core-api, commerce); the saved-address list-read + new-address create at checkout → **cold path** (022
address book); the client sends only address **ids** (FR-021).

**Shop boundary (FR-018 — see the [020 amendment](../../specs/020-shop-order-fulfillment/AMENDMENT-023-shipping-billing.md)):**
the shop sees the **shipping** address only; billing is a separate column the shop never selects,
structurally excluded and locked by a guard test.

**Telemetry:** `checkout_address_changed` / `checkout_address_added` / `checkout_billing_diverged` — no
address fields (SC-009). Mobile telemetry deferred.

⚠ **Not live-verified yet** — `core-api` is local-only; SC-001…SC-009 (incl. the shop no-leak proof)
need the migration applied + `make core-run` + the two surfaces. **Stripe `billing_details` not sent** —
billing is recorded on the order for the receipt; wiring it into the PaymentIntent is a recorded,
behaviour-neutral follow-up (R6).
