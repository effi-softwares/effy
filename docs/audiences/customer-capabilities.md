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

---

## §024 — Brand marks (icons · splash · favicon)

**Parity: ACHIEVED.** Both customer surfaces carry the **Emerald** colourway of one authored mark.

| Capability | customer-web | customer-mobile |
|---|---|---|
| Browser tab / bookmark icon | ✅ `app/icon.svg` + `favicon.ico` (16/32/48) | — |
| Apple touch / home-screen web clip | ✅ `app/apple-icon.png` (180) | — |
| Installed-PWA icon | ✅ 192/512, **both** `any` and `maskable` purposes | — |
| Launcher icon | — | ✅ adaptive (vector fg/bg) + legacy mipmaps ×5 |
| Themed / monochrome icon | — | ✅ `<monochrome>` layer (Android 13+) |
| iOS light / dark / tinted appearances | — | ✅ all three, **no alpha channel** |
| Branded launch screen | n/a | ✅ Android `Theme.Effy.Splash` + iOS `UILaunchScreen`, ground `#4ade80` (green-400) |
| Light + dark appearance | ✅ | ✅ (`values-night` / `LaunchBackground` dark variant) |

**Source of truth:** `packages/brand/src/logo.svg` → `make brand-gen`. Assets are **generated and
committed**, never hand-edited; `make brand-check` fails on drift and names the stale surface.

**Corrected here (were latent defects, not new work):** `layout.tsx` imported `next/head`, which is
**inert in the App Router** — the Apple web-app title never rendered; the manifest carried placeholder
`#ffffff` theme/background colours; the PWA icons declared **only** `maskable`, which renders visibly
over-padded where an unmasked icon is expected; and the Android launcher label was the developer
string `customer-mobile`, now **"Effy"**.

⚠ **Not device-verified yet** — SC-002/003/004/005/007 need physical iOS + Android hardware and a
side-by-side observer test. Everything machine-checkable is green.

---

## §025 — Customer Experience Refresh (Web + Mobile)

**Parity: ACHIEVED.** Every capability below exists on both customer surfaces, expressed natively for
each. Rows marked `n/a` are **not gaps** — the requirement is that the shopper's need is met on each
surface, and a sticky bar solves a problem that does not exist at desktop widths.

| Capability | customer-web | customer-mobile |
|---|---|---|
| Category browse | ✅ `/browse` category index | ⚠️ **PARITY GAP (deliberate, 2026-07-30)** — the Browse destination was REMOVED at the operator's instruction, superseding 025 FR-010 for mobile. Mobile now has only the Discover rail chips, which group the home read client-side; there is no category index and no way to set a category refinement in Search. |
| Persistent search entry | ✅ header, both breakpoints | ✅ Search destination + app bar |
| Delivery location, set before a cart exists | ✅ header island + `<dialog>` | ✅ Home delivery row + dialog |
| Up-front serviceability answer | ✅ | ✅ |
| Sort control | ✅ 4 orderings, server-echoed | ✅ 4 orderings, server-echoed |
| Result count | ✅ live region | ✅ live region |
| Removable refinement chips + clear-all | ✅ | ✅ |
| Promotional carousel with imagery | ✅ CSS scroll-snap, 0 JS | ✅ `HorizontalPager` + dots |
| Fluid product tiles | ✅ fills grid; rail owns its width | ✅ adaptive grid |
| Interactive gallery | ✅ radio + scroll-snap, 0 JS | ✅ swipe + position dots |
| Delivery expectation beside price | ✅ | ✅ |
| Quantity adjacent to add + line total | ✅ | ✅ (in the buy bar) |
| Sticky buy affordance | n/a — no scroll problem at desktop widths | ✅ bottom bar |
| Related products | ✅ own Suspense boundary | ✅ lazy rail |
| Unavailability at the point of action | ✅ | ✅ |
| Add-to-cart acknowledgement | ✅ toast + "View cart" | ✅ snackbar |
| Cart review without navigating | ✅ mini-cart `<dialog>` | ✅ Cart destination |
| Undo on remove | ✅ toast action | ✅ snackbar action |
| Sticky order summary | ✅ `lg` two-column grid | n/a — single column |
| Product images in cart lines | ✅ | ✅ |
| Content-shaped skeletons | ✅ | ✅ Home / Search |
| Pull-to-refresh | n/a — browser reload | ✅ Home |
| Real iconography | ✅ lucide | ✅ Material Symbols, drift-checked |
| Standard app bars + back | n/a — browser chrome | ✅ shared `EffyTopBar` |
| Platform typeface (Nunito Sans) | ✅ | ✅ **new — generated per app** |
| Empty states route back to catalogue | ✅ | ✅ |

**Source of truth:** `packages/design-system` (tokens + type scale + mobile assets) and
`packages/mobile-kit` (shared components). All derived artifacts are **generated and committed**;
`tokens:check` fails on drift and names the stale surface.

### ⚠ Known partial

**Mobile delivery-context persistence (FR-013).** Web persists across visits via `localStorage`.
customer-mobile has no key-value persistence and `multiplatform-settings` is not one of its
dependencies — adding it would breach this feature's no-new-dependency constraint. `DeliveryContextStore`
ships with an injected `persist` seam (shop-mobile's `AppearancePreferenceStore` pattern), so the
location holds **within a session** but not across restarts. Wiring durability is a constructor
argument, not a rewrite.

### ⚠ Not device-verified

SC-005 (the 5-viewport × 2-appearance × 2-surface matrix), SC-002/SC-003/SC-013 (moderated testing),
and the live guest-journey walk are **operator-run** and outstanding. Everything machine-checkable is
green.

---

## §026 — Monochrome Design Language & Customer Mobile Rebuild

The platform's visual identity was replaced on **all six surfaces**, and the customer mobile app's
screens were **rebuilt** (not restyled — spec FR-025a) against the chosen design language.

### Platform-wide (all six surfaces)

| Capability | customer-web | customer-mobile | Notes |
|---|---|---|---|
| Monochrome neutral ramp, no brand hue | ✅ | ✅ | Constitution v1.11.0. Also shop-web, back-office, shop-mobile, driver-mobile. |
| Accent inverts by appearance | ✅ | ✅ | near-black on light, near-white on dark — a neutral accent cannot hold one value |
| Two bounded semantic hues | ✅ | ✅ | error + success; success is non-text only |
| General Sans typeface | ✅ | ✅ | self-hosted; all six surfaces |
| Brand marks on polarity axis | ✅ | ✅ | customer light tile · shop dark tile · back-office mid |

### Customer mobile — screens rebuilt

Onboarding · Login · Sign-up · Verify code · Reset password · Home · Search + filters ·
Product detail · Cart (+ empty) · Checkout · Receipt · Orders (+ Ongoing/Completed) · Saved items
(+ empty) · Address book (+ empty) · Address form · Account · My details · Password screens ·
Notifications (+ empty) · Order tracking · FAQs · Help Center · Customer Service.

### ⚠ MOBILE-ONLY BY DESIGN — not a parity gap

| Capability | customer-web | customer-mobile |
|---|---|---|
| Onboarding introduction | ➖ n/a | ✅ first-launch, device-local |
| Notifications screen | ➖ n/a | ✅ **fixture-backed** — no notifications capability exists |
| Order tracking timeline | ➖ | ✅ real 020 state; no map, address or courier (FR-037) |
| FAQs · Help Center · Customer Service | ➖ | ✅ static content |
| Device preference store | ➖ n/a | ✅ new — `DevicePreferences` (Android/iOS) |

**customer-web received the identity change only.** Its screen-level rebuild was explicitly out of
scope (FR-032); 025 had already addressed its presentation. The two surfaces are held together by
palette and typeface, which come from the one token SSOT.

### ⚠ Deliberately NOT built, with reasons

- **Payment methods / add-card screens** — the payment provider's own sheet renders these; a
  look-alike is forbidden (FR-030).
- **Ratings and reviews** — no such capability, and excluded by 025 as well (FR-029).
- **Facebook sign-in** — not an Effy credential route (FR-030a).
- **Apparel size selection** — the store is grocery (FR-007).

### ⚠ Not device-verified

The visual matrix, grayscale review, screen-reader traversal, the customer/shop side-by-side observer
test (SC-021) and a full live purchase are **operator-run and outstanding**. Everything
machine-checkable is green. The onboarding photograph is **placeholder** (Unsplash) and wants
licensed brand photography before public release.

## §027 — Customer cart synchronisation, promotions & order rules

Makes the cart an **account-level thing**. Before this the customer-mobile cart had never once written
to the backend: three stacked defects (the wrong token to the hot path, one app client per pool, and a
Kotlin `Double` quantity Go's `encoding/json` refuses into an `int`) each masked the one in front, so a
cart lived and died on one device. 027 rebuilds the cart as a **server-authoritative** resource with an
**optimistic local mirror** on each surface, and adds the platform's first commercial levers —
**promotional codes** and a **minimum order value** — with an operator console to run them.

| Capability | customer-web | customer-mobile | Notes |
|---|---|---|---|
| Cart persists to the account | ✅ | ✅ | `core-api` (hot path, FR-028) — a cart is a latency-sensitive customer transaction |
| Cart survives force-quit / device restart | ✅ | ✅ | mirror in `localStorage` / `DevicePreferences`, adopted forward-only on `revision` |
| Cart follows the shopper across devices | ✅ | ✅ | SC-002 — the whole reason the slice exists |
| Guest cart merges in at sign-in | ✅ | ✅ | union with **MAXIMUM** quantity → idempotent, so it is safe on every sign-in |
| Re-prices on open (today's prices + availability) | ✅ | ✅ | a failed re-price changes nothing — "we could not check" must not read as "you have nothing" |
| Optimistic UI (the tap lands before the network) | ✅ | ✅ | mirror first, send second — always in that order |
| Debounced quantity sends | ✅ | ✅ | ten taps → one request; safe **only** because quantities are absolute (SC-005) |
| Idempotent changes (`changeId` per shopper action) | ✅ | ✅ | minted per action, never per attempt — a retry cannot apply twice (FR-018) |
| Out-of-order response rejection | ✅ | ✅ | monotonic `cart.revision`; a slow response can never overwrite a newer cart |
| Offline queue with backoff | ➖ by design | ✅ | mobile persists a queue; a browser tab is shorter-lived, and the next cart open repairs it |
| Save for later (set aside / restore / discard) | ✅ | ✅ | signed-in only — a guest has no saved list, and a local imitation would be worse than the absence |
| Reorder a past order (with a shortfall report) | ✅ | ✅ | server-side in ONE call: only the catalogue knows what is unavailable vs gone (FR-034/FR-035) |
| Promotional code (apply / remove) | ✅ | ✅ | signed-in only — a per-shopper cap is unenforceable without an identity |
| Specific refusal reasons (8 of them) | ✅ | ✅ | expired ≠ exhausted ≠ below-minimum: they are different answers for the shopper (FR-043) |
| Minimum order value, stated with the shortfall | ✅ | ✅ | "add $x more" — the platform decides, and re-decides at intent (FR-054/FR-056) |
| Cart ceilings (per line, distinct items) | ✅ | ✅ | operator-configured; clamps carry a notice rather than failing silently |
| Pull-to-refresh on the cart | ➖ n/a | ✅ | plus Home, Search, Orders, Favourites — with an elastic follow |

**Path (Principle III):** the cart is commerce → the **hot path** (`core-api`), per the routing law
(011 FR-028). The **operator** half — defining codes and the order rules — is back-office CRUD → the
**cold path** (`edge-api/admin`, `/admin/v1/promotions` + `/admin/v1/order-policy`). One capability,
two audiences, two paths.

**No shop identity leaks (SC-017).** Verified by reading every string the cart mints: lines group by an
opaque `packageKey` (a truncated SHA-256 of the shop id) and render as a positional **"Package N"**;
notices carry the PRODUCT name; the reorder shortfall counts items; the promo label is shop-free. No
customer-facing cart, order or checkout DTO carries a shop field at all. ⚠ The **rendered** two-shop
below-minimum cart still wants an operator's eye — grep finds identifiers, only reading finds phrasing.

**Telemetry (Principle VII):** `product_removed_from_cart` / `promo_code_applied` /
`promo_code_refused` join the existing `product_added_to_cart` / `cart_viewed`. The refusal carries the
REASON, because the distribution of reasons is the only thing that says which stop the platform keeps
inflicting. ⚠ Both fire through a **dynamic** `import("@/lib/telemetry")`: a static import from a cart
client component measured **+1.0 KB on four guest routes** and put `/search` and `/cart` over the
174 KB budget. **Mobile analytics remains deferred platform-wide** (013/014/015/020/021/022 pattern) —
this is not parity, and is not claimed as parity.

**Bundle:** measured stash/unstash. Baseline (HEAD) `/` 171.9 · `/browse` 169.8 · `/search` 173.2 ·
`/product/[id]` 172.1 · `/cart` 172.7 KB. With 027: 172.1 · 170.1 · 173.5 · 172.3 · **173.8** KB — a
**+0.2 to +1.1 KB** delta, all inside the pre-existing 174 KB gate. ⚠ `/search` sits 0.5 KB from the
limit; the next client dependency added to it will break the gate.

⚠ **Not live-verified yet.** The migration (`20260730102329_cart_sync_promotions.sql`) needs
`make db-up ENV=dev`; the promotions console needs `make edge-deploy SERVICE=admin ENV=dev`; and the
quickstart §3/§4 walks (cross-device sync, the merge, the eight refusals, the Stripe webhook
re-delivery, the `curl` bypass attempts) are operator-run. Everything machine-checkable is green.

---

## §028 — Customer Mobile Home: Sectioned Merchandising & Search Entry

| Capability | customer-web | customer-mobile | Notes |
| --- | --- | --- | --- |
| Merchandised, sectioned Home | ✅ | ✅ | mobile **reaches parity here** — 026 had reduced it to one flat grid |
| Horizontally scrolling product rails | ✅ | ✅ | mobile tile width is window-derived so a tablet fits more, not bigger |
| "See all" per section | ✅ | ✅ | mobile pushes a scoped `Results` route; Back returns to Home |
| Category shortcuts with icons | ➖ photo tiles | ✅ | 13 authored vectors + a fallback glyph; web still uses derived photos |
| Promotional banners between sections | ⚠ top only | ✅ | web renders the carousel at the top; mobile interleaves by `position` |
| Banner code + terms shown | ❌ | ✅ | web does not yet read `code` / `terms` / `target` — see below |
| One-tap search with keyboard raised | ➖ n/a | ✅ | a web address bar has no equivalent |
| Operator-controlled banners | ✅ back-office | ✅ back-office | one control, both surfaces (`/admin/v1/promotions`) |

**Path (Principle III):** the Home read is a latency-sensitive customer read → **hot path**
(`core-api/storefront`); marking a promotion advertisable is operator CRUD → **cold path**
(`edge-api/admin/promotions`). Exactly the split `promo_code` was built with in 027 — written cold,
read and redeemed hot. No boundary moved.

**⚠ This reverses 026's FR-025a for the Home tab**, on operator direction, recorded in the spec's
Context and bound by FR-003. Every other screen 026 composed is untouched. The virtue 026 was
protecting is retained as acceptance criteria the new layout must meet: **SC-002** (a real product
visible without scrolling) and **SC-006** (the last section within four swipes).

**⚠ A deliberate, temporary web gap.** `BannerDTO` gained `code`, `terms`, `target` and `position`,
all **optional**, so `customer-web` keeps typechecking untouched — but it does not read them. Until it
does, a promotion with a minimum spend shows its headline on web **without its terms**. Mobile shows
both (FR-037d). This is web's own slice, and it is a gap, not parity.

**⚠ One behavioural change that is NOT backward compatible.** `banners` used to always contain a
derived `"welcome"` stub; it is now **empty whenever no promotion is advertised**. `PromoCarousel`
already filtered to banners with artwork and returned `null` — so web absorbed the change without an
edit, but the guarantee it was relying on is gone.

**Advertising is opt-in and defaults to off.** Private promotions are ordinary — a goodwill credit
issued to one customer, a partner code — and a default of `true` would have put every one of them on
the public storefront. The default is the safety control; the console says in plain words what turning
it on does.

**Banner artwork** rides the **shared** presign helper, promoted from
`apis/edge-api/shop/src/products/media.ts` into `@effy/edge-shared` (Principle II) and consumed by both
services. Shop's 164 tests pass **unmodified**, which is the proof the extraction changed no behaviour.

**Telemetry (Principle VII):** seven Home events are **specified** (research R13) and **not emitted** —
mobile analytics remains deferred platform-wide (013/014/015/020/021/022/027 pattern). Not parity, and
not claimed as parity.

**Live status (signed off partial, 2026-07-31).** ✅ Migration applied; admin service deployed (the
presign route answers **401, not 404**); `core-api` confirmed running the new binary; the sectioned
Home, rails, skeleton and spacing verified on the **iOS simulator**.

⚠ **The banner has never rendered.** No promotion was ever marked advertisable, so `EffyPromoBanner`,
the pager, target navigation, the terms sentence, the artwork upload and the automatic take-downs are
**machine-verified only** — SC-014 and SC-015 unproven, and research R9's design risk (does a hueless
banner draw the eye?) unanswerable. ⚠ **Android was never looked at**, so SC-013's side-by-side is not
done. No measurements were taken (SC-005/SC-006/SC-008). Full record:
[specs/028-mobile-home-merchandising/SIGNOFF.md](../../specs/028-mobile-home-merchandising/SIGNOFF.md).

---

## §029 — Promotional Banner Templates & Home Carousel

| Capability | customer-web | customer-mobile | Notes |
| --- | --- | --- | --- |
| Canonical banner shape | ➖ unconstrained | ✅ 1200×600, 2:1 | one definition, generated to Compose and imported by the console |
| Operator can produce a conformant banner | ✅ back-office | ✅ back-office | canvas + downloadable template + validation; **not** an image compositor |
| Artwork conformance enforced | ✅ server-side | ✅ server-side | one guarantee, both surfaces |
| Never stretched / never cropped | ➖ | ✅ | satisfied **by construction** — see below |
| Dedicated offers carousel | ❌ | ✅ | web still renders banners at the top only |
| Exclusive placement per promotion | ✅ back-office | ✅ | carousel **or** between sections, never both |
| Banner code + terms shown | ❌ | ✅ | web still ignores `code`/`terms`/`target`/`placement` |
| Banner tap opens the promotion | ✅ | ✅ | added 2026-08-01 — **at parity**; web routes on `href`, mobile on `target`, one server decides both |
| Promotion detail (code · terms · expiry) | ✅ `/promotions/[id]` | ✅ `PromotionScreen` | one hot-path read serves both |

**Path (Principle III):** unchanged from 028 — the Home read is a latency-sensitive customer read on the
**hot path**; authoring is operator CRUD on the **cold path**. No boundary moved.

**The insight the slice turns on.** FR-013 ("fill without stretching, crop only outside the safe area")
reads like it needs crop arithmetic. It does not: if stored artwork is 2:1 **and** the render box is
2:1, the scale is uniform and **nothing is ever cropped**. That converted a rendering problem into a
*validation* problem — which is why the server-side conformance check carries more weight here than any
drawing code. It also means **SC-004 is satisfied by construction**: there are no crop boundaries to
inspect.

**⚠ The console is not the guard.** Artwork reaches S3 through a presigned PUT that Lambda never
observes, so client-side normalisation is a convenience. The admin service verifies dimensions on save
by reading image **headers** over a ranged GET — no `sharp`, no native binary in a Lambda. ⚠ WebP is a
different container from PNG/JPEG (RIFF, three sub-formats, **two of them 1-based**); getting that
wrong yields dimensions one pixel short, which looks right and fails an exact-size check.

**⚠ The message stays LIVE TEXT over the artwork** (FR-031), upholding 028's FR-033 rather than
reversing it. The cost is real and is carried by the platform, not the operator: a **gradient scrim**
guarantees contrast over artwork nobody has seen, and the console tells the operator which region their
design must leave quiet.

**⚠ A deliberate narrowing, recorded.** The request was "a fixed-size template for generating the
banner". What shipped is a template to design *from* — the canvas, a downloadable file, a preview and
validation — not an image compositor. It solves the problem operators actually had (nobody told them
the dimensions) without building an editor, and forecloses nothing.

**Telemetry (Principle VII):** three events specified, **none emitted** — the ninth consecutive slice to
defer mobile analytics. ⚠ This is the feature that most needs it: SC-012 and "does a hueless banner draw
the eye" are behavioural questions no code review answers.

⚠ **Live status (updated 2026-07-31, at sign-off).** Migration applied; `core-api` rebuilt locally —
⚠ it has **no cloud deploy**, so the banner read works only against a local instance. **Promotional
banners now render on a device — the first this platform has ever produced.** The wire contract holds
against real data: `placement` as a string, `position` as an integer, `terms` correctly `null` for
zero-minimum promotions. **SC-011 is proven at the read level** — an unadvertised promotion and an
expired one are live *simultaneously* with six visible ones and appear nowhere.

⚠ **Banner tap — defect found on device by the operator, fixed 2026-08-01.** Tapping a banner opened
the **unfiltered store**: the Search tab by another name, carrying **none of the promotion's facts** —
not the code, not the terms. The server hard-coded `{kind: "search"}` for *every* promotion, so the
destination was the same regardless of what was advertised, and the shopper lost the offer on the way
to it.

The honest reason no better destination existed is in the **data model**, not the navigation:
`promo_code` has **no product or category scoping**. A promotion is a whole-cart discount with an
optional minimum, so there is no set of qualifying products to filter a list to. A cart-level code is a
message, not a place — and the destination for a message is the message itself.

A banner now targets `{kind: "promotion", promotionId}` and opens a **promotion detail screen**
(artwork at the same locked 2:1, headline, subtitle, the code with copy-to-clipboard, the conditions
sentence, how long is left, how to use it, and the ordinary store one tap further on). It is served by
a new public hot-path read `GET /v1/storefront/promotions/:id` which **re-applies the same visibility
predicate Home used** — so a promotion that expired, was exhausted or was withdrawn while Home sat on
screen is answered **404 → "this offer has ended"**, with no retry affordance, rather than with terms
that are no longer true. 028 **FR-034a/FR-034b** record the amendment and why it does not conflict with
FR-034.

**Both surfaces, from one decision.** `customer-web` gained `/promotions/[id]` in the same change.
Web routes on `href` and mobile on `target` — the closed target vocabulary exists because mobile has
no URL router, while a URL is the web's native idiom — so the server sets **both** from the same
promotion id, and a Go test pins that they agree. Two fields naming one destination is precisely the
shape that drifts: one gets updated and the other quietly keeps sending a whole surface elsewhere,
which is what `/search` was.

⚠ **This closes half of 028's web carry-forward, not all of it.** The banner **face** on web still
does not render `code` or `terms`. But FR-037d requires a shopper to learn of a condition *"from the
banner **or from where it leads**, never first at payment"* — and where it leads now states them. The
face remains outstanding as a presentation gap, no longer as a shopper meeting a minimum at checkout.

⚠ **The web page is `noindex`** (follow, not index): a promotion is temporary, and a search result
promising an expired discount is worse than not being found. ⚠ It is also **uncached**, alone among the
public storefront reads — its content is a live claim that other shoppers can falsify by redeeming,
and a cached "still available" sends someone to the cart with a code that will be refused. Its **only**
client component is the copy-code button (`navigator.clipboard`, no library); the route measures
**171.0 KB / 174 KB** and was added to the bundle gate's route list in the same change that created it.

⚠ **But the operator half is still unwalked, and that is not a formality.** Every banner that exists
was **seeded straight into the database**, which is *precisely* the bypass path quickstart §2a exists to
prove is refused. It demonstrates rendering and says nothing about enforcement. Until §2a runs,
**FR-004 is decorative** and SC-002 rests on the seeder's own arithmetic. §2 (console walk, SC-001
unmeasured), the exhaustion take-down, dark/large-text, screen reader, tablet, and **Android — never
once looked at** — all remain outstanding.

**Parity gap with `customer-web`, unchanged from 028**: the storefront still ignores `code`, `terms`,
`target` and `placement`, so a promotion with a minimum spend shows there **without its terms**, and the
offers carousel is mobile-only.

---

## §030 — Suburb-aware delivery location

**Both surfaces move together, and that was the point.** 025 gave the storefront its up-front "do we
deliver to you?" answer but the only way in was a **postcode the shopper had to already know** — so a
shopper new to the area, renting, or who simply thinks in suburb names could not answer at all. For
that person the store's first interaction was a dead end. 030 lets them type **"Richmond"**.

| Capability | customer-web | customer-mobile |
|---|---|---|
| Find a place by suburb name | ✅ | ✅ |
| One input accepting either a postcode or a name (FR-006) | ✅ | ✅ |
| Every place identified by name + state + postcode (FR-008) | ✅ | ✅ |
| Verdict shown inside the entry surface (FR-028/FR-050) | ✅ | ✅ |
| Seeded from the account's default address (FR-018) | ✅ | ✅ |
| Sign-out drops an account place, keeps a device one (FR-023) | ✅ | ✅ |
| The place displayed rather than bare digits (FR-033/FR-039) | ✅ | ✅ |
| **Entry surface** | modal panel (unchanged shape) | **bottom sheet** (new — FR-026) |
| Keyboard-only operation (FR-051) | ✅ | n/a |

**Parity is of capability, not of form factor** — the bottom sheet is a mobile change by operator
direction; web keeps the modal panel it had.

**⚠ 025's FR-013 account half is finally wired.** `seedFromAccount` existed on **both** surfaces and
was called by **neither** — a shopper who had already told Effy where they live was still being asked
to type a postcode. It had been unmet since 025 shipped, on every surface, for three features.

**Data**: one migration `20260801122324_locality.sql` + `db/reference/au-localities.csv` —
**15,414 triples** derived from **16.9M** G-NAF address records (CC BY 4.0, attribution in
`db/reference/README.md`). ⚠ The table covers **all of Australia, not only served areas** (FR-002): a
served-only table would make "we've never heard of that place" and "we don't deliver there"
indistinguishable, which is the exact conflation this capability exists to prevent.

**⚠ The byte budget forced two design changes on web, and the gate is what found them.**
`next/dynamic` **alone made every route worse** (+0.4–0.6 KB; `/cart` went over budget) — the lazy
loader costs more than the small form it deferred. Getting under required also dynamically importing
the mount re-check, dropping the `loading:` fallback, and **splitting `DeliveryNotice` into its own
module** — it was riding in the always-loaded chrome on all six routes and is used on one. Separately,
the planned `DeliverySeedClient` module was replaced by a **prop on the component that already ships**,
because a new always-loaded client boundary does not fit in 0.2 KB. Final: `/` 172.7 · `/browse` 169.9
· `/search` 173.8 · `/product/[id]` 172.2 · `/cart` 173.7 · `/promotions/[id]` 170.8 — **four routes at
or below the pre-feature baseline**.

**⚠ FR-019 cannot fully hold on mobile.** The mobile delivery location still does not survive an app
restart (025's unmet persistence half). So a signed-in shopper who deliberately switches suburbs is
**re-seeded from their account default on next launch** — the explicit choice that was meant to
outrank it did not survive. It holds within a session. ⚠ **This feature makes a pre-existing gap
worse**: before it, nothing was ever seeded, so the gap only meant "retype it".

**✅ SIGNED OFF 2026-08-01** — 101/101. The operator walks are recorded as **operator attestation**;
the machine verification was observed directly. See
[SIGNOFF.md](../../specs/030-delivery-location-suburb/SIGNOFF.md).

**Live data**: 15,414 localities · 299 leading-zero postcodes · SC-002 coverage **0 uncovered** · the
prefix index confirmed in use (`Bitmap Index Scan`, 0.114 ms). Served postcodes are now all nameable —
**3350 covers 20 Ballarat localities, 3550 covers 12 in Bendigo**, and none of those shoppers could
have named their postcode.

⚠ **SC-002 failed on first run** and the fault was in the **zone** data: postcode **3001** (Melbourne's
PO Box code, zero street addresses in G-NAF) was in MEL-METRO. Removed — **not** papered over by
inventing a locality row.

**Carry-forwards**: mobile telemetry deferred an **eleventh** consecutive slice; the 028/029 banner
`code`/`terms` face gap on web is untouched by this slice; `/search` has ~0.2 KB of headroom left.
