# Implementation Plan: Customer Storefront Redesign

**Branch**: `084-customer-storefront-redesign` (work is on `dev`; the operator commits) | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/084-customer-storefront-redesign/spec.md`

## Summary

Rebuild the appearance and layout of every `apps/customer-web` screen to the 139 reference screens
([screen-index.md](screen-index.md)), on a new **storefront identity** - zinc greys, blue for action,
green for brand, black for destructive, light only, Geist self-hosted, the "effy." wordmark. The old
storefront look is deleted, not layered over. Behaviour, wording, totals and the wire contracts the
installed apps use are unchanged. Two public routes are added and one read is extended, all in existing
services on the shared gateway.

Operator decisions (2026-10-12): customer-web only, authored so customer-mobile can adopt it later;
texted mobile-number verification held out; build foundation first, then screens group by group.

## Technical Context

**Language/Version**: TypeScript 5.9 (web + Lambdas), Node 22

**Primary Dependencies**: Next.js 16.2 App Router (SSR/PPR), React 19.2, Tailwind v4, shadcn/ui on
`radix-ui`, `lucide-react`, `@stripe/react-stripe-js` (Payment Element + Express Checkout - already in
use), `aws-amplify`. New client dependencies: `vaul` (phone drawers), `cmdk` (search suggestions),
`input-otp` only if the existing OTP field cannot take the reference shape - each measured against
the bundle budget before it is kept.

**Storage**: PostgreSQL 16, raw SQL. **No migration** - every new read is over existing tables.

**Testing**: Vitest + Testing Library (customer-web, edge-api), Playwright e2e (`apps/customer-web/e2e`),
design-system guards (`pnpm --filter @effy/design-system test`), repo sweeps under `scripts/`.

**Target Platform**: browsers, 360–1920 wide; SSR on Amplify Hosting; Lambdas behind the shared gateway.

**Project Type**: web application (one web surface + two backend services + one shared package).

**Performance Goals**: guest bundle within `scripts/bundle-budget.mjs` (176 KB) - any rise is measured
and recorded, never assumed; first view of home and product no slower than today (SC-007); search
suggestions within 500 ms of a pause (SC-008).

**Constraints**: light only; no red; pinned wording byte-identical; no refresh timers (071); no
`refetchInterval`; shopper services stay on the `effy_shopper` role; shared gateway ≤ 300 routes.

**Scale/Scope**: 139 reference screens → ~40 routes/states; ~24.5k lines of TSX touched; 2 new
routes, 1 extended read.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Note |
| --- | --- | --- |
| I. Spec-driven | PASS | spec → plan → tasks; screen index is the audit trail for "every screen" |
| II. Shared contracts | PASS | new/extended DTOs live in `@effy/shared-types`; new fields are optional so installed mobile apps are unaffected |
| III. One serverless backend | PASS | `storefront` gains `GET /storefront/v1/promotions` and `GET /storefront/v1/suggestions`; `commerce` order list is extended. **Shared gateway**, +2 routes; `gateway-capacity.contract.test.ts` must stay green. No new service, compute or gateway |
| IV. Auth isolation | PASS | unchanged; new routes are public reads; no token crosses pools |
| V. Design system | **FAIL → amended** | see Complexity Tracking. Requires constitution **v3.3.0** before any UI task |
| VI. Layered architecture | PASS | handler → service → repository for the new reads; web keeps server components + the existing stores |
| VII. Observability | PASS | new routes use the shared log/metric helper; new client events go through the typed taxonomy (`cart_saved_for_later`, `search_suggestion_selected`, `offers_viewed`) |
| Real-world identifiers | PASS | only `hello@effyshopping.com` (already approved, customer-facing) appears in the footer/help |

**Post-design re-check**: unchanged - V passes once the amendment (task T001) lands; nothing else moved.

## Project Structure

### Documentation (this feature)

```text
specs/084-customer-storefront-redesign/
├── spec.md
├── screen-index.md      # every reference screen → today's files → work
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── storefront-api.md   # new + extended wire shapes
│   └── ui-contract.md      # tokens, primitives, frames, routes
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/design-system/
├── src/storefront/
│   ├── tokens.css            # NEW - the storefront identity (the one file); own @theme, no .dark
│   └── fonts/                # NEW - Geist-Variable.woff2, GeistMono-Variable.woff2
├── stripe/storefront-appearance.ts   # NEW (generated) - Payment Element theme for the storefront
└── scripts/
    ├── check-storefront-tokens.mjs   # NEW - AA pairs, no red, no .dark, key set
    ├── check-token-usage.mjs         # + scans apps/customer-web against the storefront @theme
    └── gen-stripe-appearance.mjs     # + emits the storefront appearance

packages/shared-types/src/
├── storefront.ts   # + PromotionListDTO, SuggestionsDTO
└── order.ts        # + OrderSummaryDTO.thumbnails / stage (optional)

apis/edge-api/storefront/   (shared gateway)
├── src/promotions/{repository,service}.ts   # + list (same advertised predicate)
├── src/suggest/{repository,service}.ts      # NEW
└── src/functions/{promotions-v1-get,suggestions-v1-get}.ts   # NEW

apis/edge-api/commerce/src/orders/   # order list: + thumbnails, + stage

apps/customer-web/
├── app/globals.css                 # imports the storefront tokens; container → reference widths
├── components/ui/                  # the shadcn set the reference names (replaces kit.tsx)
├── components/storefront/          # Effy composites: Wordmark, ProductCard, Stepper, Rail,
│                                   #   DeliveryPicker, OrderTracker, PageHeader, EmptyState…
├── components/chrome/              # Header, DeliveryBar, AislesMenu, SearchCommand, CartSheet,
│                                   #   AccountMenu, BottomBar, Footer, CheckoutHeader, AuthCard
├── app/(shop)/                     # home, search, product, cart, offers (NEW), promotions, help
├── app/(account)/account/{page,orders,saved,points,personal,addresses,payment,security,privacy,legal}
├── app/(auth)/                     # one AuthCard for every step
├── app/checkout/                   # one-page checkout, payment, complete
└── e2e/                            # updated selectors; + offers, overview, save-for-later
```

**Structure Decision**: customer-web keeps its own `components/ui` (it already does - the shared
`@effy/design-system/ui` set is shaped and guarded for the consoles, and pulling its barrel onto the
guest path is what the bundle budget exists to stop). The **palette** lives in the design-system
package, once, so customer-mobile can later generate its Compose theme from the same file.

## Phasing

| Phase | What | Done when |
| --- | --- | --- |
| A. Law + foundation | constitution v3.3.0; storefront tokens, fonts, wordmark, icons; guards; container; primitives | a blank page renders the reference type/colour; guards green; consoles byte-identical |
| B. Frames | header (delivery bar, search, aisles menu, account menu, cart sheet, bottom bar), footer, checkout header, auth card, account sidebar | S1–S6, H6, H8, H9, H11, H12 match |
| C. Browse | product card, home, listing, product, 404/error | groups 1–3 (less offers) match |
| D. Buy | cart (+ save for later, undo), checkout, payment theme, confirmation | groups 5–6 match; totals unchanged |
| E. After | orders, account pages + Overview, saved, auth steps | groups 4, 7, 8, 9 match |
| F. New data | offers index, suggestions, order-list pictures/stage, help answers | P4, H7, O1, I1 match; P3 less its product rail (research D7) |
| G. Sweep | delete old components, old-look sweep, e2e, a11y, bundle, docs (CLAUDE.md, FEATURE-HISTORY.md) | SC-001…SC-010 |

Backend for F is written in parallel with C–E but **deploys before** the web that reads it; every
new field is read defensively (absent → the element is absent), so the web never depends on order.

## Operator steps (Claude writes, the operator runs)

1. `SERVICE=storefront` and `SERVICE=commerce` deploys to dev (`AWS_PROFILE=ef`) - after
   `gateway-capacity.contract.test.ts` passes.
2. customer-web deploy (Amplify, per 042).
3. The reference walk: every row of screen-index.md, desktop and phone.

No migration. No Terraform.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| **A second palette file** (Principle V "one palette, one file"; Quality Gate "a second file restating the platform palette is a defect") | The operator adopted a different identity for the storefront only. It is **not a restatement** of the platform palette - different greys, a green brand, black destructive, no dark block - so there is no single fact held twice. | Replacing `tokens.css` restyles two consoles and three mobile apps the operator said to leave alone. Overriding platform tokens inside customer-web's own CSS is exactly the scoped layer 057 was deleted for; putting the file in the design-system package keeps "the design system owns every palette" true. |
| **Light only** (V "dark mode REQUIRED on every surface") | The reference is light only by design. | Deriving a dark storefront nobody designed invents an identity; the amendment scopes the dark-mode requirement to the consoles and mobile. |
| **`--brand` ≠ `--primary`; green brand** (V "one brand hue carries every action") | In the storefront, blue is still the only *action* colour; green is brand and positive state (savings, paid, Delivered by Effy, progress). | Mapping green to platform `--success` forbids the Sale badge and tracker fill (`--success` may never be a fill with a label). |
| **`--destructive` is black; no red** | Reference rule; errors carry an icon and wording instead of a hue. | - |
| **Cards with `shadow-xs`; card layouts** (V "bordered, never shadowed"; "no card layouts") | The reference is card-built (checkout sections, order rows, account Overview) with shadcn's hairline shadow. Recorded justification: a storefront's units - a product, an address, a delivery section - are discrete choosable objects, which is what a card is for; the doctrine targets dashboard metric tiles on consoles. | Flattening them is redesigning the reference. |
| **Radius**: cards/dialogs 8, buttons/inputs 6 (V four-step scale has containers 10, buttons 8) | Reference shape. | The storefront guard asserts its own scale; `check-component-shape.mjs` keeps guarding the console primitives. |
| **Input border 1.3:1** (below WCAG 1.4.11's 3:1) | Reference's recorded deviation; borders are already the constitution's one contrast exception. Mitigation is binding: every field has a visible label and the focus ring is 3:1+ with a halo. | - |
