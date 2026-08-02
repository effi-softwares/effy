# Implementation Plan: Customer Saved Items — Watchlist, Guest Saving & Zone-Aware Purchasability

**Branch**: `033-customer-saved-items` | **Date**: 2026-08-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/033-customer-saved-items/spec.md`

**Phase 0**: [research.md](research.md) · **Phase 1**: [data-model.md](data-model.md) ·
[contracts/saved-items.contract.md](contracts/saved-items.contract.md) · [quickstart.md](quickstart.md)

---

## Summary

Replace the half-built favourites capability, on all three customer surfaces, with a
**price-and-availability watchlist** that tells the truth about the two things it currently gets
wrong: whether a product is saved, and whether the shopper can actually buy it.

The technical spine is four decisions:

1. **One bulk membership read** (`GET /v1/saved/ids`) feeding a client store that every save control
   subscribes to — never an `isSaved` boolean on catalogue reads, which would make every product
   response shopper-specific and destroy the storefront's static shell.
2. **One SQL statement** returning a five-way purchasability verdict for the whole list against the
   shopper's current delivery location — built on a **new shared four-term predicate** in
   `platform/delivery`, which also repoints `/v1/storefront/serviceability` so the storefront and
   checkout finally give one answer.
3. **A device-held guest list on both surfaces**, joined into the account by an idempotent set union
   on sign-in, disclosed by count.
4. **Reclaim before spend on the web bundle** — `/search` has 0.1 KB of headroom against a 174 KB gate
   that must not be raised.

---

## Technical Context

**Language/Version**: Go 1.25 (hot path) · Kotlin 2.4.0 / Compose Multiplatform 1.11.1 (mobile) ·
TypeScript + React 19 / Next.js 16.2.6 (web) · PostgreSQL 16

**Primary Dependencies**: Gin · pgx/v5 · raw SQL (no ORM) · Ktor client · kotlinx.serialization ·
Next App Router with `cacheComponents: true`. **No new runtime dependency on any surface.**

**Storage**: PostgreSQL 16 — one new table, one dropped. Goose, forward-only. Client-side:
`localStorage` (web) and `DevicePreferences` → SharedPreferences / NSUserDefaults (mobile).

**Testing**: Go table tests with hand-rolled fakes + testcontainers `postgres:16-alpine` behind
`-short` · Kotlin `commonTest` (JVM host) · Vitest (pure logic and client components only — it
**cannot** test async Server Components) · Playwright against a production build · a hand-duplicated
byte-identical Go↔Kotlin wire contract test.

**Target Platform**: iOS + Android (KMP) · modern browsers (SSR/PPR) · Linux ARM64 Fargate for the hot
path — though see the deploy constraint below.

**Project Type**: Monorepo vertical slice — one backend feature package, three client surfaces, one
shared-types change, one migration. No infrastructure change, no Terraform, no new AWS resource.

**Performance Goals**: full-cap list (200 items) renders complete verdicts within 2 s (SC-006) ·
membership resolved for a 24-product screen with **no** growth in cost per product (SC-005) ·
cross-device propagation within 60 s (SC-004).

**Constraints**:

- **`/search` guest bundle: 0.1 KB of headroom** against 174 KB, measured. `/cart` 0.3 KB, `/` 1.3 KB.
  The limit must not be raised.
- **Sydney RDS round trip ≈ 135 ms** from local `core-api`. A per-item query is not viable at the cap.
- `core-api` has **no cloud deploy** — local-Docker-only by platform decision. Pre-existing.
- The Amplify quarantine bars `aws-amplify` from every guest route, **transitively**, enforced by
  dependency-cruiser with `reachable: true`.
- `Text("♥` / `Text("♡` is a **build failure** on mobile (`scripts/mobile-guard.sh:106`).

**Scale/Scope**: 200 saved items per account, 50 per guest device · 5 purchasability outcomes ·
6 HTTP routes · 3 client surfaces · 1 migration · ~8 new shared DTOs.

---

## Constitution Check

*GATE: passed before Phase 0; re-evaluated after Phase 1 — see the bottom of this section.*

| Principle | Verdict | How |
|---|---|---|
| **I — Spec-Driven** | ✅ | spec → plan → tasks → implement. Every correction found in research is written back to the artifact (R2, R7, R12, R14, R16), not patched in code. |
| **II — Monorepo / Shared Contracts** | ✅ | DTOs live in `packages/shared-types`, generated to Kotlin, consumed by both clients. **⚠ Each new type must be referenced from the `CustomerCommerceContract` aggregator or it generates zero times and the drift check passes trivially** (R17). |
| **III — Dual-Path Discipline** | ✅ | Hot path, exclusively. Customer commerce on the shopper's critical path, invoked from every tile — 011's FR-028 routing law. Justified in R1. |
| **IV — Auth Isolation** | ✅ | Customer pool only. `auth.Middleware` → `customeridentity.Middleware`, in that order. Customer read from the resolved identity, never the request. A guest `401` is a **normal state**, not a failure. No new pool, client, or group. |
| **V — Native-Feel, Consistent Design** | ✅ *with a recorded justification* | Monochrome ramp, no new token, `tokens:check` unchanged. Heart drawables already ship in the mobile-assets SSOT. Card justification and the SC-009 colour risk: R18. |
| **VI — Layered Architecture** | ✅ | `internal/features/saveditems/` in the repository → service → handler shape; the shared predicate in `platform/delivery/`. Mobile MVVM with a formal use-case layer. No DI framework — one hand-wired container. |
| **VII — Observability & Telemetry** | ⚠ **conditional** | Events declared in the typed taxonomy. **But PostHog has never been initialised on customer-web** — see below. |

### ⚠ Principle VII is the one gate that does not cleanly pass

The taxonomy, the consent gate, the dynamic import and the tests all exist on customer-web. **The
consent UI that would switch it on does not** — a repo-wide grep for
`initAnalytics|setConsent|identifyCustomer|resetIdentity` finds zero non-test call sites — so
`capture()` has always been a no-op and no event has ever reached PostHog (R14). This is a
platform-wide gap this feature inherits, not one it creates; but FR-060 and SC-012/SC-013 require save
rate and save-to-cart to be *reportable from day one*.

**Resolution**: P10 carries a minimal consent affordance and is explicitly the **one phase that can be
cut**. If cut, FR-060 is met *structurally only* and **SC-012/SC-013 are unmeasurable and must be
recorded as such in the sign-off** rather than claimed. A deliberate, visible trade — not a silent
omission.

**Mobile telemetry stays deferred** — the **twelfth** consecutive slice. Stated plainly, not claimed as
parity, per the convention `docs/audiences/customer-capabilities.md` §027 already established.

### Post-Phase-1 re-evaluation

Design introduced no new violation. Two things sharpened:

- **Principle II gained a concrete failure mode** — the aggregator-registration gap is now a named
  verification step (quickstart §1b), not an assumption.
- **Principle III's hot-path choice inherits a deploy constraint** — `core-api` cannot reach dev. The
  feature is fully verifiable locally; go-live tracks the hot path's own slice. Recorded, not worked
  around.

---

## Project Structure

### Documentation (this feature)

```text
specs/033-customer-saved-items/
├── plan.md                              # this file
├── spec.md
├── research.md                          # Phase 0 — R1…R19
├── data-model.md                        # Phase 1
├── quickstart.md                        # Phase 1
├── contracts/
│   └── saved-items.contract.md          # Phase 1
├── checklists/
│   └── requirements.md
└── tasks.md                             # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
db/migrations/
└── <goose-stamp>_customer_saved_items.sql        NEW — creates customer_saved_item, DROPs customer_favorite

apis/core-api/
├── internal/platform/delivery/
│   └── purchasable.go                            NEW — the shared four-term predicate (R2)
├── internal/features/saveditems/                 NEW — replaces features/favorites/ entirely
│   ├── register.go                               routes only
│   ├── handler.go                                HTTP only; domain → wire DTO
│   ├── service.go                                business shaping; no HTTP, no SQL
│   ├── repository.go                             SQL only; the one-statement verdict read
│   ├── service_test.go                           hand-rolled fakes over the Reader seam
│   ├── repository_test.go                        testcontainers — the verdict SQL
│   └── wire_contract_test.go                     byte-identical literal, Go half
├── internal/features/storefront/repository.go    EDIT — Serviceable() repointed at the predicate (R2)
├── internal/features/orders/                     EDIT — productId on the order-item projection (R12)
├── internal/features/favorites/                  DELETED
└── cmd/core-api/main.go                          EDIT — swap one dependency + one Register line

packages/shared-types/
├── src/saved-item.ts                             NEW  (src/favorite.ts DELETED)
├── src/order.ts                                  EDIT — productId on the order item
├── src/customer-commerce-contract.ts             EDIT — ⚠ import + re-export + aggregator FIELD
├── src/index.ts                                  EDIT — swap the barrel export
└── contract/{commerce-schema.json,CommerceDto.kt}  REGENERATED — committed

apps/customer-web/
├── lib/saved-store.ts                            NEW — versioned localStorage + useSyncExternalStore
├── lib/saved-actions.ts                          NEW — mirror first, send second
├── lib/saved-api.ts                              NEW — fetch through the route handlers
├── app/api/saved/…                               NEW — proxyToCore route handlers
├── app/(shop)/_components/SaveControl.tsx        NEW — the client island
├── app/(shop)/_components/ProductCard.tsx        EDIT — ⚠ restructure the <Link>; slot, not a hook
├── app/(shop)/_components/SearchExperience.tsx   EDIT — ⚠ reclaim bytes FIRST (R5)
├── app/(account)/saved/…                         NEW  ((account)/favorites/ DELETED)
├── app/(account)/layout.tsx                      EDIT — nav is missing this and /addresses
├── app/(shop)/_components/StorefrontFooter.tsx   EDIT — repoint "Saved items"
├── app/(auth)/sign-in/SignInForm.tsx             EDIT — join on sign-in
├── app/(auth)/callback/CallbackHandler.tsx       EDIT — ⚠ and on the federated return
├── lib/telemetry.ts                              EDIT — drop the dead event, add the real ones
└── scripts/bundle-budget.mjs                     UNCHANGED — ⚠ the limit is not raised

apps/customer-mobile/shared/src/commonMain/kotlin/…/
├── features/saved/                               NEW — replaces features/favorites/ entirely
│   ├── domain/{Saved.kt,SavedStore.kt,SavedUseCases.kt}
│   ├── data/{HttpSavedRepository.kt,SavedLocalStore.kt}
│   └── presentation/{SavedScreen.kt,SavedViewModel.kt}
├── core/storage/DevicePreferences.kt             EDIT — ⚠ new key + amend the doctrine comment (R7)
├── core/presentation/StorefrontKit.kt            EDIT — optional BoxScope slot on EffyProductCard
├── core/nav/CustomerNavKey.kt                    EDIT — ⚠ FOUR edits or it breaks on iOS only
├── app/{AppContainer.kt,CustomerShell.kt}        EDIT — wiring; drop the guest gate on saved items
├── features/catalog/presentation/…               EDIT — product detail control reads real state
└── features/checkout/…                           EDIT — productId through to the order-detail line
```

**Structure Decision**: a standard vertical slice. One new Go feature package mirroring
`internal/features/storefront/`'s file split (`register` / `handler` / `service` / `repository`), one
new mobile feature module in the established `domain` / `data` / `presentation` shape, and web code
placed by the existing route-group rules — the store and control under `(shop)`, where they must not
touch `aws-amplify`; the list page under `(account)`, behind `requireCustomer`. The one genuinely new
shared artifact is `platform/delivery/purchasable.go`, which lives in `platform` rather than in either
feature for exactly the reason `zone.go:12-29` already gives: two features must not each own a copy of
the predicate that decides whether we can deliver.

---

## Implementation phases

Ordered so each phase is independently verifiable, and so the riskiest measurement happens before
anything depends on it.

| Phase | Story | What lands | Gate to pass |
|---|---|---|---|
| **P0** | — | Migration; delete `features/favorites/`, `src/favorite.ts`, both client modules; unwire | `core-test`, `pnpm -r typecheck`, guards green with the capability **absent** |
| **P1** | — | `platform/delivery/purchasable.go` + repoint `Serviceable()` | testcontainers: 3350 → false, 3121 → true; **checkout suite unmodified** |
| **P2** | US1 | `saveditems` package: six routes, verdict SQL, contract + codegen | `FULL=1 core-test`, `cm-contract-check`, §1b type census |
| **P3** | US1 | Mobile: store, persistence, use cases, control slot, screen, nav | `commonTest`, `cm-guard`, iOS process-death restore |
| **P4** | US1 | **Web reclaim on `/search` — measure before and after** | `cw-size` shows headroom **created** |
| **P5** | US1/US2 | Web: store, control, list page, proxy routes | `cw-size` still under 174; `depcruise` clean |
| **P6** | US2 | Verdict presentation + price movement, both surfaces | five outcomes render distinctly |
| **P7** | US3 | Guest saving + the join, both surfaces, **incl. the federated return** | 20 joins, zero lost/duplicated |
| **P8** | US4 | Bulk add-to-cart with itemised skips; `productId` on order lines (R12) | wire contract test; nothing silently omitted |
| **P9** | US5 | Entry points, grouping/ordering, the two distinct empty states | 5/5 observers find it |
| **P10** | US6 | ⚠ **Cuttable** — consent affordance so telemetry is not a no-op | `cw-size`; if cut, record SC-012/013 unmeasurable |

**P1 before P2 is deliberate.** The predicate is the feature's correctness foundation and it changes
existing storefront behaviour. Proving it in isolation — with checkout's suite passing **unmodified** —
separates "the predicate is right" from "the new feature is right".

**P4 before P5 is deliberate.** 030 proved a `next/dynamic` split can *cost* bytes. Reclaiming first
means P5 either fits or fails loudly, instead of quietly pushing `/search` over and being discovered
at the end.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The `/search` reclaim frees less than the control costs | **High** | P4 is its own gated phase. If it fails, reduce presentation further — the limit is not raised. Fallback: amend FR-007 for web only, in the spec, not silently. |
| `/` (1.3 KB) also breaches — it takes the control twice (rail + grid) | Medium | Measured in P4/P5. Same fallback. |
| Repointing `Serviceable()` shuts off more than intended | Medium | Container-backed test asserts **both** directions; quickstart §4c requires 3121 not to regress. |
| A new DTO never generates to Kotlin | Medium | Named type census, quickstart §1b. The drift check cannot catch this. |
| A count crosses as `1.0` and Go refuses it | Medium | `WireInt` on every count + the byte-identical wire contract test. |
| iOS-only nav crash after process death | Medium | Four-edit checklist (R15) + `ScreenInventoryTest`'s hard-coded route count. |
| Mobile guest list does not survive restart | Medium | 030's exact trap — a store built with a no-op `persist`. Explicit force-quit walk. |
| The cart's set-aside is disturbed | Low / severe | SC-015: cart suite must pass **unmodified**. |
| Telemetry ships as a no-op | **High if P10 is cut** | Stated as a cut consequence, not discovered at sign-off. |

---

## Telemetry (Principle VII)

New events, added to the typed `StorefrontEvent` union **first** — never inlined at a call site:

| Event | Props | Answers |
|---|---|---|
| `product_saved` | `{ productId, surface }` | save rate; which placement earns FR-007/FR-008 |
| `product_unsaved` | `{ productId, surface }` | churn |
| `saved_list_viewed` | `{ count }` | revisit rate |
| `saved_item_added_to_cart` | `{ productId }` | save→cart conversion |
| `saved_bulk_add` | `{ added, skipped }` | whether the bulk action is usable |
| `saved_guest_merged` | `{ added }` | ⚠ the feature's central bet — how much saving is guest saving |
| `saved_cap_reached` | `{}` | whether 200 is the wrong number |

**Removed**: `product_favorited` — declared in the union, documented as shipped in
`docs/telemetry/commerce-events.md:19`, and **fired by nothing** (FR-002).

**⚠ Call sites on guest routes must use a dynamic import** — `void import("@/lib/telemetry").then(…)`.
A static import from a cart client component cost **+1.0 KB on four guest routes** in 027, and at
0.1 KB of headroom that trade does not exist.

**No PII beyond the auth subject id.** `surface` is a closed enum of placement names, never a URL.

**Metrics/alerts**: none new. The hot path has no metrics emission path for this feature area, and
inventing one here would be a second mechanism competing with the platform's. Carry-forward.

---

## Complexity Tracking

*No entries.* No principle is violated and nothing in the design needs an exception. The two things
that look like deviations are not:

- **Repointing `/v1/storefront/serviceability`** is scope beyond this feature's own surfaces, but it is
  the *removal* of a live defect that FR-035/FR-037 would otherwise force this feature to reproduce on
  a new surface. Recorded as an operator decision in R2.
- **`EffyProductCard` on the saved list** is not a card layout in the sense Principle V prohibits —
  justification in R18.
