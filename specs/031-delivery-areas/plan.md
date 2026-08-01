# Implementation Plan: Delivery Areas — Locality-Driven Zones & Per-Area Service Levels

**Branch**: `031-delivery-areas` (to be created from `main`, which is now current — the 030 merge
brought 027/028/029 with it) | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/031-delivery-areas/spec.md`

## Summary

Give the back office the locality record 030 built, and move delivery decisions to where operations
already thinks: **per area**, not per zone pair.

Three pieces:

1. **Compose zones from real places.** A locality search in the admin console replaces the free-text
   postcode box. ⚠ Choosing a place makes its whole **postcode** serviceable, so the interface must
   say which other places that includes — the single most important interaction in the slice.
2. **Configure service levels and fees per area**, including an explicit **"deliberately not served"**
   state, so an unserved area is a recorded decision rather than a missing row.
3. **Make a broken configuration visible** — an area with no place behind it, an area nobody
   configured, a zone serving nobody.

**This is entirely a cold-path, operator-facing slice.** ⚠ `core-api` gets **zero** changes: FR-028
forbids altering what a shopper experiences, and its existing suites passing **unmodified** are the
guard.

⚠ **The feature has a live defect to answer for.** `REGIONAL` serves Ballarat and Bendigo and has zero
inbound offerings, so the storefront says "we deliver here" and checkout cannot quote — 025's FR-014b
violated in data rather than in code. It is deliberately not patched quietly, because nobody can
currently tell whether that zone was *deliberately unpriced* or *never finished*, and that ambiguity is
exactly what this feature removes. See research [R5](./research.md).

## Technical Context

**Language/Version**: Node 22 + TypeScript (cold path, Serverless v3, Lambda arm64) · React 19 +
TypeScript (back-office SPA, Vite) · PostgreSQL 16 (Goose, forward-only)

**Primary Dependencies**: **none added.** The console already has the TanStack suite, `@effy/web-kit`
console chrome and `@effy/design-system/ui` primitives (incl. `DataTable`, `dialog`, `select`,
`badge`). The admin service already has its delivery slice, `pg`, and an audit trail.

**Storage**: one migration for the per-area decision record (research [R4](./research.md)); **no
structural change to `delivery_offering`, `delivery_zone` or `delivery_zone_postcode`** — the grid
remains the storage and quoting mechanism the per-area view writes through to.

**Testing**: Vitest (admin service — service + repository shape; back-office — components and the
disclosure rule) · the SC-014 assertion in the **admin service's** suite (⚠ NOT core-api's — T053 requires that diff to stay empty) ·
⚠ **core-api's existing `storefront` and `checkout` suites must pass UNMODIFIED** (research
[R8](./research.md))

**Target Platform**: AWS Lambda (arm64) behind the shared HTTP gateway with the back-office authorizer ·
back-office SPA on :5173

**Project Type**: back-office console feature over an existing cold-path service

**Performance Goals**: locality suggestions within 1 s for an operator (a cold-start-tolerant audience,
unlike 030's per-keystroke shopper path); the per-area view answers "what does this area get?" in one
request

**Constraints**: **no change to the shopper's experience** (FR-028/FR-030/FR-031) · no new delivery
method (FR-029) · no distance or routing capability (research [R6](./research.md)) · no sub-postcode
granularity (research [R2](./research.md)) · no new design token · **no card layouts** — this is a
console, and the doctrine prefers tables, lists and detail rows

**Scale/Scope**: 2 zones / 4 postcodes / 3 offerings today, designed for tens of zones and hundreds of
areas · **6** new cold-path routes · 1 migration · 1 console feature slice · 0 new dependencies ·
**0 customer-surface changes**

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design. Result: **PASS**, no exceptions.*

| Principle | How this plan complies |
|---|---|
| **I — Spec-Driven** | spec → plan → tasks → implement. Both open questions were settled **from live data** and recorded in the spec's *Resolved Scope Decisions*, not decided here. The live `REGIONAL` defect is written into the spec as the motivating example with its own criterion (SC-014) rather than fixed silently. |
| **II — Monorepo & Shared Contracts** | `LocalityDTO` is **reused unchanged** from `@effy/shared-types` — the operator sees the same shape the shopper does. New area DTOs are declared once there and consumed by both the Lambda and the console. ⚠ The back office is a TS surface, so there is no KMP codegen step here — but the type is still declared once, not twice. |
| **III — Dual-Path** | **Entirely cold path.** Operator CRUD at operations cadence — the doctrine's central case, and where 021 already put this console. ⚠ The locality read is a **new admin endpoint**, deliberately NOT a call to core-api's storefront read: `core-api` has no cloud deployment, so that would work locally and fail in dev. Same table, two services, two paths — exactly `promo_code`'s split (research [R1](./research.md)). |
| **IV — Auth Isolation** | Reuses the back-office authorizer and the delivery slice's existing authz (read = any active staff; mutate = `admin`/`manager`). No new pool, no new client, no token crosses a boundary. The locality read is admin-scoped even though the same data is public to shoppers — the **audience** decides the gate, not the data's sensitivity. |
| **V — Design System** | **No new token.** ⚠ **No cards** — the per-area view is a sectioned detail page with rows, and the health surface is a list, not a grid of metric tiles. Reuses `@effy/design-system/ui` and `@effy/web-kit/console`. ⚠ Note the guest-path dependency prohibition that shaped 030's web panel **does not apply here**: the back office has no bundle budget. |
| **VI — Layered Architecture** | Cold path: `handler → service → repository`, raw SQL, DTOs mapped explicitly at the edge — the shape this slice already has. Console: `repo → query hooks → screens`, server-state cache as the source of truth. ⚠ The per-area write is a **service-layer projection** onto offering rows: the handler composes no SQL and the console does not know the grid exists. |
| **VII — Observability** | **No new product-analytics event** — internal console, and the taxonomy is customer-behavioural. FR-009/FR-016 are met by **extending the existing audit trail**, not inventing one. ⚠ **The metric is DEFERRED, explicitly**: no cold-path service emits one today, so there is nothing to add a gauge to. The same three counts are available on demand from `/delivery-health`. Recorded as a carry-forward rather than declared-and-not-built. |

**No Complexity Tracking entries.** Nothing here deviates from a principle.

Three things worth stating because they *look* like deviations and are not:

- **A new admin locality endpoint duplicates a storefront endpoint.** It duplicates the *route*, not
  the data or the contract — one table, one DTO. Two audiences on two paths, and a Lambda cannot reach
  core-api.
- **Per-area configuration writes many offering rows from one edit.** That is a projection, not a
  second source of truth. The grid stays authoritative; the area view is how a human addresses it.
- **Collapsing per-origin pricing loses expressiveness on purpose.** Recorded in the spec's Assumptions
  and research [R3a](./research.md), with live evidence ($5 vs $8) that it is a real loss, not a no-op.

## Project Structure

### Documentation (this feature)

```text
specs/031-delivery-areas/
├── plan.md              # This file
├── spec.md              # WHAT / WHY  (31 FRs · 4 stories · 14 SCs)
├── research.md          # Phase 0 — R1…R9
├── data-model.md        # Phase 1 — the decision record + the projection
├── quickstart.md        # Phase 1 — operator runbook + the walks
├── contracts/
│   └── delivery-areas.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
db/migrations/
└── <timestamp>_delivery_area_decisions.sql      # NEW — the three-state decision record

apis/edge-api/admin/src/
├── delivery/
│   ├── localities.ts            # NEW — operator locality search + "what else is in this postcode"
│   ├── areas.ts                 # NEW — per-area read + the projection onto offerings
│   ├── health.ts                # NEW — unknown place / unconfigured / empty zone
│   ├── service.ts               # + area ops; addZonePostcodes gains the existence warning
│   ├── repository.ts            # + locality reads, decision record, area projection
│   └── types.ts                 # + Area, AreaServiceLevel, AreaDecision, AreaHealth
└── functions/
    ├── delivery-localities-list-v1-get.ts       # NEW
    ├── delivery-localities-coverage-v1-get.ts   # NEW — ⚠ the FR-006 endpoint. Omitted from an
    │                                            #    earlier draft's count, which would have left the
    │                                            #    deploy check not verifying the feature's most
    │                                            #    important interaction.
    ├── delivery-area-get-v1-get.ts              # NEW
    ├── delivery-area-configure-v1-put.ts        # NEW
    ├── delivery-area-not-served-v1-post.ts      # NEW
    └── delivery-health-v1-get.ts                # NEW
    #  + serverless.yml entries (53 functions today)

packages/shared-types/src/
└── delivery.ts                  # + area DTOs;  LocalityDTO REUSED unchanged

apps/back-office/src/features/delivery/
├── components/
│   ├── AddAreasDialog.tsx           # NEW — replaces AddPostcodesDialog as the primary path
│   ├── PostcodeCoverageNotice.tsx   # NEW — ⚠ FR-006. Its own component so it cannot be
│   │                                #    reduced to a tooltip by accident.
│   └── AreaServiceLevelForm.tsx     # NEW — standard / scheduled / same-day / not-served
├── AreaDetailScreen.tsx         # NEW — "what does this area get?", one screen
├── DeliveryHealthPanel.tsx      # NEW — the three defect classes
├── ZoneDetailScreen.tsx         # + areas by NAME, not only postcode
├── model.ts / queries.ts / repo.ts   # + the new reads and writes
└── AddPostcodesDialog.tsx       # RETAINED as the escape hatch (FR-004), no longer primary

apis/core-api/                   # ⚠ UNCHANGED — its suites passing unmodified is the FR-028 guard
apps/customer-web/               # ⚠ UNCHANGED
apps/customer-mobile/            # ⚠ UNCHANGED
```

**Structure Decision**: everything lands in the **existing** `delivery` slices on both the admin service
and the console — this reshapes a shipped feature rather than adding one. The only genuinely new
artifacts are the decision-record migration and the health surface.

⚠ **`PostcodeCoverageNotice` is deliberately its own module.** FR-006 is the requirement most likely to
be quietly under-built into a tooltip nobody reads; a named component with its own tests makes that
harder to do by accident.

## Work stages

⚠ **These are engineering stages, not `tasks.md` phases** — that file is organised by user story and
both use ordinal numbers.

| Stage | Work | Why here |
|---|---|---|
| **1** | Decision-record migration + repository reads | Everything downstream needs the three-state answer to exist. |
| **2** | Admin locality search + the coverage query | The data behind FR-006. |
| **3** | Area composition: service + disclosure + unknown-postcode warning | US1 — closes the 3001 class of defect. |
| **4** | Per-area configuration: the projection onto offering rows | US2 — the largest piece. |
| **5** | Same-day: shop list + acknowledgement | US3 — small, and the only customer-harming path. |
| **6** | Health surface | US4. |
| **7** | ⚠ **The FR-028 guard**: core-api suites re-run unmodified; the SC-014 assertion added | The one gate that says this feature did not leak. |
| **8** | Sweep + operator walks | Three SCs are observer tests. |

## What this plan does NOT let itself assume

Recorded because the last four slices each lost time to one of these.

- **A green test is not a correct test.** 028 and 029 shipped fixtures that agreed with the code rather
  than the world; 030's Kotlin contract test asserted something stronger than the contract and had to be
  corrected. FR-006's disclosure is therefore specified as a **rule with worked examples** (3350 → 20,
  3550 → 12) so its tests are written against the world.
- **A passing gate can be passing trivially.** 030's `cm-contract-check` would have gone green while
  generating nothing. Any check added here must be **proved by breaking it**.
- **The measurement beats the reasoning.** 030's `next/dynamic` split was reasoned cheaper and measured
  more expensive.
- **⚠ Data can violate a rule the code enforces.** `REGIONAL` is the proof: every core-api test passes
  and the platform still promises delivery it cannot perform. **Assertions about configuration must run
  against configuration**, not only against code.
- **The equivalent of 028/029's Android skip** here is checking the area picker and never checking the
  health surface.

## Risks

| Risk | Impact | Response |
|---|---|---|
| ⚠ **FR-006 under-built into a tooltip** | An admin serves twenty suburbs believing they served one, and finds out from an order | Its own component and tests, and **SC-003 is an observer test with five admins** — the only check that catches "technically displayed but not understood". |
| ⚠ **The projection leaks into the shopper's experience** | FR-028 breached; quotes or serviceability change | core-api suites must pass **unmodified**. ⚠ A core-api test edited during this slice is a design breach, not a test needing an update. |
| ⚠ **Same-day enabled where nothing can serve it** | A promise broken at payment — the failure 025/030 exist to prevent | Shops shown, acknowledgement required, never computed (research R6). |
| **Not-served modelled as more disabled rows** | "Unconfigured" stays un-queryable, so FR-025/FR-026 cannot be built | Settled in `data-model.md` toward a decision record (research R4). |
| **$5-vs-$8 becomes an automatic rule** | A price changes with nobody deciding | The console requires the choice; the number is an operator task. |
| ⚠ **REGIONAL stays broken while this ships** | Ballarat and Bendigo shoppers are invited in and stopped at payment, **today** | ⚠ **Operator decision, flagged and not owned by this plan** — unblocking those two areas now is a data change independent of this feature. |

## Telemetry (Principle VII, declared)

- **Metric (new): ⚠ DEFERRED, and deferred explicitly rather than declared and not built.** A gauge of
  misconfigured areas by class (`unknown_place` / `unconfigured` / `empty_zone`) is the right signal.
  **But no cold-path service on this platform emits a metric at all** — a grep across
  `apis/edge-api/*/src` finds no `PutMetricData`, no EMF, nothing but log lines that happen to reach
  CloudWatch. There is no mechanism to add a gauge *to*.

  Building one is its own piece of work (namespace, dimensions, EMF-vs-API, and the same question for
  every other cold-path service), and doing it inside this feature would be the tail wagging the dog.
  **The signal is instead available on demand via `GET /admin/v1/delivery-health`**, which returns the
  same three counts. ⚠ Recorded as a carry-forward: *cold-path metrics have no emission path*, which is
  a Principle VII gap wider than this slice.
- **Audit (existing, extended)**: every composition and service-level change recorded with actor and
  timestamp, through the trail the delivery slice already has (FR-009/FR-016).
- **Product analytics**: **none.** Internal console; the taxonomy is customer-behavioural.
- **Alerts**: none added. ⚠ A non-zero misconfiguration count is a review prompt, not a page.
- ⚠ Cold-path metrics reach Grafana via **CloudWatch**, not a scrape endpoint.

## Complexity Tracking

*No entries — the Constitution Check passes with no violations and no justified exceptions.*
