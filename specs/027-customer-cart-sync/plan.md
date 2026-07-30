# Implementation Plan: Customer Cart — Persistent, Synced & Complete

**Branch**: `027-customer-cart-sync` | **Date**: 2026-07-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/027-customer-cart-sync/spec.md`

**Artifacts**: [research.md](research.md) · [data-model.md](data-model.md) ·
[contracts/cart-api.contract.md](contracts/cart-api.contract.md) ·
[contracts/promotions-admin-api.contract.md](contracts/promotions-admin-api.contract.md) ·
[quickstart.md](quickstart.md)

---

## Summary

Effy's cart forgets. On `customer-mobile` it is a `MutableStateFlow` in memory
(`features/cart/domain/GuestCartStore.kt:12`), so a force-quit erases every decision the shopper made;
on `customer-web` it survives in one browser and nowhere else. The platform has had a complete cart API
since 019 — `GET`/`POST`/`PATCH`/`DELETE` on `/v1/cart` — and **no client has ever called any of it
except one `PUT`, once, at checkout entry**. The server cart is written but never read, so it cannot
sync, cannot merge, and cannot tell the shopper that an item vanished or changed price.

This slice makes the platform authoritative for a signed-in shopper's cart, gives the clients a durable
non-authoritative mirror so interaction stays instant, and completes the cart: honest re-pricing and
price-change notices, save-for-later, clear-cart, reorder from a past order, promotional codes with an
operator console to govern them, a configurable minimum order value, and platform-enforced ceilings.

**The technical spine.** Every cart write is made **idempotent by construction** — absolute quantities
instead of deltas, union-with-maximum instead of additive merge — and the one genuinely
non-idempotent operation (`add`, which must increment) carries a client-generated `changeId` deduped
inside the mutation's own transaction. The whole-cart `PUT /v1/cart` replace is **deleted**, which is
what makes "a week-stale device cannot clobber a cart built elsewhere" a structural property rather than
a hope. A monotonic `cart.revision` on every response lets the mirror discard an out-of-order reply in
one integer comparison. This reverses 019 research R8 "Option B"; the reversal, and why Option B's real
insight is preserved rather than discarded, is written up as [research.md](research.md) R0.

---

## Technical Context

**Language/Version**: Go 1.25 (hot path) · Node 22 + TypeScript (cold path) · Kotlin 2.4.0 / Compose
Multiplatform 1.11.1 (mobile) · React 19 + TypeScript, Next.js 16 App Router (customer-web) · Vite SPA
(back-office) · PostgreSQL 16

**Primary Dependencies**: Gin + pgx/v5 + raw SQL (no ORM) · Serverless Framework v3 + `@effy/edge-shared`
· Ktor client + `kotlinx.serialization` + Compose · TanStack Router/Query (back-office only) ·
`@effy/{design-system,shared-types,api-client,web-kit,mobile-kit}` · Stripe (`stripe-go/v82`)
· **no new dependency on any surface** (research R3, R9)

**Storage**: PostgreSQL 16, Goose, forward-only. One migration: 3 tables altered, 5 new
([data-model.md](data-model.md)). Client-side: `SharedPreferences` / `NSUserDefaults` via the existing
`DevicePreferences` (mobile) and `localStorage` (web)

**Testing**: `go test` (service with a fake repo — the existing `cart/service_test.go` pattern) · Vitest
(web + cold path) · Kotlin `commonTest` (Android + iOS) · Playwright (customer-web E2E) · the machine
gates in [quickstart.md](quickstart.md) §1

**Target Platform**: iOS + Android (minSdk 24 / target 36), modern browsers, AWS `ap-southeast-2`

**Project Type**: Monorepo, six surfaces — **three touched here** (`customer-mobile`, `customer-web`,
`back-office`) plus both backends and the database

**Performance Goals**: a cart mutation is on screen in **< 100 ms** (mirror-local, no network in the
path) · ten quantity taps produce **≤ 2** platform requests · a cart read stays one indexed query per
table over ≤ 100 lines · cross-surface visibility **< 5 s**

**Constraints**: `customer-web` guest bundle must not regress (currently ≈167 KB against a 160 KB budget
— **pre-existing**; measured as a delta, research R9) · the Amplify quarantine (`aws-amplify` reachable
only from `app/(auth)/`) stays green · no new design token, `tokens:check` unchanged · the mobile cart's
**visual** design is accepted as-is · `core-api` is local-Docker-only, so hot-path verification is local

**Scale/Scope**: ≤ 100 distinct items per cart · 13 hot-path routes (11 authenticated, 2 public) · 9
cold-path routes · 3 back-office screens · one migration · the mobile cart feature's data and domain
layers rewritten, its presentation extended

---

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — still passing, unchanged.*

| Principle | Status | How this slice complies |
|---|---|---|
| **I. Spec-Driven Development** | PASS | Spec → this plan → tasks → implement. One clarification was raised and answered (FR-066) before planning began; the spec carries zero tech. |
| **II. Monorepo with Shared Contracts** | PASS | `packages/shared-types/src/cart.ts` remains the single contract SSOT; Kotlin DTOs are **generated** from it with a drift guard. Nothing is hand-copied between surfaces. The existing `DevicePreferences` driver is reused rather than a second key/value store being invented. |
| **III. Dual-Path Backend Discipline** | PASS | Cart (a latency-sensitive customer transaction) stays on the **hot path**; promotions **administration** (internal operator CRUD) goes to the **cold path**. `public.promo_code` is written by the cold path and read by the hot path — the same shape `public.shop` already has. |
| **IV. Auth Isolation** | PASS | No auth change. Cart routes keep the customer-pool verifier + `customeridentity` (a barred customer is refused). Promotions use the back-office authorizer with 009's `admin.staff` gates (read: any active staff incl. `csa`; mutate: `admin`/`manager`). Nothing crosses a pool. |
| **V. Native-Feel, Consistent Design** | PASS | Mobile cart visuals accepted as-is; new affordances use the 026 monochrome language and the existing `StorefrontKit` primitives. **No card layouts** in the new console screens — a `DataTable` list plus sectioned detail rows, as `features/delivery/` already does; usage counts are detail rows and table columns, never metric tiles. Reference-platform grounding is explicit: save-for-later is Amazon's, reorder is Uber Eats'/eBay's, cart persistence is Adobe Commerce's model, substitution-style per-item extras are deliberately excluded. |
| **VI. Layered Architecture & Explicit Wiring** | PASS | Hot path keeps handler → service → repository with raw SQL and explicit row→domain mapping. Mobile gains `CartRepository` (domain port) → use cases → ViewModel; the mirror is a **domain-owned store**, never component state, and the ViewModel exposes one immutable observable state. No DI framework — `AppContainer` wiring stays explicit and greppable. |
| **VII. Observability & Telemetry** | PARTIAL (consistent with precedent) | Backend: structured logs on every cart mutation and every promo refusal reason; the existing `/metrics` endpoint covers the new routes. Web: PostHog events for add / remove / promo-applied / promo-refused. **Mobile analytics remains deferred platform-wide** (013/014/015) — this slice does not resolve it, and says so at sign-off rather than claiming parity it does not have. |

**Constitution amendments required**: none. Two *documented decisions* are amended, each recorded where
it lives:

1. **019 research R8 "Option B"** — reversed ([research.md](research.md) R0). The 019 research file gets
   an amendment note pointing here.
2. **`core/storage/DevicePreferences.kt`'s doc-comment** — narrowly widened to permit a
   *non-authoritative, reconciled-on-read* mirror under three stated conditions (research R3). Amended
   **in the file**, because that is where the next person will read it.

---

## Project Structure

### Documentation (this feature)

```text
specs/027-customer-cart-sync/
├── plan.md                                  # this file
├── spec.md
├── research.md                              # R0–R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cart-api.contract.md                 # hot path
│   └── promotions-admin-api.contract.md     # cold path + console
├── checklists/requirements.md
└── tasks.md                                 # /speckit-tasks output — NOT created here
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_cart_sync_promotions.sql            # NEW — 3 tables altered, 5 new

apis/core-api/internal/
├── features/cart/                           # REWORKED in place
│   ├── handler.go                           # +8 routes, widened DTOs, promo refusal mapping
│   ├── register.go                          # + a PUBLIC group (preview, policy)
│   ├── service.go                           # absolute set-qty, union-max merge/reorder, set-aside,
│   │                                        #   promo evaluation, policy limits, notices
│   ├── repository.go                        # + revision bump, saved items, change log, promo reads
│   ├── promo.go                             # NEW — code validation + discount computation (pure)
│   └── service_test.go                      # + idempotence, clamp, merge-max, the promo matrix
├── features/checkout/
│   ├── service.go                           # amount = payable + delivery − discount; minimum gate
│   └── store.go                             # FinalizeSucceeded += promo_redemption insert
├── features/orders/                         # receipt/history + discountAmount, promoCode
└── platform/
    ├── money/                               # reused (integer cents)
    └── cartpolicy/                          # NEW — the order_policy read

apis/edge-api/admin/src/
├── promotions/                              # NEW — mirrors src/delivery/
│   ├── types.ts  authz.ts  repository.ts  service.ts  handler-support.ts
│   └── *.test.ts
└── functions/                               # NEW — one file per route (9)
    └── promotions-*.ts, order-policy-*.ts

packages/shared-types/
├── src/cart.ts                              # SSOT: + revision, savedLines, discount, checkout,
│                                            #   limits, notices; − ReplaceCartRequest
├── src/order.ts                             # + discountAmount, promoCode on receipt/history
├── src/back-office.ts                       # + promotions + order-policy DTOs
├── contract/CommerceDto.kt                  # GENERATED (drift-guarded)
└── scripts/gen-kotlin-commerce-contract.mjs # extended only if the new shapes need it

apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/
├── core/storage/DevicePreferences.kt        # doc-comment amendment + a cart key
├── features/cart/
│   ├── domain/CartStore.kt                  # NEW — the mirror (replaces GuestCartStore)
│   ├── domain/CartSyncCoordinator.kt        # NEW — debounce, queue drain, reconcile
│   ├── domain/PendingChange.kt              # NEW — changeId + status
│   ├── domain/CartRepository.kt             # port widened: full CRUD + merge/reorder/promo/preview
│   ├── domain/usecase/                      # NEW — AddToCart, SetCartQuantity, RemoveFromCart,
│   │                                        #   ClearCart, SetAside, RestoreSaved, ReorderPastOrder,
│   │                                        #   ApplyPromoCode, RemovePromoCode, SyncCart,
│   │                                        #   MergeCartOnSignIn
│   ├── domain/GuestCart.kt                  # pure ops retained (packagesOf, addLine, …)
│   ├── data/HttpCartRepository.kt           # all routes
│   ├── data/CartLocalStore.kt               # NEW — JSON mirror + queue over DevicePreferences
│   └── presentation/CartScreen.kt           # EXTENDED only (saved section, promo field, notices,
│                                            #   clear, unsaved badge) — layout accepted as-is
├── features/checkout/presentation/CheckoutViewModel.kt   # the checkout-entry snapshot is DELETED
├── features/orders/presentation/            # + reorder action
└── core/session/SessionManager.kt           # sign-in → MergeCartOnSignIn; sign-out → mirror reset

apps/customer-web/
├── lib/cart-store.ts                        # mirror + revision + queue + debounce (no new dep)
├── lib/cart-sync.ts                         # NEW — the queue drain; mirrors the mobile coordinator
├── app/api/cart/                             # route handlers per operation (proxyToCore)
├── app/(shop)/cart/page.tsx                 # saved section, promo field, notices, clear, minimum
├── app/(shop)/_components/{CartBadge,MiniCart,AddToCartControl}.tsx
├── app/(shop)/orders/                       # + reorder action
└── app/checkout/CheckoutFlow.tsx            # reads the SERVER cart; the entry snapshot is removed

apps/back-office/src/features/promotions/    # NEW — mirrors features/delivery/
├── queries.ts  repo.ts  model.ts  access.ts  errorText.ts
├── PromotionsListScreen.tsx  PromotionDetailScreen.tsx  OrderRulesScreen.tsx
└── *.test.tsx
```

**Structure Decision**: no new package and no new service. The cart is reworked **in place** in
`apis/core-api/internal/features/cart/` — the routing law puts it there and 019 already built the slice.
Promotions become a new domain folder inside the existing `apis/edge-api/admin` service following
`src/delivery/`, the closest existing analogue (operator CRUD over pricing data the hot path reads). On
the clients the cart feature folders already exist and are extended; the only genuinely new client
concept is the mirror + queue pair, and it lives in each surface's own cart module rather than a shared
package, because Kotlin and TypeScript cannot share it and an abstraction across them would be fiction.

---

## Design: the client sync mechanism

The same four-part design on both surfaces, expressed in each one's idiom. It is written out here because
it is the genuinely new part of this slice, and the part where a plausible-looking shortcut reproduces
the exact bugs 019 spent two amendments fixing.

**1. The mirror is the only thing the UI reads.** One store per surface holding
`{ revision, lines, savedLines, discount, checkout, limits, pending[] }`. Mobile: a domain-layer
`CartStore` exposing an immutable `StateFlow` (MVVM, Principle VI) — it replaces `GuestCartStore` and
keeps its pure ops. Web: the existing `useSyncExternalStore` store, extended. The cart screen, the badge,
the mini-cart and the checkout entry read this and nothing else, so FR-014/FR-015 hold by construction
rather than by being fast enough.

**2. Every mutation is: apply to the mirror, enqueue, persist.** Synchronously, in that order, before any
network call exists. The enqueued item carries a `changeId` minted once per shopper *action* — a retry
reuses it (R2). Persisting the mirror **and** the queue together is what survives process death (FR-017;
quickstart scenario 10).

**3. The coordinator drains the queue.** Per-`productId` debounce of **400 ms**, at most one request in
flight per line, conflating a newer value onto a pending one (R4). Because quantity payloads are
absolute, dropping intermediate values is not merely safe — it is the point. Failures retry with backoff
and **stop** on a definitive refusal (FR-020), which surfaces as a visible unsaved state plus a reconcile
(FR-019).

**4. Reconciliation is a revision comparison.** Every response carries the cart and its revision; the
mirror adopts a response only when its revision exceeds what the mirror holds. Reconcile runs on cart
open, app foreground / tab focus (FR-008), sign-in (after the merge), and any successful queue drain. A
**guest's** mirror reconciles instead against `POST /v1/cart/preview`, which re-prices without writing —
that is how FR-004's "a restored cart shows current prices" is true for someone who has no server cart.

**Sign-in and sign-out.** `SessionManager`'s existing transitions gain two hooks: on **sign-in**,
`MergeCartOnSignIn` posts the device mirror's lines to `POST /v1/cart/merge` (union-with-max, idempotent,
so a retry or a second sign-in changes nothing) and adopts the returned cart; on **sign-out** the mirror
resets to an empty guest cart and the account cart is left untouched (FR-013).

**What gets deleted, deliberately.** `CheckoutViewModel`'s snapshot-at-entry (`:105`) and `CheckoutFlow`'s
snapshot-and-gate workaround both go. They exist only because the client was authoritative; keeping them
beside a server-authoritative cart would give checkout two sources of truth, which is the 2026-07-23 bug
family reintroduced under a new name.

---

## Phasing (the order the work must go in)

| Phase | What | Why it is gated here |
|---|---|---|
| 0 | Migration + `order_policy` seed | Everything reads the policy row and the new columns. |
| 1 | Contract (`cart.ts`, `order.ts`, `back-office.ts`) + Kotlin generation | Both clients and the Go DTOs are written against it; generating first stops hand-drift. |
| 2 | Hot path: cart service / repo / handler + `promo.go` + `cartpolicy` | The authority must exist before a client can stop being one. |
| 3 | Hot path: checkout (discount in the amount, the minimum gate, redemption inside `FinalizeSucceeded`) + the receipt | FR-048/FR-049 live inside an existing transaction; touching the one place money is decided is safest while the surrounding work is fresh, not last. |
| 4 | Cold path promotions + back-office screens | Independent of the clients, and it unblocks the quickstart's fixture creation that every promo test needs. |
| 5 | customer-mobile: local store → mirror → coordinator → use cases → screen | The largest single body of work; ordered inside-out so each layer is testable before the one above exists. |
| 6 | customer-web: store → sync → route handlers → pages | The same shape on the second surface; parity (SC-018) is only claimable once this lands. |
| 7 | Reorder on both surfaces (entry points in order history) | Depends on the cart being solid; deliberately last of the capabilities. |
| 8 | Verification sweep, the adversarial no-leak review, the bundle delta | SC-017 and the budget delta are review activities, not code. |

Phases 4 and 5/6 are independent and may interleave; **0 → 1 → 2 → 3 is a hard chain**. The P1 stories
(durability, cross-device, merge) are complete at the end of phase 6, which gives the slice a defensible
partial landing point if the promotions half slips.

---

## Risks

| Risk | Handling |
|---|---|
| **`GET /v1/cart` has never been called by anything.** It is about to become the most-hit route in the app, unproven against real data. | Phase 2 exercises it first against the 019 dev seed with a two-shop cart, before any client depends on it. Its `LATERAL` media pick and the new saved-item read are both measured, not assumed. |
| **The Kotlin contract generator may not express the new shapes** (nullable strings inside named objects, a widened `string \| null`). | The shapes were written generator-friendly on purpose (contract §8). If it still cannot, the generator is extended — it is our code — and the drift guard stays green either way. Not a reason to bend the contract. |
| **The checkout transaction is where money is decided.** Adding a redemption insert and a discount to `FinalizeSucceeded` touches the one path that has already produced two live-only bugs. | Phase 3 is isolated, unit-tested against the existing `service_test.go` fakes, and verified live by **re-delivering** a Stripe webhook (quickstart 19) — the exact test that would have caught the 020 API-version bug. |
| **Two-device convergence is hard to test honestly.** | Verified with two real clients against one local hot path (quickstart 6, 7), and additionally unit-tested with **out-of-order responses**, which is the failure a manual test will not reproduce on demand. |
| **The web bundle is already over budget.** | Delta measurement, both numbers recorded, no new dependency. Explicitly not fixed here. |
| **Scope**: three surfaces, a new commercial concept, and a rewrite of the cart's client layers. | The phasing above chains only where it must, and the P1 half stands alone. |

---

## Complexity Tracking

No constitution violations to justify. Three additions that look like complexity, argued rather than
assumed:

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| `public.cart_change_log` (a dedupe table) | Exactly-once for the one non-idempotent operation, `add` (FR-018) | Making `add` absolute-only removes the table but breaks the "tap Add twice, get two" behaviour of every reference platform. Trusting the client not to retry is not a guarantee. |
| `public.cart_saved_item` (a table, not a flag) | `cart_item` is read by checkout's order build, by the delivery quote and by the paid-order finalizer; a flag leaves "charged for a set-aside item" one forgotten `WHERE` away | A boolean column is a smaller diff and a much larger latent-defect surface (research R5). |
| `public.order_policy` (a singleton table) | The ceilings must reach the client to be explained (FR-037/038) and the minimum must be enforced **inside** the checkout transaction (FR-056) | SSM adds an AWS call to the cart read path and cannot join the transaction; a generic key/value settings table has no types and no `CHECK`s. |
