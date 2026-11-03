# Implementation Plan: Guided Tours in the Shop Console

**Branch**: `dev` (no feature branch) | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/106-guided-tours/spec.md`

## Summary

Every shop-web page gets a short tour that outlines the real thing on screen and explains it. The tour is offered
once per person (remembered across devices), never forced, and can be replayed from a header **Help** button or from
⌘K. The work splits into four pieces, three of them shared so back-office can reuse them in its own slice:

1. **`@effy/design-system/ui` `tour.tsx`**: a presentational step card on **Radix Popover** (anchored to any element
   through `PopoverAnchor virtualRef`), a spotlight cut out of the shared blurred backdrop, and a centred variant. It
   adds no new dependency (research R1). Dice UI's Tour was evaluated and rejected: it now depends on Base UI.
2. **`@effy/web-kit/tour`**: the behaviour. Provider, offer rule, step filtering by role and presence, `data-tour`
   lookup, scrolling, the Help button, the invitation, the All tours dialog.
3. **`@effy/edge-shared/tours` + shop service**: one table, `public.console_tour_state` (one row per person), with one
   writer, behind `GET|PATCH /shop/v1/me/tours` (shared gateway 165 → 167 / 300).
4. **shop-web**: `features/tours/tours.ts`, the one reviewable list holding the spec's 16 tours word for word; a
   `useTourPage` call on every screen; `data-tour` keys; and a guard that fails a page without a tour or a step that
   points at nothing.

## Technical Context

**Language/Version**: TypeScript 5.9; React 19; Node 22 (Lambda, arm64)

**Primary Dependencies**: radix-ui 1.6 (Popover, already present), TanStack Query/Store/Router, lucide-react;
Serverless v3; `pg`. **No new package.**

**Storage**: PostgreSQL 16, one new table `public.console_tour_state` (Goose, forward-only, raw SQL)

**Testing**: vitest (unit + static guards), container test for the store against local Postgres, a manual walk
([quickstart.md](quickstart.md))

**Target Platform**: shop-web PWA (Vite SPA) in desktop Chrome/Edge/Safari, iPad, and phone-width windows

**Project Type**: monorepo web app + serverless service + shared packages

**Performance Goals**: a step moves in under 100 ms. Tour state is one ~1 KB GET per console load, cached by
TanStack Query. The tour words add < 12 KB (gzip < 5 KB) to shop-web.

**Constraints**: shadcn/Radix only; one backdrop; tokens only; no new gateway beyond +2 routes; no polling; works
offline (R11); no PII in analytics

**Scale/Scope**: 16 tours, 104 steps, 14 routes rendered by 11 screen components, ~45 `data-tour` keys; tens of shop staff per shop

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 (unchanged).*

| Principle | Check | Result |
|---|---|---|
| I. Spec-driven | spec.md (no tech) → this plan → tasks.md | ✅ |
| II. Monorepo, shared contracts | DTO in `@effy/shared-types/tours.ts`; UI, engine **and the tour-state query/mutation** (R14) in design-system + web-kit; store + service in edge-shared, one source each | ✅ |
| III. One serverless backend | Two routes in the existing **shop** service, **shared** gateway (165 → 167 / 300, 56%); no new service, no always-on compute. Back-office later: admin service, staff gateway 208 → 210 (70%) | ✅ |
| IV. Auth isolation | Shop JWT authorizer; the subject from the token, the audience fixed by the service; no id in the path; a shop token cannot reach an admin row | ✅ |
| V. Design | Built from `PopoverContent`, `Dialog`, `Button` and `overlayClassName`, as-is; tokens only; light + dark; no cards used for layout (the step card is a floating layer, like a popover); touch targets 44px | ✅ |
| VI. Layered | Handler → `tours/service.ts` (`getTourState` / `changeTourState`, R15) → `store.ts` repository (raw SQL); web: repo → queries → provider; server state in Query, running-tour state in a TanStack Store (genuine client state); no DI | ✅ |
| VII. Telemetry | `tour_started/finished/closed/declined` (R10); standard route logging + default Lambda error alarms; no new metric (behaviour, not health) | ✅ |
| Real-world identifiers | None introduced | ✅ |
| Overlays rule (CLAUDE.md) | The one blurred backdrop, cut out; Radix only; no Sheet | ✅ |
| Live updates (071) | Not an order/round/slot/stock change, and only the caller changes it, so nothing to announce (contract note); no timers | ✅ |
| Activity-log rule (104) | No log is drawn; tours open no drawer | ✅ |
| Skeleton rule | Tours start only when `ready` (R6), never on skeletons | ✅ |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/106-guided-tours/
├── spec.md              # WHAT + the Tour Inventory (the words)
├── plan.md              # this file
├── research.md          # R1–R12 (library choice, targets, storage, routes, guards, telemetry)
├── data-model.md        # console_tour_state, DTO, TourDef
├── quickstart.md        # checks, operator order, the walk
├── contracts/
│   ├── tours-api.md     # GET|PATCH /shop/v1/me/tours
│   └── tour-ui.md       # tour.tsx, @effy/web-kit/tour, data-tour keys, shop-web wiring
└── checklists/requirements.md
```

### Source Code

```text
db/migrations/
└── 20261103120000_console_tour_state.sql            # NEW: table + checks

packages/shared-types/src/
└── tours.ts                                          # NEW: ConsoleTourStateDTO, ConsoleTourPatch, TOUR_KEY_RE, limits (+ index export)

apis/edge-api/shared/src/tours/                       # NEW: export "./tours"
├── index.ts
├── store.ts                                          # the ONE reader/writer of console_tour_state
├── service.ts                                        # getTourState / changeTourState (R15)
├── validate.ts                                       # parsePatch (exactly-one rule, key/version/outcome)
├── validate.test.ts
├── store.container.test.ts
└── tours.guard.test.ts                               # fails any other file naming console_tour_state

apis/edge-api/shop/
├── serverless.yml                                    # +2 functions: shopToursV1Get / shopToursV1Patch
└── src/functions/
    ├── shop-tours-v1-get.ts                          # NEW
    ├── shop-tours-v1-patch.ts                        # NEW
    └── shop-tours-v1.test.ts                         # NEW: 400s, 401, one-change rule

packages/design-system/src/ui/
├── tour.tsx                                          # NEW: TourStepView + parts (Radix Popover, spotlight, centred)
└── index.ts                                          # export

packages/web-kit/src/tour/                            # NEW: export "./tour"
├── index.ts
├── define.ts                                         # defineTours + dev asserts
├── store.ts                                          # TanStack Store: page, active, invitation
├── engine.ts                                         # shouldOffer, resolveTarget, nextShown, counter (pure)
├── state.ts                                          # tourStateQueries({ load, save }) (R14)
├── engine.test.ts
├── TourProvider.tsx                                  # wires state/write/openRecord/onEvent; renders TourStepView
├── useTourPage.ts
├── TourHelpButton.tsx                                # header "?" menu
├── TourInvitation.tsx
└── AllToursDialog.tsx
packages/web-kit/src/console/{StaffSidebar,StaffHeader}.tsx  # data-tour on nav items, search, account
packages/web-kit/src/patterns/{Page,Record,MoreActions}.tsx  # data-tour="page-title" on PageHeader + RecordHeader; `tour` prop

apps/shop-web/src/
├── features/tours/
│   ├── tours.ts                                      # SHOP_TOURS: the 16 tours, words from the spec
│   ├── repo.ts                                       # the two fetch functions for tourStateQueries
│   ├── openRecord.ts                                 # newest order / product (R12)
│   ├── tours.test.ts                                 # limits, unique keys
│   └── tours.guard.test.ts                           # every page registers; every target exists (R9)
├── routes/app.tsx                                    # provider, Help button, invitation, All tours
├── lib/query-persist.ts                              # tour mutation defaults + resume after restore
├── components/console/{CommandPalette,SoundChip,ScanButton,NewOrderAlert,PwaBanners}.tsx
├── lib/telemetry.ts                                  # four tour_* events
└── features/**/<Screen>.tsx                          # useTourPage + data-tour keys (11 screen components)
```

**Structure Decision**: The behaviour and the look live in the shared packages (design-system, web-kit,
edge-shared), so back-office's slice adds only `admin` routes, its own `tours.ts`, its `useTourPage` calls and its
`data-tour` keys.

## Delivery order (for tasks)

1. **Foundation**: shared-types DTO → migration → edge-shared store + validate + guard → shop handlers + serverless →
   `tour.tsx` → web-kit engine (pure, tested) → provider/hooks/components.
2. **US1 + US2 (P1, the MVP)**: shop-web `tours.ts` with the Orders Queue tour first, then wiring in `app.tsx`, Help,
   invitation, ⌘K; then the remaining page tours screen by screen, adding each screen's `data-tour` keys.
3. **US3**: Welcome tour + first-sign-in precedence + shell keys.
4. **US4**: presence/role filtering on the order and product pages, narrow-screen stand-ins, `data-tour-above`.
5. **US5**: telemetry events. **US6**: version re-offer wording.
6. Guards green → FEATURE-HISTORY entry + CLAUDE.md line → operator steps (quickstart).

## Risks

- **A target that is hard to outline** (a lane that scrolls horizontally, a sticky header): `scrollIntoView` with
  `block: "center"` plus re-measuring on scroll handles both. Verified on the walk (steps 4 and 6).
- **Tour words drifting from the screen** as consoles keep being redesigned: the static guard catches a target that
  disappeared, and raising `version` re-offers a rewritten tour. Wording that is stale but still has a target is
  caught only on review, so the FEATURE-HISTORY entry tells future redesigns to re-read the page's tour.
- **Radix modal layers hide the page while closing**: a tour started from Help, ⌘K or All tours waits until the
  opener has closed (R7), and presence ignores `aria-hidden` (R2).
- **Invitation fatigue**: offered once, dismissed by starting work, one switch to turn it off. SC-006 is measured in
  PostHog.

## Complexity Tracking

None.
