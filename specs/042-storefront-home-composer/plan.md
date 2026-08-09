# Implementation Plan: Storefront Home Composer

**Branch**: `042-storefront-home-composer` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/042-storefront-home-composer/spec.md`

## Summary

Turn the storefront home page from a hardcoded sequence into an **ordered list of typed blocks stored as JSON**, authored in a new back-office **Home Composer**, previewed as the real page, and rendered entirely on the server. Introduce a first-class **offer tile** as the first rich block type, and remove the advertising facet bolted onto discount codes.

**The technical bet, and why it is affordable**: the storefront is *already* a block system. `HomeSection` is a discriminated union, `composeSections()` emits an ordered array of tagged blocks, and `ProductRail` is a pure props-driven component. This feature makes that array **data instead of code**. The bulk of the work is a schema, a repository, an editor and a publish workflow — not new rendering.

**Build, adopt nothing.** Four research streams evaluated Puck, GrapesJS, Craft.js, Plasmic, Builder.io, Storyblok, Sanity, Contentstack and Netlify Create. Puck is MIT and technically sound, but **declares no `next` peer dependency at all** (Next 16 untested by maintainers), and removes roughly **one item from a fourteen-item build list** — draft/published, versioning, scheduling, media library and server-side permissions are all absent from its OSS core. Full evaluation in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5 / Node 22 (cold path, back office), Go 1.25 (hot path), React 19

**Primary Dependencies**: Existing only — Gin + pgx/v5 (hot path); Serverless Framework + `@effy/edge-shared` (cold path); React 19 + shadcn/ui + Tailwind v4 + TanStack Router/Query/Form (back office); Next.js 16 App Router with `cacheComponents: true` (storefront). ⚠ **One new runtime dependency is proposed** — a drag-and-drop primitive for the composer's reorder control — see Complexity Tracking.

**Storage**: PostgreSQL 16, raw SQL, Goose forward-only migrations. One new table; the layout body is a `jsonb` column.

**Testing**: Vitest (TS), `go test` (hot path), Playwright (storefront e2e), plus the existing generate-and-check guard pattern (`contract:check`, `tokens:check`) for the block schema and the artwork canvases.

**Target Platform**: `apps/customer-web` (public storefront, SSR/PPR) and `apps/back-office` (internal Vite SPA). `apps/customer-mobile` is **not** a consumer in this feature — see Assumptions in the spec and the parity note below.

**Project Type**: Web — multi-surface monorepo feature spanning shared contracts, both backend paths, and two web surfaces.

**Performance Goals**: Storefront home page-weight budget holds at **174 KB** with the block system adding **≈0 KB** of client JS (SC-005). ⚠ **The published layout is read through a CACHED path tagged `home-layout`, invalidated by the admin service on publish** — see R8. This is what keeps the prerendered shell FR-037 requires; without it, making block order data-driven would move the entire page body behind the `uncached()` home read and the shell would shrink to chrome.

**Constraints**: Guest bundle headroom is **~0.1 KB** on `/` today; the home page must remain prerendered with request-time content confined to Suspense boundaries; artwork must not be cropped; and copy never sits over artwork, so its contrast is a design-system property rather than a photograph's.

**Scale/Scope**: One operator, one page, ~7 block types, an upper bound of ~20 blocks per layout. Two stored layout bodies at any time (draft + published) — deliberately not a revision history.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design. Constitution v1.13.0.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| **I. Spec-Driven** | ✅ PASS | `spec.md` committed and validated (47 FR, 15 SC, 0 clarification markers). This plan cites the constitution and chooses technology only within the locked standards. |
| **II. Monorepo / Shared Contracts** | ✅ PASS | The block catalogue and its field schema live **once** in `packages/shared-types` and are the SSOT for the back-office form, the cold-path validator, and the hot-path renderer. The existing `contract:gen` → `schema.json` pipeline is extended rather than duplicated. No surface hand-redefines a block. |
| **III. Dual-Path Backend** | ✅ PASS | **Authoring → cold path** (`apis/edge-api/admin`): low-frequency back-office CRUD by one operator. **Storefront read → hot path** (`apis/core-api`): latency-sensitive public traffic on every home page view. This is the identical split 028 already made for promotions, and it is stated per Principle III. |
| **IV. Auth Isolation** | ✅ PASS | Authoring is behind the **back-office pool** JWT authorizer; the publish decision is made from the platform's `admin.staff` record (role AND status), never from the `cognito:groups` claim alone. The storefront read is **public and unauthenticated** — a published layout is public content. No cross-pool token acceptance, no auth proxy. |
| **V. Design System** | ⚠️ PASS WITH RECORDED EXCEPTION | Every token comes from `@effy/design-system`; the composer offers **zero** colour/typography/spacing controls (FR-007), so `check-tokens` cannot be bypassed via stored content. Dark mode is unaffected. **The bento grid is a card-tiled layout and requires the Principle V justification — recorded in Complexity Tracking.** |
| **VI. Layered Architecture** | ✅ PASS | Three-layer slice on both paths (handler → service → repository), raw SQL with no ORM, no DI framework, explicit wiring. Back-office state via TanStack Query for server state; no hand-caching. Blocks are pure presentational components fed by resolved data. |
| **VII. Observability & Telemetry** | ⚠️ PASS WITH RECORDED GAP | Events, metrics and one alert declared below. ⚠ **PostHog has never been initialised on `customer-web`** — `capture()` has always been a platform-wide no-op on that surface. This plan does **not** silently rely on storefront analytics; the declared events are back-office (cold path) and hot-path metrics only, and the storefront gap is recorded rather than papered over. |

### Telemetry declaration (Principle VII)

**Product events** (back office, via the existing shared taxonomy): `home_layout_edited`, `home_layout_previewed`, `home_layout_published`, `home_layout_reverted`, `home_layout_publish_refused` (with the refusal reason as a low-cardinality label).

**Metrics** (hot path `/metrics`): `storefront_home_layout_read_seconds`, `storefront_home_blocks_omitted_total` (labelled by omission reason — unknown type, stale shape, missing reference). That second one is the important one: FR-042 makes block omission a *silent* success path, so it must be counted or a page quietly losing a section is invisible.

**Alert**: `storefront_home_blocks_omitted_total` rising above baseline — the signal that a published layout has started degrading in production.

**No PII.** The layout body carries operator-authored copy and references, never customer data. Audit rows record the staff `sub` only.

## Project Structure

### Documentation (this feature)

```text
specs/042-storefront-home-composer/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions with rationale and rejected alternatives
├── data-model.md        # Phase 1 — schema, block catalogue, state transitions
├── quickstart.md        # Phase 1 — how to run and validate the feature
├── contracts/
│   ├── home-layout.contract.md      # Wire contract: layout read + authoring API
│   └── block-catalogue.contract.md  # The block types and their field schemas
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_home_layout.sql                    # + home_layout table; − promo_code advertising facet

packages/shared-types/src/
├── home-layout.ts                          # SSOT: HomeLayoutDTO, Block union, per-type field schemas
├── block-catalogue.ts                      # The closed catalogue + presets + field descriptors
├── artwork-canvas.ts                       # Canvas SET (replaces the single banner-canvas singleton)
└── artwork-canvases.json                   # One definition per tile shape; nothing hardcodes these

apis/core-api/internal/features/storefront/  # HOT PATH — public read
├── repository.go                            # + published layout read; block reference resolution
├── service.go                               # + layout → domain blocks, omission rules (FR-042)
└── handler.go                               # + layout in the home DTO

apis/edge-api/admin/src/homelayout/           # COLD PATH — authoring
├── service.ts                                # validation, publish/revert, refusal reasons
├── repository.ts                             # raw SQL; audit written in the same transaction
├── validate.ts                               # schema-driven block validation (FR-031/032)
└── types.ts
apis/edge-api/admin/functions/                # one handler file per route (existing convention)

apps/back-office/src/features/home-layout/    # The composer
├── HomeComposerScreen.tsx                    # block list, reorder, add/hide/remove, publish/revert
├── components/BlockList.tsx                  # drag + keyboard move controls (FR-004)
├── components/BlockForm.tsx                  # schema-driven form
├── components/ArtworkField.tsx               # upload → normalise → presign → attach
├── repo.ts / queries.ts / model.ts / access.ts

apps/customer-web/app/(shop)/
├── page.tsx                                  # renders the published layout
├── _components/blocks/                       # one server component per block type
├── _components/OffersBento.tsx               # the bento grid
└── api/preview/route.ts                      # draft-mode entry (token → draft session)
```

**Structure Decision**: This is a multi-surface monorepo feature, so it follows the platform's existing per-surface slice layout rather than a `backend/`+`frontend/` split. It mirrors the 028/029 promotions precedent exactly — shared contract in `packages/shared-types`, public read in `apis/core-api/internal/features/storefront`, admin CRUD as a new domain slice under `apis/edge-api/admin/src/`, back-office feature slice under `apps/back-office/src/features/`, and storefront components under `apps/customer-web/app/(shop)/_components/`. Nothing new is invented structurally.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Principle V — card-tiled layout.** The offers bento is a grid of bordered/elevated tiles, which the constitution's no-card doctrine bars by default. | The doctrine's own escape clause applies: *"unless a card is demonstrably the right pattern for that specific content and no better layout exists."* Each tile is a **discrete, independently-authored promotional message with its own artwork and its own destination** — it is not page content tiled into boxes, it is a set of separate advertisements. The research found this composition is what **every** major grocery and retail platform studied uses for this content type. | A table, list or sectioned page cannot express mixed-size promotional creative with per-item artwork. The doctrine's target — *"metric cards at the top of pages"* and content tiled into a dashboard — is a different thing, and the rest of the home page (rails, category strip) remains uncarded. |
| **A drag-and-drop dependency** (`@dnd-kit`, ~10 KB gz) in the back office. | FR-004 requires reordering by dragging **and** by keyboard. Hand-rolling drag is a documented trap: dnd-kit publishes where each collision algorithm fails, and `pointerWithin` is **pointer-only, i.e. keyboard-inaccessible**. Puck reported patching its DnD library for iframes and transforms. | Move-up/move-down buttons alone would satisfy the keyboard half and cost nothing — but not FR-004's drag half. ⚠ **It is admin-only and never reaches the storefront bundle**, so the guest budget is untouched. If the operator will accept buttons only, this dependency disappears and FR-004 should be amended rather than the guard bent. |
| **A cross-service revalidation call** (admin Lambda → storefront) with a shared secret. | It is what makes FR-015a and FR-037 hold together: the layout must be cached to keep the prerendered shell, and a cached layout must be invalidated when the operator publishes or their change is invisible. | Short TTL polling — rejected: an operator who publishes and sees no change for minutes will publish again, and the feature's entire promise is that publishing works. |
| **A second artwork canvas set** replacing the single locked 1200×600. | The bento needs tall, wide and square tiles; one 2:1 canvas cannot fill them without the cropping FR-035 forbids. | Cropping a 2:1 image into a tall tile — rejected because the platform's own canvas contract says nothing is ever cropped, and that promise is *already* false on web (a live defect this feature fixes). |

**Not a violation, recorded so it is not mistaken for one**: the layout body is stored as `jsonb` rather than normalised into per-block tables. This is not an ORM or a schema-less data store — it is one column on one table, read with raw SQL, whose shape is defined by a committed contract and validated on write. Normalising ~7 block types into relational tables would produce a table per type and a join per render for content that is always read whole.

## Phase 0 — Research

Complete. See [research.md](./research.md) for the eleven decisions, each with rationale and rejected alternatives. The five that most shape this plan:

- **R1 — Build, adopt nothing.** Puck's Next 16 support is undeclared, and it removes ~1 of 14 build items.
- **R2 — Persist structured intent, never markup.** Adobe Commerce persists XHTML and its own React client must re-parse it; with two Compose Multiplatform surfaces, storing markup makes mobile parity unbuildable.
- **R3 — Two bodies, not a revision history.** Because the spec excludes version history, only `draft` and `published` ever exist — which collapses the hardest problem in block systems (schema evolution across historical revisions) to at most two rows.
- **R4 — Copy sits *beside* the artwork, never over it.** The industry ranking puts text-outside-image **first** and scrim **last**. Placing copy on a solid panel removes the contrast problem *by construction* — which also removes the need for a pixel decoder the platform deliberately does not have. Overlay is **not shipped**, rather than shipped-but-unpublishable.
- **R5 — Preview opens in a new tab with a signed token, not an iframe.** The back office and the storefront are different origins; an iframed draft session depends on a third-party cookie that Safari and Chrome block.
- **R8 — The layout read is cached and invalidated on publish**, which is what preserves the prerendered shell. The rails and products alongside it stay uncached.

## Phase 1 — Design & Contracts

Complete. Artifacts:

- **[data-model.md](./data-model.md)** — the `home_layout` table, the block union, the artwork canvas set, the publish/revert state machine, and the forward-only migration that removes the advertising facet.
- **[contracts/home-layout.contract.md](./contracts/home-layout.contract.md)** — the public read shape and the eight authoring routes with their refusal codes.
- **[contracts/block-catalogue.contract.md](./contracts/block-catalogue.contract.md)** — the seven block types, their fields, which are required, which are enumerated, and their presets.
- **[quickstart.md](./quickstart.md)** — how to run it and how to prove each success criterion, including the bypass proof SC-007 requires.

### Post-design Constitution re-check

Re-evaluated after the artifacts above. **No gate changed status.** Two things were confirmed rather than assumed:

- **Principle II held under design pressure.** The obvious shortcut — a Go struct set hand-written to mirror the TS block union — would have been a second definition. The design instead extends the existing `contract:gen` pipeline to emit a machine-readable block schema consumed by all three, with the established **byte-identical wire-contract test** pinning Go against the contract. That pattern already exists on this platform (028 built it for banners) and is reused, not invented.
- **Principle V's colour guarantee is structural, not procedural.** Because no field in the catalogue accepts a colour, the composer cannot store one — so `check-tokens` remains a complete guarantee rather than one with a database-shaped hole. This is why FR-007 is a hard exclusion rather than a UI decision.
