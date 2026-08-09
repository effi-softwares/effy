---
description: "Task list for 042-storefront-home-composer"
---

# Tasks: Storefront Home Composer

**Input**: Design documents from `specs/042-storefront-home-composer/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. Not because the spec asked for TDD, but because the constitution's Quality Gates require verification against acceptance criteria, and because **SC-007's bypass proof and SC-012's no-duplicate rule are only meaningful as tests**. ⚠ Four criteria (SC-003, SC-004, SC-008, SC-015) deliberately require a person — the preceding home slice shipped four visual defects through a fully green suite.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelisable — different files, no dependency on incomplete work
- **[Story]**: US1–US4, mapping to spec.md's prioritised stories
- **OPERATOR**: Run by the operator, not the assistant (live AWS, DB, or a human looking at a screen)

## Path Conventions

Multi-surface monorepo. Real paths throughout — see plan.md § Project Structure.

---

## Phase 1: Setup (Shared Contracts)

**Purpose**: Establish the single source of truth before anything consumes it. Principle II — a block defined twice is the defect this phase exists to prevent.

- [X] T001 [P] Create `packages/shared-types/src/home-layout.ts` with `HomeLayoutDTO`, `LayoutBlock`, and the `BlockType` union per [contracts/block-catalogue.contract.md](./contracts/block-catalogue.contract.md)
- [X] T002 [P] Create `packages/shared-types/src/block-catalogue.ts` with the field-kind vocabulary (`text`, `longText`, `enum`, `boolean`, `reference`, `destination`, `artwork`, `list`) and per-type field descriptors. ⚠ No colour, size, spacing or rich-text kind — FR-007 depends on their absence
- [X] T003 [P] Create `packages/shared-types/src/artwork-canvases.json` as a keyed canvas set (`hero`, `tile-large`, `tile-wide`, `tile-tall`, `tile-small`) per [data-model.md](./data-model.md) §6. ⚠ The **structure** is settled here; the **values** are provisional until T055a confirms them against the built bento — do not attach artwork before then
- [X] T004 Create `packages/shared-types/src/artwork-canvas.ts` exporting the canvas set, `canvasFor(key)`, `isCanonicalSize(key, w, h)` — replacing the singleton `BANNER_CANVAS` shape (depends on T003)
- [X] T005 Export the new modules from `packages/shared-types/src/index.ts` and confirm `pnpm --filter @effy/shared-types typecheck` passes (depends on T001–T004)
- [ ] T006 ⚠ **RE-SCOPED AND MOVED TO PHASE 2 — the task as written was the wrong shape.** It said to extend `gen-kotlin-contract.mjs`, but that generator emits the **customer mobile** wire contract (013 D15); bolting the block catalogue onto it would push block types into mobile DTOs for a surface that is not a consumer of this feature. And the two TS consumers — the composer's form and the cold-path validator — import `BLOCK_CATALOGUE` directly, so they need no generated file at all.
  **What is actually needed** is a machine-readable catalogue for the **Go renderer**, emitted by its own small generator with a `block-catalogue:check` drift guard on the platform's established generate-and-check pattern. It belongs beside T013 where that consumer appears; emitting it now would be a file with no reader (depends on T013)
- [X] T007 [P] Add unit tests in `packages/shared-types/src/block-catalogue.test.ts` pinning the block union shape and the catalogue's required/enumerated fields. ⚠ **Include an assertion that the field-kind vocabulary is EXACTLY the eight listed** and contains no colour/size/spacing/rich-text kind — FR-007 is a *negative* requirement that holds only by their absence, and a ninth kind would silently defeat `check-tokens`
- [X] T008 [P] Add unit tests in `packages/shared-types/src/artwork-canvas.test.ts` asserting each canvas's internal coherence (`|w/h − ratio| < 1e-9`, ratio and width floors, byte cap) — the existing `check-banner-canvas.mjs` invariants generalised from one canvas to N

**Checkpoint**: One contract exists. Nothing consumes it yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠ CRITICAL**: No user story can begin until this phase completes.

### Page inventory — before anything is modelled

- [X] T008a ⚠ **Inventory what `app/(shop)/page.tsx` actually renders today**, and reconcile the catalogue against it. **DONE** — recorded in `contracts/block-catalogue.contract.md`. Three corrections resulted: `HomeSection` has **three** kinds not seven (so the block system absorbs page-level JSX too, which the plan understated); **`RecentlyViewedRail` was missing from the catalogue entirely** and is a client island — modelled as `recently_viewed` with position-only authoring; and `ValueStrip` renders **nowhere** (an unused import), so it is included as a block the operator can deliberately bring back
- [X] T008b ⚠ **NOT NEEDED — the premise was stale.** `ValueStrip` is not nested inside `Hero`; it is an unused *import* there and renders nowhere, so there is nothing to split and FR-008 is not breached. Superseded by T008a's disposition
- [ ] T008c ⚠ **OPERATOR DECISION, blocks the `hero` block schema.** `Hero` (static, six local artworks, hardcoded copy) is commented out; `PromoHero` (promotions-driven, streamed) is live. They were built to be compared and the comparison was never concluded. If `Hero` wins, `hero` carries operator-authored copy + artwork + CTAs and `PromoHero` is deleted. If `PromoHero` wins, the hero is promotions-driven and its field schema is entirely different. ⚠ No artifact had named this; everything else in the catalogue can proceed without it

### Database

- [ ] T009 Write `db/migrations/<timestamp>_home_layout.sql` creating `public.home_layout` as a schema-enforced singleton per [data-model.md](./data-model.md) §1 (`draft`, `published`, `revision`, publish metadata)
- [ ] T010 In the same migration, **seed `published` with an explicit representation of today's home page** — hero, category strip, on-sale rail, offers, featured rail, category rails, app promo, newsletter. ⚠ The storefront must not change appearance on deploy, and an empty seed plus a deleted `PromoHero` leaves no hero at all (depends on T009)
- [ ] T010a ⚠ **Assert the seeded layout passes `validate.ts`.** The seed is written by SQL and therefore bypasses the service that would otherwise refuse it — including `hero.artwork`, which is required and canvas-validated. Add a test that runs the seed body through the cold-path validator, and confirm the hero artwork object exists in the media bucket (depends on T010, T090)
- [ ] T011 **OPERATOR** Commit the migration, then `make db-up ENV=dev` and verify with the `jsonb_array_length(published)` query in [quickstart.md](./quickstart.md) §1 (depends on T010)

### Hot path — the public read

- [ ] T012 [P] Add `homeLayoutRow` and `PublishedLayout()` to `apis/core-api/internal/features/storefront/repository.go` — a primary-key read of `published`
- [ ] T013 Add block domain types and `layoutBlocks()` to `apis/core-api/internal/features/storefront/service.go`, resolving each block's references and **omitting rather than failing** on unknown type, unreadable props, or a missing reference (FR-042) (depends on T012)
- [ ] T013a ⚠ **Read the published layout through a CACHED path tagged `home-layout`** in `apps/customer-web/app/(shop)/home-data.ts`, keeping rails and products `uncached()`. Without this, block order coming from an uncached read moves the **entire page body** behind request time and the prerendered shell FR-037 requires is gone (depends on T012)
- [ ] T013b Create `apps/customer-web/app/api/revalidate/route.ts` — a POST route authenticated by a shared secret that invalidates the `home-layout` tag. ⚠ The secret is **operator-supplied and fails loudly when unset** (constitution, Real-World Identifiers) (depends on T013a)
- [ ] T013c Call the revalidation route from `publish` and `revert` in the admin service, and **surface a revalidation failure to the operator** — a silent failure means they believe they published while shoppers see the old page (FR-015a) (depends on T013b, T022)
- [ ] T013d [P] Test that a publish invalidates the tag and the next storefront request serves the new layout, and that `/` still builds as a prerendered route (SC-005, FR-037)
- [ ] T014 Add `layoutBlockDTO` and wire `layout` into `homeDTO` in `apis/core-api/internal/features/storefront/handler.go`, keeping `banners` **present and empty** ⚠ removing the key is a wire break for mobile builds in the field (depends on T013)
- [ ] T015 [P] Add `storefront_home_blocks_omitted_total` (labelled by omission reason) and `storefront_home_layout_read_seconds` to the hot path's metrics registry. ⚠ FR-042 makes omission a silent success path — uncounted, a page losing a section is invisible
- [ ] T016 [P] Write `apis/core-api/internal/features/storefront/layout_test.go` covering: hidden blocks omitted server-side, unknown type omitted, missing reference omitted, array order preserved, empty layout renders nothing
- [ ] T017 Extend `apis/core-api/internal/features/storefront/wire_contract_test.go` with a byte-identical JSON literal for the layout payload, pinning Go against the shared contract (depends on T014)

### Cold path — the authoring slice

- [ ] T018 [P] Create `apis/edge-api/admin/src/homelayout/types.ts` importing the block types from `@effy/shared-types` — ⚠ import, never re-declare locally; `promotions/types.ts` re-declares `BannerPlacement` today and that is exactly the drift Principle II forbids
- [ ] T019 [P] Create `apis/edge-api/admin/src/homelayout/authz.ts` — read = any active staff incl. `csa`; mutate = active AND role ∈ `{admin, manager}`, decided from `admin.staff`, fail-closed (FR-016)
- [ ] T020 Create `apis/edge-api/admin/src/homelayout/repository.ts` with raw SQL for read, draft write, publish, revert — every mutation writing `admin.audit_log` **inside the same transaction** (FR-015) (depends on T009)
- [ ] T021 Implement optimistic concurrency in the repository: `WHERE revision = $n` with a bump; zero rows affected → distinguishable conflict (FR-017) (depends on T020)
- [ ] T022 Create `apis/edge-api/admin/src/homelayout/service.ts` with `getLayout`, `saveDraft`, `publish`, `revert` and the `refuse()` → problem+json mapping (depends on T019, T021)
- [ ] T023 [P] Create handler files in `apis/edge-api/admin/functions/` for `home-layout-v1-get`, `home-layout-draft-v1-put`, `home-layout-publish-v1-post`, `home-layout-revert-v1-post`, `home-layout-audit-v1-get`
- [ ] T024 Register the routes in `apis/edge-api/admin/serverless.yml` behind the back-office authorizer (depends on T023)
- [ ] T025 [P] Add a config-contract test in `apis/edge-api/admin/src/homelayout/config.test.ts` reading the **real `serverless.yml`** and asserting every route and env var this slice needs is declared. ⚠ 035 shipped four env vars the config never declared; 100 passing tests missed it because they set the vars themselves

### Storefront rendering skeleton

- [ ] T026 [P] Create `apps/customer-web/app/(shop)/_components/blocks/` with one **server** component per block type, each a pure props-driven wrapper around the existing component (`Hero`, `CategoryStrip`, `ProductRail`, `ValueStrip`, `AppPromo`, `NewsletterForm`)
- [ ] T027 Replace `composeSections()` usage in `apps/customer-web/app/(shop)/page.tsx` with a renderer over the published layout, using a `switch` with a `never` default so a new block type is a **compile error**, not a silently blank section. ⚠ **Retain the page-level screen-reader-only `h1` outside the block renderer** — it is page JSX, not a block, and FR-040/SC-010 depend on it surviving this rewrite (depends on T026)
- [ ] T028 Implement position-derived image priority in the block renderer — first image eager + `fetchpriority="high"`, all others lazy — as a derived value with **no authorable field** (FR-039). ⚠ The storefront currently has the inverse defect (depends on T027)

**Checkpoint**: The storefront renders from data. Nothing is authorable yet.

---

## Phase 3: User Story 1 — Reorder and publish (P1) 🎯 MVP

**Goal**: A member of back-office staff changes the home page's block order and makes it live, and can undo it — no developer, no deploy.

**Independent Test**: Reorder two blocks, publish, load the storefront, observe the new order; revert, reload, observe the original. **Requires no new block types.**

### Tests for User Story 1

- [ ] T029 [P] [US1] Write `apis/edge-api/admin/src/homelayout/service.test.ts` covering: draft write leaves `published` untouched; publish copies draft→published; revert copies published→draft; audit row written in the same transaction
- [ ] T030 [P] [US1] Write `apis/edge-api/admin/src/homelayout/repository.test.ts` covering the stale-revision conflict (FR-017) and the `csa` mutation refusal (FR-016)
- [ ] T031 [P] [US1] Write `apps/back-office/src/features/home-layout/model.test.ts` for move-up/move-down/hide/remove reducers over an ordered block array

### Implementation for User Story 1

- [ ] T032 [P] [US1] Create `apps/back-office/src/features/home-layout/model.ts` — block list operations as pure functions (reorder, hide, remove, insert-from-preset)
- [ ] T033 [P] [US1] Create `apps/back-office/src/features/home-layout/repo.ts` with the HTTP calls to the five Phase-2 routes
- [ ] T034 [P] [US1] Create `apps/back-office/src/features/home-layout/queries.ts` — TanStack Query options and mutations. ⚠ Server state via the cache, never hand-cached in component state (Principle VI)
- [ ] T035 [P] [US1] Create `apps/back-office/src/features/home-layout/access.ts` mirroring the server's role gate for UI affordances only — the server decides
- [ ] T035a [US1] ⚠ **OPERATOR decision, before T036**: is drag-to-reorder required, or do move-up/move-down buttons suffice? FR-004 currently mandates both. Buttons-only removes a dependency entirely; if that is the answer, **amend FR-004** rather than leaving a MUST unmet. Do not carry this into implementation as an open question
- [ ] T036 [US1] Add `@dnd-kit` to `apps/back-office/package.json` **if T035a chose drag**. ⚠ Admin-only; it must never appear in a storefront bundle (depends on T032, T035a)
- [ ] T037 [US1] Create `apps/back-office/src/features/home-layout/components/BlockList.tsx` — drag-to-reorder **and** always-visible move-up/move-down buttons (FR-004). ⚠ `pointerWithin` is pointer-only and keyboard-inaccessible; use `closestCorners` with an activation distance (depends on T036)
- [ ] T038 [US1] Ensure focus follows a block moved by keyboard, and that the control announces the new position (US1 acceptance scenario 2, FR-004) (depends on T037)
- [ ] T039 [US1] Create `apps/back-office/src/features/home-layout/HomeComposerScreen.tsx` — the block list, add-from-preset, hide/remove, and the publish/revert actions (depends on T033, T034, T037)
- [ ] T040 [US1] Add the route in `apps/back-office/src/routes/` and a nav entry in `apps/back-office/src/components/layout/nav.ts` (depends on T039)
- [ ] T041 [P] [US1] Define at least one **preset per block type** in `packages/shared-types/src/block-catalogue.ts` — pre-filled, never a blank shell (FR-003). The highest-leverage feature for a single operator
- [ ] T042 [US1] Implement hide-vs-remove as distinct actions, with hidden blocks retaining their content and omitted server-side (FR-005) (depends on T039)
- [ ] T043 [US1] Enforce the 20-block ceiling server-side with `layout_too_many_blocks`, and surface the limit in the composer (FR-009) (depends on T022)
- [ ] T044 [P] [US1] Write `apps/back-office/src/features/home-layout/HomeComposerScreen.test.tsx` covering reorder, hide, publish and revert against a fake repo
- [ ] T045 [P] [US1] Emit `home_layout_edited`, `home_layout_published`, `home_layout_reverted` through the existing back-office telemetry taxonomy (Principle VII)
- [ ] T046 [US1] **OPERATOR** Walk quickstart §4 — reorder, verify storefront unchanged, keyboard move, publish, revert, hide (SC-001, SC-004)
- [ ] T047 [US1] **OPERATOR** Confirm the US1 walk is completable by someone who has not seen the tool. ⚠ **This is not SC-002** — that criterion's flow includes adding an offer and previewing it, which need US2 and US3. SC-002 is walked at T084a
- [ ] T048 [US1] **OPERATOR** SC-011 — confirm every surface rendering the layout produces the same order and content

**Checkpoint**: 🎯 **MVP.** The home page is operator-ordered. Shippable without any new block type.

---

## Phase 4: User Story 2 — Offers bento (P2)

**Goal**: The operator authors mixed-size offer tiles that compose into a bento grid and reflow to one column on a phone.

**Independent Test**: Create three tiles of different sizes, publish, confirm composition at desktop and phone, and that a tile's CTA reaches its authored destination.

### Tests for User Story 2

- [ ] T049 [P] [US2] Write `apps/customer-web/app/(shop)/_components/OffersBento.test.tsx` covering the degradation ladder: 5 tiles → full bento, 3 → coherent, 2 → coherent, 1 → single, 0 → **renders nothing** (FR-029)
- [ ] T050 [P] [US2] Test that no placeholder or empty tile is ever emitted — an empty frame in a promotional block is indistinguishable from a failed load
- [ ] T051 [P] [US2] Test that a tile is one link **or** a distinct CTA control, never a link containing a control (FR-027), and that the CTA's accessible name identifies its offer

### Implementation for User Story 2

- [ ] T052 [P] [US2] Add the offer-tile shape to `packages/shared-types/src/block-catalogue.ts` — `size`, `variant`, `eyebrow`, `headline`, `supporting`, `cta`, `artwork`, `altText`, `decorative`, `promoCodeId` (depends on T002)
- [ ] T053 [US2] Extend the cold-path validator for the `offers` block: 1–6 tiles, required fields, enum ranges (depends on T022, T052)
- [ ] T054 [US2] Resolve `promoCodeId` in the hot path by **ANDing the promotion's live-window predicate** onto the tile's — reusing the existing `advertisedPromoPredicate` shared const so the two cannot drift (FR-030) (depends on T013)
- [ ] T055 [US2] Create `apps/customer-web/app/(shop)/_components/OffersBento.tsx` — a CSS-grid bento with authored tile sizes, degrading by tile count and reflowing to one column (depends on T026)
- [ ] T055a [US2] ⚠ **Confirm the artwork canvas dimensions against the built bento** at each breakpoint and finalise `artwork-canvases.json` (T003's values were provisional). Artwork attached before this is refused or mis-shaped once the numbers change (depends on T055)
- [ ] T056 [US2] Implement the tile's copy panel — a solid, token-coloured ground beside or below the artwork, never over it. ⚠ This is the whole legibility strategy: it removes the contrast problem rather than managing it (research R4) (depends on T055)
- [ ] T057 [US2] ⚠ **No overlay variant is built.** Assert instead that a tile's copy box never overlaps its artwork box at any breakpoint — the mechanical form of FR-034/SC-009, and the reason no pixel decoder is needed (depends on T056)
- [ ] T058 [US2] Wire tile CTAs through the closed `BannerTarget` vocabulary **narrowed to four kinds** — `search | sale | category | product`. ⚠ **Remove the `promotion` kind**: T114 retires the page it pointed at, and keeping it would let an operator author a tile aimed at a dead route — the exact defect 029 fixed and this feature claims to remove (depends on T052)
- [ ] T059 [P] [US2] Create `apps/back-office/src/features/home-layout/components/ArtworkField.tsx` — upload, canvas-normalise to the tile's canvas, presign, PUT, attach key
- [ ] T060 [US2] Add `home-layout-artwork-presign-v1-post` handler and route (depends on T024)
- [ ] T061 [US2] Add `home-layout-artwork-view-v1-get` returning a **presigned read** so the composer can display already-attached artwork. ⚠ This is missing today — the back office returns a raw key and shows a text placeholder instead of the operator's own image (depends on T024)
- [ ] T062 [US2] Create `apps/back-office/src/features/home-layout/components/BlockForm.tsx` — a form generated from the block's field schema, not hand-built per type (depends on T002, T059)
- [ ] T063 [US2] Add the tile editor (size, variant, copy, CTA, artwork, alt text) to the offers block form (depends on T062)
- [ ] T064 [US2] Enforce alt text at save unless `decorative` is explicitly set (FR-026). ⚠ There is no banner alt-text field anywhere today — both storefront components hardcode `alt=""` (depends on T053)
- [ ] T065 [P] [US2] Extend `apps/customer-web/components/storefront/kit.tsx`'s `MediaFrame` to take a canvas key rather than a hardcoded ratio, and remove `aspect-[2/1]`. ⚠ Its test currently **pins** the violation and must change with it (FR-035)
- [ ] T066 [P] [US2] Generate one artwork template SVG per canvas by extending `packages/design-system/scripts/gen-banner-template.mjs`, with the drift check extended to N files
- [ ] T067 [P] [US2] Extend `packages/design-system/scripts/check-banner-canvas.mjs` to validate every canvas in the set, and wire it into `tokens:check`. ⚠ It is in `pnpm test` but **not** in any `make` target today, unlike its sibling
- [ ] T068 [P] [US2] Write `apps/back-office/src/features/home-layout/components/ArtworkField.test.tsx` covering canvas-conformance rejection and the presign→PUT→attach ordering (no orphan objects)
- [ ] T069 [US2] **OPERATOR** Walk quickstart §5 — five tiles, desktop bento, phone single column, degradation to 3/2/1/0, CTA destination, promotion expiry
- [ ] T070 [US2] **OPERATOR** SC-008 — a person using a screen reader reaches every tile's message and CTA and can tell which offer each control belongs to
- [ ] T071 [US2] **OPERATOR** SC-009 — confirm **no published tile places copy over artwork** at any breakpoint, so contrast is a design-system property rather than a photograph's
- [ ] T071a [P] [US2] Write a test asserting **no merchandising reference appears twice** across an assembled layout (FR-043). ⚠ Today the invariant would be satisfied only incidentally by removing `banners()`; nothing pins it against reintroduction, and every `inline` banner currently renders twice
- [ ] T072 [US2] **OPERATOR** SC-012 — confirm no promotion appears twice on the page. ⚠ This is a live defect today: every `inline` banner renders twice

**Checkpoint**: Offers are authorable and render as a bento. US1 and US2 both work independently.

---

## Phase 5: User Story 3 — Preview (P2)

**Goal**: The operator sees exactly what shoppers will see, before publishing.

**Independent Test**: Make a draft edit; the preview shows it while the public storefront still shows published; publish; preview and page are indistinguishable.

### Tests for User Story 3

- [ ] T073 [P] [US3] Write `apps/customer-web/e2e/preview.spec.ts` asserting: no token → published content; valid token → draft content; ended session → published content again (FR-022)
- [ ] T074 [P] [US3] Test that the post-enable redirect target is **fixed server-side** and cannot be driven by `searchParams` — an open-redirect proof

### Implementation for User Story 3

- [ ] T075 [US3] Add `home-layout-preview-v1-post` minting a short-lived signed preview token (depends on T024)
- [ ] T076 [US3] Create `apps/customer-web/app/api/preview/route.ts` — **app root, not inside `(shop)`**, so it inherits no storefront layout and stays clear of the 011 Amplify quarantine boundary — **`GET`** to enable, exchanging the token for a draft session and redirecting to a server-fixed path (depends on T075)
- [ ] T077 [US3] Create the draft-session exit as a **`POST`** route. ⚠ Never reachable from a `<Link>` — Next prefetches, so the session would clear before the operator clicks (depends on T076)
- [ ] T078 [US3] Make the storefront home read the **draft** body when a valid draft session is present, published otherwise — the same page, the same components, no second renderer (FR-018) (depends on T027, T076)
- [ ] T079 [US3] Mark the draft route `noindex` (depends on T078)
- [ ] T080 [US3] Add the "Preview" action to the composer, opening the storefront in a **new tab**. ⚠ Not an iframe: different origins mean a third-party cookie, which Safari blocks by default — it would work on a developer's machine and fail for the operator (research R5) (depends on T039, T075)
- [ ] T081 [P] [US3] Emit `home_layout_previewed` (Principle VII)
- [ ] T082 [US3] **OPERATOR** Walk quickstart §6 steps 1–5 — draft visible in preview, public unchanged, phone width, real empty states, session ends
- [ ] T083 [US3] **OPERATOR** SC-003 — compare preview against the published page at phone and desktop width, in **light and dark**. They must be indistinguishable
- [ ] T084 [US3] **OPERATOR** ⚠ Verify preview in **Safari** specifically — the new-tab design exists because of Safari's third-party-cookie policy
- [ ] T085 [P] [US3] Verify the preview route adds no client JS to the public bundle — `pnpm size` unchanged
- [ ] T086 [US3] **OPERATOR** SC-013 — empty layout, all blocks hidden, and all data sources empty each render a coherent page with no empty frames or broken images

**Checkpoint**: The operator can trust what they see before publishing.

---

## Phase 6: User Story 4 — Author-time refusals (P3)

**Goal**: The operator is refused before shoppers see the mistake, with a message naming the block and the problem.

**Independent Test**: Attempt each violating publish in turn; each is refused by name, and the previously published layout is untouched.

### Tests for User Story 4

- [ ] T087 [P] [US4] Write `apis/edge-api/admin/src/homelayout/validate.test.ts` covering every refusal code in [contracts/home-layout.contract.md](./contracts/home-layout.contract.md) §2
- [ ] T088 [P] [US4] Test that a refused publish leaves `published` **byte-identical** (FR-036)
- [ ] T089 [P] [US4] Test heading-order validation across assembled block sequences, including the invalid orderings (FR-040)

### Implementation for User Story 4

- [ ] T090 [US4] Create `apis/edge-api/admin/src/homelayout/validate.ts` — schema-driven, deriving from the shared catalogue rather than hand-written per block (depends on T006, T022)
- [ ] T091 [US4] Implement `layout_block_unknown`, `layout_field_required`, `layout_field_invalid`, `layout_too_many_blocks` (depends on T090)
- [ ] T092 [US4] Implement `layout_artwork_wrong_size` per-canvas, reusing `readObjectPrefix` + `image-dimensions.ts` from `@effy/edge-shared` — **refuse, never resize** (depends on T090, T004)
- [ ] T093 [US4] ⚠ Run artwork verification on **attach as well as change**. `createPromo` never verifies artwork today — the check runs only in `updatePromo`, a hole independent of any never-run test (FR-033) (depends on T092)
- [ ] T094 [US4] Implement `layout_artwork_required` and `layout_alt_text_required` (depends on T090)
- [ ] T095 [US4] Implement `layout_reference_missing` by querying the live rail/category/promotion tables at publish time (depends on T090)
- [ ] T096 [US4] Implement `layout_heading_order`, computed from the assembled block sequence (depends on T090)
- [ ] T097 [US4] Implement `layout_field_too_long` against each field's stated `maxLength` (FR-031). ⚠ A limit enforced only by the composer's input is not a limit — FR-032 (depends on T090)
- [ ] T098 [US4] ⚠ **No contrast validator is built, and that is the decision.** Confirm the catalogue ships **no** authorable way to place copy over artwork, so `layout_contrast_fail` has nothing to guard. Reintroducing overlay later reintroduces the pixel-decoder question with it (depends on T057)
- [ ] T099 [P] [US4] Surface each refusal in the composer against the offending block, with the field named (depends on T039)
- [ ] T100 [P] [US4] Emit `home_layout_publish_refused` with the refusal reason as a **low-cardinality** label (Principle VII)
- [ ] T101 [US4] **OPERATOR** Walk the quickstart §7 refusal table — each violation refused by name, published layout untouched
- [ ] T102 [US4] **OPERATOR** ⚠ **SC-007 — the bypass proof.** Issue each violating publish **directly against the API** with a valid token, bypassing the composer, and observe the identical refusal. A check that only exists in a form is not a check (FR-032). ⚠ This is the same shape as 029's `T051`, which remained "the most important open item on the platform" through two slices
- [ ] T103 [US4] **OPERATOR** FR-017 — two tabs, publish from both, expect `409 layout_revision_stale`, not silent loss
- [ ] T104 [US4] **OPERATOR** FR-016 — sign in as `csa`; reads succeed, every mutation refused
- [ ] T105 [US4] **OPERATOR** SC-015 — deliberately attempt to publish something off-brand, inaccessible or over budget, and be refused

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Removals (Cross-Cutting)

**⚠ Sequenced AFTER US1 and US2** — the layout must be able to represent a hero and offers before the things rendering them today are deleted.

- [ ] T106 **OPERATOR** ⚠ Carry the currently-advertised promotions forward into offer tiles, **or record the decision not to** (FR-046). After T108 their creative is unrecoverable from the database
- [ ] T107 Confirm the seeded published layout renders a hero. ⚠ `Hero` is commented out of `page.tsx` today; deleting `PromoHero` without a hero block leaves the storefront with **no hero at all** (depends on T010, T027)
- [ ] T108 Write a **SECOND, SEPARATE** migration `db/migrations/<timestamp>_drop_promo_advertising.sql` — six columns, one index, one CHECK per [data-model.md](./data-model.md) §7. ⚠ **Do NOT amend the T009 migration**: it was committed and applied back in Phase 2, Goose is forward-only, and the 003 commit-guard means an applied migration is not an editable file (depends on T106)
- [ ] T108a **OPERATOR** Commit the second migration, then `make db-up ENV=dev` (depends on T108)
- [ ] T109 [P] Remove the advertising fields from `packages/shared-types/src/promotion.ts` and its admin DTOs
- [ ] T110 [P] Remove `AdvertisingSection.tsx`, `BannerCanvas.tsx` and their tests from `apps/back-office/src/features/promotions/components/`
- [ ] T111 [P] Remove the banner-image presign route and handler from `apis/edge-api/admin`
- [ ] T112 Remove `banners()`, `promoTerms()`, `promoValidity()` and the advertised-promotion reads from `apis/core-api/internal/features/storefront/` (depends on T014)
- [ ] T113 [P] Delete `apps/customer-web/app/(shop)/_components/PromoHero.tsx`, `OffersPanels.tsx`, `CopyCodeButton.tsx` and their tests (depends on T055)
- [ ] T114 [P] Replace `apps/customer-web/app/(shop)/promotions/[id]/page.tsx` with a short **"this offer has ended"** page carrying a route back into the store, and drop its data fetch. ⚠ **Deleting the route does NOT satisfy FR-045** — that yields a bare 404 for an address a shopper may have bookmarked or been sent. This is the shape 029 already chose for an expired promotion
- [ ] T115 [P] Delete `PromotionScreen.kt`, `PromotionViewModel.kt`, `PromotionViewModelTest.kt` and the promotion nav key from `apps/customer-mobile`
- [ ] T116 Delete `apps/customer-web/app/(shop)/home-composition.ts` and its 24 tests, now superseded by the layout (depends on T027)
- [ ] T117 [P] Remove `packages/shared-types/src/banner.ts`, `banner-canvas.json` and `banner.test.ts`, now superseded by the canvas set (depends on T004)
- [ ] T118 Regenerate the Kotlin contract and Compose themes; verify `contract:check` and `tokens:check` pass (depends on T109, T117)
- [ ] T119 ⚠ Verify `banners` is still **present and empty** on the wire and that `customer-mobile` parses the home payload (depends on T014)
- [ ] T120 **OPERATOR** SC-014 — `go test ./...` for cart and checkout passes **unmodified**, proving the removal touched no discount behaviour

**Checkpoint**: One entity, one ordering mechanism, one source of merchandising.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T121 [P] Add the `storefront_home_blocks_omitted_total` alert to the Grafana provisioning in `infra/` (Principle VII)
- [ ] T122 [P] Update `docs/audiences/customer-capabilities.md` with a §042 entry
- [ ] T123 [P] Update `docs/audiences/shop-capabilities.md` if any shop-facing surface is affected (expected: none — record that it is none)
- [ ] T124 [P] Update `CLAUDE.md`'s Current Status with the 042 summary
- [ ] T125 Re-record `scripts/storefront-locks.sha256` if any locked storefront file changed, and commit the baseline **with** the change that justified it
- [ ] T126 [P] Add `apps/customer-web/e2e/home-layout.spec.ts` — SSR proof that block content is in the raw HTML with JavaScript disabled (FR-037)
- [ ] T127 [P] Verify exactly one `h1` and a valid heading sequence across several block combinations (SC-010)
- [ ] T128 Run the full machine gate from [quickstart.md](./quickstart.md) §3. ⚠ Run `typecheck` **and** `test` — vitest does not run `tsc`, and a green suite over a red typecheck has happened here before
- [ ] T129 Confirm `pnpm size` shows `/` within 174 KB with the block system adding ≈0 KB (SC-005) (depends on T128)
- [ ] T130 **OPERATOR** SC-006 — on a production build, confirm the first image is eager with `fetchpriority="high"` and below-the-fold artwork is lazy. ⚠ Currently inverted; prove it is fixed
- [ ] T131 **OPERATOR** Walk quickstart §9's regression sweep — retired promotion URLs, mobile parse, discount/cart/checkout end to end
- [ ] T132 **OPERATOR** Sign-off: record which success criteria are proven, which are outstanding, and why, in `specs/042-storefront-home-composer/SIGNOFF.md`
- [ ] T133 **OPERATOR** Commit spec, plan, tasks and implementation together — no feature merges without all three (Quality Gates)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — no dependencies
- **Foundational (Phase 2)** — depends on Setup; **blocks every user story**
- **US1 (Phase 3)** — depends on Phase 2. **No dependency on any other story**
- **US2 (Phase 4)** — depends on Phase 2. Independently testable; shares the composer shell with US1
- **US3 (Phase 5)** — depends on Phase 2 and on the composer existing (T039)
- **US4 (Phase 6)** — depends on Phase 2. ⚠ No longer depends on US2 for a contrast decoder: there is none, because copy never sits over artwork
- **Removals (Phase 7)** — ⚠ depends on **US1 and US2 being complete**. Deleting `PromoHero` before the layout can render a hero, or dropping the advertising columns before the promotions are carried forward, is unrecoverable. ⚠ Its migration (T108) is a **separate file** from Phase 2's — an applied forward-only migration is not editable
- **Polish (Phase 8)** — depends on everything intended for this release

### Critical path

```
T001–T008  →  T008a/b  →  T009–T011  →  T012–T017  →  T013a–c  →  T026–T028  →  T039  →  T046
 contracts    inventory    migration     hot path     caching     renderer     composer   MVP walk
```

⚠ **T008a (the page inventory) is genuinely first.** The catalogue is modelled on what the page renders, and three artifacts recorded that it is provisional; building forms against an unverified catalogue is rework, not progress.

⚠ **T013a–T013c are on the critical path, not polish.** Making block order data-driven moves the whole page body behind a request-time read unless the layout is cached and invalidated on publish.

### Parallel opportunities

- **Phase 1**: T001, T002, T003, T007, T008 — different files
- **Phase 2**: the hot-path group (T012, T015, T016) and the cold-path group (T018, T019, T023, T025) are independent, as is T026
- **Phase 3**: T032–T035 are four independent files; T029–T031 are independent tests
- **Phase 4**: T049–T051 (tests), T059/T065/T066/T067 (artwork machinery) are independent of the bento component itself
- **Phase 7**: T109–T115, T117 touch different surfaces and can be removed in parallel once T106–T108 have landed

### Within each story

Tests → shared types → repository → service → routes → UI → operator walk.

---

## Parallel Example: Phase 1

```bash
Task: "Create packages/shared-types/src/home-layout.ts"
Task: "Create packages/shared-types/src/block-catalogue.ts"
Task: "Create packages/shared-types/src/artwork-canvases.json"
Task: "Add unit tests in packages/shared-types/src/home-layout.test.ts"
Task: "Add unit tests in packages/shared-types/src/artwork-canvas.test.ts"
```

---

## Implementation Strategy

### MVP first — US1 only

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1)
2. **STOP and validate**: the operator reorders and publishes the home page
3. Shippable. ⚠ It delivers the feature's headline value — the page is operator-controlled — **with no new block types at all**

### Incremental delivery

1. Setup + Foundational → the page renders from data
2. **+ US1** → operator-ordered page → **demo** 🎯
3. **+ US2** → offers bento → demo
4. **+ US3** → preview → demo
5. **+ US4** → refusals → demo
6. **+ Phase 7** → removals, once the layout has replaced what is being deleted
7. **+ Phase 8** → polish and sign-off

### If scope must be cut

Cut **US4's heading-order and length checks** first (T096, T097) — they are the two refusals a careful operator is least likely to trip. Cut **US3's preview** second, painfully: it is the control that catches the defect class a test suite cannot see.

⚠ Do **not** cut three things. **T013a–T013c** (the cached layout and its invalidation) — without them the prerendered shell is gone and FR-037/SC-005 are false. **T106 and T107** (carry the promotions forward; confirm the hero renders) — they are the only thing between this feature and unrecoverable data loss. And **T008a** (the page inventory) — everything downstream is modelled on its answer.

---

## Notes

- `[P]` = different files, no dependency on incomplete work
- **OPERATOR** = the operator runs it (live AWS, DB, or a human looking at a screen); the assistant hands over exact commands
- Each user story is independently completable and testable
- Commit after each task or logical group
- ⚠ Four success criteria (SC-003, SC-004, SC-008, SC-015) **require a person**. The preceding home slice shipped a backwards phone layout, a CTA hierarchy that vanished in dark mode, an orphaned divider and a bleaching scrim — all through a fully green suite
