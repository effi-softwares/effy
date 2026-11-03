# Implementation Plan: Guided Tours in Back-Office

**Branch**: `dev` (no feature branch) | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/107-backoffice-guided-tours/spec.md`

## Summary

Back-office gets 106's tours: 49 tours and 273 steps that start by themselves on a page's first use and can be
replayed from Help or ⌘K. The behaviour, the look and the stored record are 106's. This slice adds four things:

1. **Roles in the shared engine**: `roles` lists on steps and tours replace `managersOnly`, and shop-web is migrated
   in the same change (research R2).
2. **Two admin routes**: `GET|PATCH /admin/v1/me/tours` on the staff gateway (208 → 210 / 300), with
   `audience = 'admin'` in the existing table. No migration (R3).
3. **Back-office wiring**: the provider and Help in `AppShell`, ⌘K commands, `openRecord` for 14 record kinds,
   analytics with the role, and `useTourPage` plus `data-tour` keys on every routed screen (R4–R7, R10).
4. **Shared checks**: 106's word-for-word test and every-page guard move into `@effy/web-kit/tour/testing` and run for
   both consoles, plus a per-role check for Customer support (R8).

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Node 22 (Lambda)

**Primary Dependencies**: 106's `@effy/web-kit/tour`, `TourStepView` and `@effy/edge-shared/tours`; TanStack
Query/Router/Store. **No new package.**

**Storage**: `public.console_tour_state` (106), `audience = 'admin'`. **No migration.**

**Testing**: vitest. Words, coverage and role checks come from the shared helpers; handler tests in `edge-admin`;
the quickstart walk with three roles.

**Target Platform**: back-office SPA (desktop browsers first).

**Project Type**: monorepo web app + serverless service + shared packages.

**Performance Goals**: as 106. 49 tours of words add about 30 KB to back-office (about 9 KB gzipped).

**Constraints**: shadcn/Radix only; the staff gateway stays under 75%; the `?` key stays Keyboard shortcuts.

**Scale/Scope**: 49 tours, 273 steps, 45 routes, about 40 screens to tag, about 150 new keys.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 (unchanged).*

| Principle | Check | Result |
|---|---|---|
| I. Spec-driven | spec → this plan → tasks; spec amended (Customer support mark) before planning | ✅ |
| II. Shared contracts | No second copy: the engine, the look, the store, the state hooks and now the checks are shared (R8) | ✅ |
| III. One backend | Two routes in the existing `admin` service on the **staff** gateway (208 → 210, 70%); no new service | ✅ |
| IV. Auth isolation | Back-office authorizer; the audience is fixed to `'admin'` by the handler; the subject comes from the token; a back-office token never reaches a shop row | ✅ |
| V. Design | Nothing new to draw: 106's `TourStepView`; Help is an existing button pattern | ✅ |
| VI. Layered | Handler → `@effy/edge-shared/tours` service → store; the web side as 106 | ✅ |
| VII. Telemetry | The four `tour_*` events with `role` (a role name, not an identity); default Lambda alarms on the two routes | ✅ |
| Live updates (071) | PATCH exempted in `change-map.guard` with its reason, like 106's | ✅ |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation

```text
specs/107-backoffice-guided-tours/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/tours-api.md · contracts/tour-ui.md
└── checklists/requirements.md
```

### Source Code

```text
packages/web-kit/src/tour/
├── define.ts              # roles on steps and tours; needsRecord: string; validateTours unchanged limits
├── engine.ts              # StepContext { roles: ReadonlySet<string> }; tourAllowed(tour, roles)
├── TourProvider.tsx       # roles: string[]; analyticsRole; AutoStart/useTours/list filter by tourAllowed
├── TourHelpButton.tsx · AllToursDialog.tsx   # hide tours the person's roles don't allow
├── testing.ts             # NEW (Node-only): checkToursAgainstSpec, tourCoverage, checkRoleFiltering
└── engine.test.ts · __tests__/TourProvider.test.tsx   # roles cases
packages/web-kit/package.json                  # export "./tour/testing"

apps/shop-web/src/
├── routes/app.tsx                             # roles={roles}
└── features/tours/{tours.ts, tours.test.ts, tours.guard.test.ts}  # managersOnly → roles; tests call the shared helpers

apis/edge-api/admin/
├── serverless.yml                             # backOfficeToursV1Get / backOfficeToursV1Patch at /admin/v1/me/tours
└── src/functions/back-office-tours-v1-{get,patch}.ts (+ test)
apis/edge-api/shared/src/live/change-map.guard.test.ts   # exemption
docs/api/path-assignment.md                    # 107 note

apps/back-office/src/
├── components/shell/{AppShell.tsx, CommandPalette.tsx, UpdateBanner.tsx}
├── lib/telemetry.ts
├── features/tours/{tours.ts, repo.ts, openRecord.ts, tours.test.ts, tours.guard.test.ts, tours.roles.test.ts}
└── features/**/<Screen>.tsx                   # useTourPage + data-tour keys (every routed screen)
```

**Structure Decision**: Everything new in web-kit is a generalisation that both consoles use. Back-office-only code
lives in `apps/back-office/src/features/tours/` and in its screens.

## Delivery order (for tasks)

1. **Engine roles + shared checks** (web-kit), with shop-web migrated and green. This is the foundation.
2. **Admin routes** and the change-map exemption.
3. **Back-office wiring**: provider, Help, ⌘K, analytics, `openRecord`, and `tours.ts` generated from the spec.
4. **US1/US3: screens by area**, each area's `useTourPage` and keys:
   - Operations: overview, orders, order, dispatch, round, hand-over report, courier, exceptions, hub.
   - People: customers, points, customer, feedback, drivers, vehicles, shops.
   - Catalogue: products, imports, review, taxonomy, promotions, groups, skins, order rules.
   - Setup: the six delivery tabs, tax, deliverability, admin access.
5. **US2**: the role test (Customer support), the read-only steps, role-gated tours hidden from All tours.
6. **US4/US5**: live pages (presence advance, already in 106) checked on Dispatch and Exceptions; `role` on events.
7. Guards green, then FEATURE-HISTORY and CLAUDE.md, then the operator steps.

## Risks

- **A large tagging pass** (about 150 keys over about 40 screens): the coverage guard fails any key that is missing,
  and screens are done area by area, each area green before the next.
- **Role marks that are wrong in the spec**: the role test checks the code against the spec, not against what the
  server allows. The walk (quickstart 2–4) checks the marks against the real permissions.
- **shop-web regression from the `roles` change**: shop-web's words test now also compares role marks, and its
  provider tests run with role lists.

## Complexity Tracking

None.
