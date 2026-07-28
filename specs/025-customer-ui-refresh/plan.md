# Implementation Plan: Customer Experience Refresh (Web + Mobile)

**Branch**: `025-customer-ui-refresh` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/025-customer-ui-refresh/spec.md`

## Summary

Give the platform's two **public** surfaces — `apps/customer-web` and `apps/customer-mobile` — the
design pass they never had, at parity, using the reference-platform doctrine the constitution already
mandates (Uber Eats discovery + eBay product/search density, Principle V).

The technical approach in one paragraph: **share what already exists before building anything new.**
Feature 018 built a real mobile presentation foundation but built it app-local to `shop-mobile`, so
`customer-mobile` still renders lettered navigation glyphs; that foundation moves into
`packages/mobile-kit` and the design-system's existing per-app generator, and both apps consume it.
On web, the work is mostly composition — but it runs into a hard, already-failing constraint: the
guest bundle gate is at **167.4 KB against a 160 KB limit before this feature adds a byte**, so the
plan fixes that first and then holds the line with dependency-free client islands enforced by a
reachability guard. Two narrow public reads are added to the Go hot path — a serviceability boolean
that reuses checkout's exact postcode predicate, and sort-plus-count on the existing product search —
both authorised by spec FR-001a and no more.

## Technical Context

**Language/Version**: Go 1.25 (hot path) · TypeScript 5.9 / React 19 / Next.js 16.2.6 (customer-web) ·
Kotlin 2.4.0 + Compose Multiplatform 1.11.1 (customer-mobile, shop-mobile)

**Primary Dependencies**: Gin + pgx/v5 + raw SQL (hot path) · Next 16 App Router with
`cacheComponents` (PPR) · Tailwind v4 + `@effy/design-system` · Compose Material 3 +
`packages/mobile-kit` + Coil3 · **no new runtime dependency is added on any surface**

**Storage**: PostgreSQL 16 — **read-only for this feature. No migration, no schema change.** Existing
tables read: `public.category`, `public.product`, `public.product_media`,
`public.delivery_zone_postcode`.

**Testing**: `go test` (hot path) · Vitest + Playwright (customer-web) · Kotlin `commonTest` on Android
and iOS targets (customer-mobile, shop-mobile) · `tokens:check`, `brand-check`, `mobile-guard`,
`depcruise`, bundle-budget gates

**Target Platform**: Public web (SSR/PPR, indexable) · Android `minSdk 24` / iOS via KMP · hot path in
local Docker only (unchanged by this feature)

**Project Type**: Multi-surface monorepo — two client surfaces plus a hot-path service and two shared
packages

**Performance Goals**: No regression to the customer-web guest bundle (`160 KB` gate, currently
failing — see Phase 0) · storefront reads stay within existing hot-path latency · mobile lists scroll
at 60 fps with images loading asynchronously

**Constraints**: Guest bundle budget is the binding web constraint · guest-first (no capability may
require an account) · no fulfilment identity may leak (Principle: hidden fulfilment) · dark mode
required and user-selectable · design tokens are the single source of truth · SSR shell and crawl
policy must not regress

**Scale/Scope**: ~30 screens/routes across two surfaces · 5 user stories · 57 functional requirements ·
2 new public read capabilities · 0 migrations

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Both passes below.*

| Principle | Verdict | How this plan satisfies it |
|---|---|---|
| **I. Spec-Driven Development** | ✅ PASS | `spec.md` committed and clarified before this plan; this plan cites the constitution and chooses technology only inside the locked standards; a downstream gap returns to the spec (G1 below is the live example — recorded, with its reversal costed, not patched in code). |
| **II. Monorepo & Shared Contracts** | ✅ PASS | The mobile foundation is **shared, not copied** (R5) — `EffyComponents` moves to `packages/mobile-kit`, and `shop-mobile` is refactored onto it in the same change. `ProductSearchResultDTO` gains `total`/`sort` as one atomic edit in `@effy/shared-types`, with the Kotlin contract regenerated. Per-app binary assets are **generated derived artifacts with a drift check**, the pattern `packages/brand` already uses — not copy-paste. |
| **III. Dual-Path Backend Discipline** | ✅ PASS | Both new reads go on the **hot path** and the plan states why (R1): latency-sensitive customer reads, and 011's FR-028 routing law already binds catalog/search to `core-api`. Cold path explicitly rejected with its reason recorded. |
| **IV. Auth Isolation** | ✅ PASS | Untouched. No pool, client, authorizer, or token flow changes. Both new reads are **public and unauthenticated** and return nothing an account would gate (FR-001b). Guest-first is strengthened, not weakened. |
| **V. Native-Feel, Consistent Design** | ✅ PASS | This feature *is* the reference-platform doctrine applied. All colour/type/spacing/radius from the design-system SSOT; dark mode on every new screen with the runtime switcher honoured; native feel is US3's entire subject; touch targets and micro-animations are requirements (FR-036, FR-037). **No-card justifications recorded in R11** — exactly three permitted usages, everything else rows/tables/sections. |
| **VI. Layered Architecture & Explicit Wiring** | ⚠️ PASS with recorded deviation | Hot path keeps handler → service → repository with raw SQL and no ORM. Mobile keeps MVVM with immutable observable state and explicit wiring through `AppContainer`. **customer-web does not use the TanStack suite** — a pre-existing, deliberate deviation from Technology Standards which this feature continues and extends. Recorded in Complexity Tracking. |
| **VII. Observability & Telemetry** | ⚠️ PASS with standing exception | Web PostHog events declared in R12, with an explicit rule that **the postcode is never sent** — only `serviced: bool`. Hot-path metrics declared, with `postcode` deliberately excluded as a label (unbounded cardinality). **Mobile telemetry remains deferred** per the standing 013/014/015 platform exception with its own owning slice — stated, not skipped. |

### Post-design re-check (after Phase 1)

Re-evaluated against the completed `data-model.md` and `contracts/`. **No verdict changed.** Two
things the design surfaced that the pre-design pass had not:

1. **Principle II got easier, not harder.** `StorefrontCategoryDTO` already carries `parentKey` and
   `BannerDTO` already carries `imageUrl` — so the browse hierarchy and the carousel imagery need *no*
   contract change at all. G1 narrows to two additive fields, which is what makes its fallback a
   genuinely small reversal rather than a redesign.
2. **Principle VI gained a structural guarantee.** Extracting `ZoneForPostcode` into
   `internal/platform/delivery` means FR-014b is satisfied by *one predicate with two callers* rather
   than by two implementations kept in step by tests. That is a stronger guarantee than the pre-design
   pass assumed, and it is why SC-002a is expressible as a single parity test.

No new deviation was discovered. The Complexity Tracking table below is complete.

### Governance note G1 — a spec-boundary interpretation, named rather than smuggled

Spec **FR-001a authorises exactly two** new read capabilities. This plan additionally **enriches the
projection of the existing categories read** (child categories, product count, representative image)
to make category browse worth building (R4). That is treated as *not a third capability* — same
resource, same public authorisation, no new endpoint — but it is a judgement call, so it is on the
record here and in `research.md`. **If the operator disagrees, the fallback is one line**: browse
becomes a typographic index with no imagery or counts. Complies exactly; materially weaker.

## Project Structure

### Documentation (this feature)

```text
specs/025-customer-ui-refresh/
├── plan.md              # This file
├── research.md          # Phase 0 — R1..R14
├── data-model.md        # Phase 1 — read models + client state (no schema change)
├── quickstart.md        # Phase 1 — how to run and verify, incl. the SC-005 review matrix
├── contracts/
│   ├── storefront-serviceability.contract.md
│   ├── storefront-search-sort.contract.md
│   ├── storefront-categories.contract.md
│   └── customer-ui.contract.md          # cross-surface UI contract (parity + guest-path rules)
├── checklists/
│   └── requirements.md  # spec quality checklist (all passing)
└── tasks.md             # Phase 2 output — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
apis/core-api/internal/
├── platform/delivery/                    # EXTRACTED here: the one postcode→zone predicate (R2)
└── features/storefront/
    ├── handler.go                        # + serviceability route, + sort/total on search
    ├── search.go                         # per-sort keyset + concurrent count
    ├── cursor.go                         # NEW — opaque, sort-tagged cursor encode/decode
    ├── categories.go                     # enriched projection (G1)
    └── *_test.go                         # cursor, count-vs-walk, serviceability parity

packages/
├── shared-types/src/                     # ProductSearchResultDTO: + total, + sort (atomic)
├── design-system/
│   ├── mobile-assets/                    # NEW — authored icons + Nunito Sans, one copy
│   └── scripts/gen-compose-theme.mjs     # + type scale emission, + asset sync, drift-checked
└── mobile-kit/
    ├── ui/EffyComponents.kt              # MOVED from shop-mobile, neutral package
    ├── shell/ResponsiveNavigation.kt     # existing — customer migrates onto it
    └── shell/AdaptiveNavShell.kt         # DELETED with NavGlyph (source of the lettered glyphs)

apps/customer-web/
├── app/(shop)/
│   ├── layout.tsx                        # + persistent search entry, + delivery affordance island
│   ├── browse/page.tsx                   # placeholder REPLACED with the category index
│   ├── search/                           # URL-driven refinement, sort, count
│   ├── product/[id]/page.tsx             # gallery, delivery estimate, qty, related rail
│   └── _components/                      # fluid ProductCard, real carousel, toast, mini-cart
├── lib/delivery-store.ts                 # NEW — dependency-free, localStorage
├── scripts/bundle-budget.mjs             # + /search and /product to GUEST_PAGES
└── .dependency-cruiser.cjs               # + guest-path radix/sonner quarantine (reachable: true)

apps/customer-mobile/shared/src/commonMain/.../
├── app/CustomerShell.kt                  # ResponsiveNavigation + real icons + app bars
├── core/theme/                           # generated type scale, Nunito Sans
├── core/ui/                              # skeletons, snackbars, pull-to-refresh
└── features/{catalog,cart,checkout}/presentation/   # the screens themselves

apps/shop-mobile/shared/src/commonMain/.../core/ui/   # REFACTORED onto mobile-kit, no behaviour change

docs/audiences/customer-capabilities.md   # parity register — updated at sign-off
```

**Structure Decision**: No new app, service, or package is created. The feature adds two routes to an
existing hot-path feature slice, extends two shared packages, and rewrites presentation inside two
existing client surfaces. `packages/mobile-kit` stays a raw source directory consumed via
`kotlin.srcDir` (R5) — sharing `commonMain` Kotlin needs no build change, and converting it into a
full Gradle module is deliberately out of scope.

## Phasing

Phase 0 is foundation and lands before any user story, because all five depend on parts of it and
doing it per-story would mean doing it three times (R14).

| Phase | Content | Gate to pass |
|---|---|---|
| **0 — Foundation** | Fix the **pre-existing** bundle overage; extract the delivery predicate; add serviceability + sort/count + the enriched categories read; shared-types change + Kotlin regen; extract the mobile foundation and refactor shop-mobile onto it | Bundle gate **green**; `go test`; contract drift clean; shop-mobile unchanged behaviourally |
| **1 — US1 Discovery** | Category browse, persistent search entry, delivery affordance, refinement + sort + count, real carousel, fluid tiles | SC-001, SC-002, SC-002a, SC-003, SC-003a |
| **2 — US2 Product** | Interactive gallery, delivery expectation, quantity beside action, sticky buy bar, related rail | SC-001 (path), FR-022..FR-028 |
| **3 — US3 Mobile chrome** | Icons, app bars, safe areas, skeletons, pull-to-refresh, snackbars, cart images, motion | SC-006 |
| **4 — US4 Cart/checkout** | Add feedback, mini-cart, undo, sticky summary | SC-004 |
| **5 — US5 Coherence & a11y** | Typeface parity, token audit, screen reader, keyboard, grayscale, max text size | SC-007..SC-011 |
| **Sign-off** | Structured visual review + parity register | SC-005, SC-012, SC-013, SC-014 |

## Complexity Tracking

> Deviations from the constitution, recorded per Quality Gates. An undocumented deviation is a defect;
> these are documented.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **customer-web uses none of the TanStack suite** (Technology Standards lock Router/Query/Store as the web client spine). This feature extends that: the new delivery-context store and toast store are hand-written `useSyncExternalStore`. | Pre-existing and deliberate (011/019). This surface is the only **public** web app, and its guest bundle gate is the constraint that protects the storefront's SSR-first performance promise. Server state arrives through React Server Components — under `cacheComponents` the RSC/PPR layer *is* the server-state cache Principle VI asks for, so the requirement is met by a different mechanism, not skipped. | Adding TanStack Query/Store to guest routes spends the budget that is already over (R6). The two consoles and the authenticated customer routes keep the full TanStack spine — the deviation is scoped to the public path, not platform-wide. |
| **Guest routes may not use `radix-ui` / `sonner` / `vaul`**, tightening the locked shadcn-on-Radix standard. | The same budget constraint. A carousel, a gallery, and a sticky summary are achievable in pure CSS; a toast and two dialogs are achievable in ~30 lines each against platform primitives. | Shipping Radix on guest routes and "optimising later" is how the current 167.4 KB overage happened. The primitives remain the standard everywhere they are affordable — authenticated customer routes and both consoles. |
| **Two new server reads inside a feature the spec frames as presentation** | Authorised explicitly by spec FR-001a after operator clarification. Neither can be faked in presentation without lying to the shopper about delivery or about how many results exist. | Reducing the presentation instead (spec's own fallback) was offered and declined; recorded so the widened boundary stays auditable. |
| **G1 — enriching the existing categories projection** (above) | Category browse without imagery or counts is materially weaker for a food-first store. | The strict reading's fallback is identified and one line to apply. Named here so it is the operator's call, not a silent one. |
| **Mobile telemetry not shipped** (Principle VII) | Standing platform exception since 013/014/015, with an owning slice (`mobile-telemetry`). | Building a mobile telemetry pipeline inside a UI feature would be a second feature wearing this one's clothes. |

## Risks

1. **The bundle overage may not be cheap to fix.** It is pre-existing, measured, and currently
   unexplained at the chunk level. Phase 0's first task is to *measure* it before committing to a fix;
   if the cause turns out to be the Next 16 + React 19 framework floor rather than app code, the honest
   outcome is a reasoned, reviewed ratchet of `GUEST_LIMIT` with the measurement recorded — not a
   silent bump, and not pretending the feature caused it.
2. **Refactoring `shop-mobile` onto the shared foundation touches a signed-off surface.** SC-012 makes
   "no behaviour change" a gate. Its 152 existing tests plus `mobile-guard` are the safety net.
3. **The hot path has no cloud deployment**, so every storefront capability here — including the two
   new reads — is verifiable only against local Docker. This is inherited, not introduced, and the
   feature's live sign-off is bounded by it.
4. **SC-002/SC-003/SC-013 need moderated testing with real people.** They cannot be closed by any
   automated check, and the plan should not pretend otherwise; `quickstart.md` defines the protocol.
