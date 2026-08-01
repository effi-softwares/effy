---

description: "Task list for 029-promotional-banner-carousel"
---

# Tasks: Promotional Banner Templates & Home Carousel

**Input**: Design documents from `/specs/029-promotional-banner-carousel/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Test tasks below are not speculative TDD — each appears in a contract's or the quickstart's
verification table as a required proof. They cover the pieces that carry *logic* (validation,
composition, mapping); geometry and legibility are proven by the device walk, because a banner is a
thing you look at.

**Organization**: Grouped by user story. **US1 + US2 are both P1 and ship together** — a template
nobody can trust renders correctly is not worth having.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1…US5
- **⚠ OPERATOR**: Claude does not run this — it touches live AWS, the database, or a device

---

## Phase 1: Setup

- [X] T001 Create branch `029-promotional-banner-carousel` from the current `028-mobile-home-merchandising` branch (028 is merged into it; the setup script creates no branch — the git extension is not installed)
- [X] T002 Verify the baseline is green before any edit — run the machine gates in [quickstart.md](./quickstart.md) §1 and record anything already failing, so a pre-existing failure is never attributed to this feature
- [X] T003 Confirm the starting position: query `public.promo_code` for any row with `banner_image_key IS NOT NULL`. ⚠ **Expected: zero.** 028's loop was never walked, so no banner artwork exists and this slice needs no migration of non-conformant images. If the count is not zero, the conformance plan needs a backfill step that this task list does not have.

---

## Phase 2: Foundational (blocks US1–US4)

**Purpose**: the canonical canvas — one definition, three consumers. Everything else reads from it.

- [X] T004 Define the canonical banner canvas in **`packages/design-system/src/banner-canvas.json`** per [data-model.md](./data-model.md) §1 — 1200×600, 2:1, the 150 KB normalised ceiling, the max render width, and the text-zone insets. ⚠ **JSON, not TypeScript.** `gen-compose-theme.mjs` is plain Node ESM that parses `src/tokens.css` and cannot import a `.ts` module; JSON is readable by the generators (`readFileSync` + `JSON.parse`) *and* by the console (`resolveJsonModule`). ⚠ **Not `tokens.css` either** — that is the *brand* SSOT, and a 1200 px image canvas is an asset constraint, not a style token (research R4).
- [X] T004a Add `packages/design-system/src/banner.ts` as the console's typed accessor — it **re-exports** T004's JSON and adds no values of its own, so there is exactly one place a number can be wrong
- [X] T005 Extend `packages/design-system/scripts/gen-compose-theme.mjs` to read T004's JSON and emit the canvas into **the existing `EffyLayoutTokens.kt`** (all three app targets). ⚠ **NOT a new `EffyBannerTokens.kt`.** `check-compose-theme.mjs` carries a hardcoded target list whose own comment reads *"EVERY file the generator writes must be listed here, or it is unguarded"* — a new file would be generated and **silently ungated**, which is the exact failure the generate-and-check pattern exists to prevent. `EffyLayoutTokens.kt` is already guarded and is where the audience-neutral layout vocabulary lives.
- [X] T005a Run `make cm-tokens-gen` and **commit** the regenerated Compose files, then confirm `make cm-tokens-check` is green. ⚠ Its output **changes** in this slice (a real value is added) — unlike 028, which required it unchanged. A red guard here is *the change*, not drift; reverting it is the wrong instinct.
- [X] T006 Add `packages/design-system/scripts/gen-banner-template.mjs` — emits a **committed** 1200×600 SVG with the text zone marked, generated from T004's constants so it cannot drift from what the renderer expects (research R5)
- [X] T007 Add `packages/design-system/scripts/check-banner-template.mjs` + a `banner-template:check` script, following the `check-compose-theme.mjs` shape: fail, and **name what is stale**, when the committed template no longer matches the constants
- [X] T007a Wire `banner-template:check` into the package's **`test`** script (and `tokens:check`), so it runs under `pnpm -r test` and CI. ⚠ 024's precedent — which research R5 explicitly invokes — is that *"the gate rides `pnpm test`"*; a check only the quickstart runs is a check that stops running.
- [X] T008 [P] Unit-test the canvas constants in `packages/design-system` — the ratio really is 2:1, the text zone falls inside the canvas, and the insets leave a usable region
- [X] T009 Add the image-dimension reader to `apis/edge-api/shared/src/lib/image-dimensions.ts` — parse width/height from PNG, JPEG and WebP **headers** (research R3). ⚠ **No `sharp`, no native binary in a Lambda.** ⚠ **WebP is a different container from the other two** — RIFF with three sub-formats (`VP8 `, `VP8L`, `VP8X`), each encoding dimensions differently; budget for all three rather than assuming PNG/JPEG simplicity carries over.
- [X] T009a Handle the **beyond-range** case: a JPEG with a large EXIF block or embedded thumbnail can push its SOF marker past 64 KB. On a range miss, **re-request a larger prefix once (up to 1 MB)** before refusing — and refuse with "could not read the file", never "wrong dimensions", which would blame an operator for a legitimate image.
- [X] T010 [P] Unit-test the dimension reader in `apis/edge-api/shared/src/lib/image-dimensions.test.ts` — a known PNG, JPEG, and **all three WebP sub-formats** report correct dimensions; a non-image fails clearly; and a JPEG whose dimensions sit past the first range triggers the re-request rather than a refusal

- [X] T010a Add `BannerPlacement` (`CAROUSEL` / `INLINE`) and a `placement` field to the domain `Banner` in `apps/customer-mobile/shared/src/commonMain/.../features/catalog/domain/Catalog.kt`, defaulting to `CAROUSEL`. ⚠ **Nothing else declared this.** T029 splits on it, T044 maps it and T028 renders it — every one of those assumed a field no task created.

**Checkpoint**: one canvas definition, generated and drift-guarded through the EXISTING gate; dimensions readable without an image library; the domain knows what a placement is.

---

## Phase 3: User Story 1 — Producing a banner (Priority: P1) 🎯 MVP

**Goal**: an operator can produce and publish a conformant banner without asking anyone its size.

**Independent Test**: in the back-office alone — download the template, upload artwork made to it,
confirm the stored result is exactly 1200×600, and confirm the preview matches what the storefront
renders.

### Contract and service

- [X] T011 [US1] Extend `packages/shared-types/src/promotion.ts` — `PromoCodeDTO`, `CreatePromoCodeRequest` and `UpdatePromoCodeRequest` gain `bannerPlacement`
- [X] T012 [US1] Add server-side artwork verification to `apis/edge-api/admin/src/promotions/service.ts` — on save of `bannerImageKey`, ranged-GET the object's first 64 KB, read its dimensions (T009), and refuse non-conformant artwork with a field-level message under a **distinct** error code (028 already uses `promo_banner_image_invalid` for content-type/size refusals at presign time; two failure modes sharing one code leave the console unable to say which happened). ⚠ **This is the only real guarantee**: artwork reaches S3 through a presigned PUT that Lambda never sees, so the console's normalisation is a convenience, not enforcement (contract § Enforcement).
- [X] T013 [US1] ⚠ **Refuse, never resize.** Confirm T012 rejects rather than transforming — silently changing an operator's artwork is exactly the silent crop FR-008 forbids
- [X] T014 [P] [US1] Extend `apis/edge-api/admin/src/promotions/service.test.ts` — conformant artwork accepted; wrong dimensions refused with the field named; a non-image refused; **the existing 027 FR-068 immutability tests still pass unmodified**

### Console

- [X] T015 [US1] Add `apps/back-office/src/features/promotions/components/BannerCanvas.tsx` — the canvas at 2:1 with the text zone marked, the canonical size stated in plain numbers, and a **download-template** action serving T006's SVG
- [X] T016 [US1] **Scale-only** normalisation in `BannerCanvas.tsx`: artwork **already at 2:1** is resampled to exactly 1200×600 before upload. ⚠ Scale only — no cropping, no padding. Resizing a square to 2:1 *is* a crop, and doing it automatically is precisely the silent crop FR-008 forbids.
- [X] T017 [US1] Non-2:1 artwork takes the **explicit** path: refuse with a message naming the required shape and offer the template download. ⚠ **An interactive pan/zoom crop tool is OUT OF SCOPE for this slice** — it is a materially larger console feature. Refusal plus the template is the honest minimum; record the crop tool as a follow-up rather than half-building it.
- [X] T018 [US1] Add the live preview — artwork, gradient scrim and the real message over it, including at a **narrow** width, so the operator sees what a shopper sees (FR-007)
- [X] T019 [US1] Add copy stating that **the lower-left carries the message** (FR-031b), so an operator designs it quiet instead of placing their own headline there and finding it double-printed
- [X] T020 [US1] Keep artwork **optional** — a promotion with none must still save and still produce a legible banner (FR-009)
- [X] T021 [P] [US1] Extend `apps/back-office/src/features/promotions/components/AdvertisingSection.test.tsx` — the template download is offered, a wrong-shaped upload is refused with guidance, and a promotion with no artwork remains savable

**Checkpoint**: an operator can produce a conformant banner. Nothing renders it yet.

---

## Phase 4: User Story 2 — Rendering (Priority: P1)

**Goal**: the banner keeps its shape on every device — never stretched, never shifting the layout.

**Independent Test**: render one known banner at the narrowest and widest supported windows and compare
proportions against 2:1.

- [X] T022 [US2] Rebuild `EffyPromoBanner` in `apps/customer-mobile/shared/src/commonMain/.../core/presentation/StorefrontKit.kt` around a **fixed 2:1 box** using the generated canvas constants. ⚠ Because the artwork is 2:1 **and** the box is 2:1, the scale is uniform and **nothing is ever cropped** — FR-013 is satisfied by construction, not by crop arithmetic (research R2).
- [X] T023 [US2] Replace 028's flat 72% scrim with a **gradient** — opaque behind the text zone, clear elsewhere — so the artwork is visible where there is no type. ⚠ Under the monochrome palette there is **no hue** to separate type from photograph, so the scrim carries all of it; tune against a **light, high-detail** image, which is the worst case, not a convenient one (FR-031a, research R6).
- [X] T024 [US2] Lay the 2:1 box out **before** the image resolves, with the existing shimmer inside it, so nothing below moves when the artwork lands (FR-016 / SC-005)
- [X] T025 [US2] Bound the banner on wide windows — **centred, not stretched** (FR-015), at the **max render width recorded in T004's JSON**. ⚠ Pin an actual number there; "a sensible maximum" is not something T058's tablet check can pass or fail.
- [X] T026 [P] [US2] Unit-test the banner geometry helper in `apps/customer-mobile/shared/src/commonTest/.../core/presentation/` — the rendered box is 2:1 at every window class, and the bound is applied above the canonical width. ⚠ Test the **pure sizing function**, not the composable; 028 twice had layout maths pass a function test and fail on a device, so the device walk remains the real gate.
- [X] T027 [US2] Keep the message as **live text** over the artwork (FR-031) — artwork is background only. This upholds 028's FR-033; do not bake copy into the image.

**Checkpoint**: US1 + US2 together are shippable — operators can make banners that render correctly. **This is the natural MVP.**

---

## Phase 5: User Story 3 — The offers section (Priority: P2)

**Goal**: a dedicated, titled place for the store's current offers.

**Independent Test**: load Home with 0, 1 and several live promotions and confirm the section renders,
swipes and disappears correspondingly.

- [X] T027a [US3] Extend `packages/shared-types/src/storefront.ts` — `BannerDTO` gains an optional `placement`. ⚠ **Moved ahead of US4.** T029 splits `composeHome` by placement, so the field must exist before US3 compiles; the original ordering put it in Phase 6 and US3 could not have built.
- [X] T027b [US3] Run `make cm-contract-gen`, then `make cm-contract-check` — the committed Kotlin regenerates cleanly with zero drift
- [X] T027c [US3] Map the placement in `apps/customer-mobile/shared/src/commonMain/.../features/catalog/data/CatalogMappers.kt` — ⚠ an **unknown wire value maps to `CAROUSEL`**, not to a failure; a promotion must never vanish because a new placement was added server-side first (tolerant reader)
- [X] T027d [P] [US3] **Update BOTH halves of the cross-language wire contract in lockstep** — `apis/core-api/internal/features/storefront/wire_contract_test.go` and `apps/customer-mobile/shared/src/commonTest/.../BannerWireContractTest.kt` — adding `placement` to the byte-identical `BANNER_WIRE_JSON` literal and asserting it serialises as a **string**. ⚠ **This is the guard 027's post-mortem asked for and 028 built**, and both files say *"change it in BOTH files or the test is worthless"*. Adding a `BannerDTO` field without touching it is exactly the regression class it exists to catch — on a laptop rather than on a device.
- [X] T028 [US3] Add `HomeBlock.Offers` to `apps/customer-mobile/shared/src/commonMain/.../features/catalog/presentation/HomeBlocks.kt` per [data-model.md](./data-model.md) §5
- [X] T029 [US3] Extend the pure `composeHome` to split banners by placement — `carousel` collect into one `Offers` block after the category row and before the first section; `inline` keep 028's position-interleaving into `Promo`. ⚠ Both rules stay in the **pure function** so both stay testable without a device.
- [X] T030 [US3] Bound the `Offers` block at **6** banners, earliest order winning, and **log** the drop (FR-026, research R9) — a silent cap reads to an operator as "my promotion did not save"
- [X] T031 [P] [US3] Extend `apps/customer-mobile/shared/src/commonTest/.../features/catalog/HomeBlocksTest.kt` — carousel and inline banners land in different blocks; the `Offers` block sits after the categories and before the first section; 0 banners produces **no block at all**; the 6-bound drops the right ones
- [X] T032 [US3] Render the offers section in `HomeScreen.kt` — a titled section; **one** banner renders plain with **no** position indicator; several render in a pager **with** one; **none** renders nothing at all (FR-023/FR-024)
- [X] T033 [US3] **No auto-advance** (FR-022) — mobile has no hover, so a shopper cannot pause a rotating carousel and may be navigated somewhere they never chose
- [X] T034 [US3] Announce the section as a **bounded, named group** (FR-025) — `isTraversalGroup`, as 028 learned a `contentDescription` alone names a row without bounding it

**Checkpoint**: offers have a home. Placement is still server-default only.

---

## Phase 6: User Story 4 — Placement (Priority: P2)

**Goal**: an operator decides where each promotion appears, and in what order.

**Independent Test**: from the back-office — set a placement, confirm the banner appears there and
nowhere else.

- [X] T035 [US4] ⚠ **PULLED FORWARD into US1** — the type system forced it: `PromoCode` carries the placement, so every consumer stopped compiling without it. Same class of ordering issue analyze caught as F6. Scaffold with `make db-new name=promo_banner_placement`, then author `db/migrations/<timestamp>_promo_banner_placement.sql` — one column, a text CHECK enum (`'carousel' | 'inline'`), **defaulting to `'carousel'`**. ⚠ The default is a safety choice (FR-027a): an operator who advertises without choosing gets the offers section, where shoppers look for offers. Defaulting to `inline` would scatter unconsidered promotions through the merchandising.
- [X] T036 [US4] Extend `apis/edge-api/admin/src/promotions/repository.ts` and `types.ts` — read, create and update the placement. ⚠ **Presentation metadata**: it must be editable on a **redeemed** code and MUST NOT be routed through the FR-068 value-immutability transaction.
- [X] T037 [US4] Validate the placement in `apis/edge-api/admin/src/promotions/service.ts` — any value outside the two is refused with a field-level message
- [X] T038 [US4] Map the placement through `apis/edge-api/admin/src/promotions/handler-support.ts` into `PromoCodeDTO`
- [X] T039 [P] [US4] Extend `apis/edge-api/admin/src/promotions/service.test.ts` — an invalid placement is refused; a placement change on a redeemed code is **accepted**; an audit row is written
- [X] T040 [US4] Return the placement from `apis/core-api/internal/features/storefront/repository.go` (`AdvertisedPromotions`) and carry it onto the domain `Banner` in `service.go`
- [X] T041 [P] [US4] Extend `apis/core-api/internal/features/storefront/banner_test.go` — the placement survives composition, and an unknown value does not break the read
- [X] T042 [P] [US4] Extend `apps/customer-mobile/shared/src/commonTest/.../features/catalog/CatalogMappersTest.kt` — each placement maps, an absent one defaults to carousel, an unknown one does too
- [X] T043 [US4] Order the `Offers` block by `banner_position` in `composeHome` — FR-028 says an operator controls order *within a placement*, and 028's `banner_position` now means two different things depending on placement (swipe order vs. section index)
- [X] T044 [US4] Update the console's **"Position"** field label and help text in `AdvertisingSection.tsx` to say what it means in each placement. ⚠ Its semantics changed under it; a control whose meaning silently depends on another control is how an operator gets a result they did not ask for.
- [X] T045 [US4] Add the placement control to `apps/back-office/src/features/promotions/components/AdvertisingSection.tsx` — defaulting to the carousel, disabled while the promotion is not advertised
- [X] T046 [P] [US4] Extend the back-office test — the control defaults to carousel and is disabled while advertising is off

**Checkpoint**: the full authoring → rendering loop exists in code.

---

## Phase 7: User Story 5 — Walking the loop (Priority: P3)

**Goal**: a promotional banner renders. For the first time on this platform.

⚠ **This story exists because 028 shipped this path and signed off without running it.** Every claim
029 makes about banners rests on it working. It is a first-class story precisely so it cannot be
deferred a second time (research R12).

- [X] T047 [US5] **⚠ OPERATOR** Commit the migration (003 commit-guard), then `make db-up ENV=dev`
- [ ] T048 [US5] **⚠ OPERATOR** `make edge-deploy SERVICE=admin ENV=dev`
- [X] T049 [US5] **⚠ OPERATOR** `make core-run` with the rebuilt binary, for the placement read
- [ ] T050 [US5] **⚠ OPERATOR** Walk [quickstart.md](./quickstart.md) §2 — produce a banner from the template, and confirm a wrong-shaped upload is refused with guidance
- [ ] T051 [US5] **⚠ OPERATOR** Walk [quickstart.md](./quickstart.md) §2a — **bypass the console**: presign, PUT a deliberately wrong-shaped image straight to S3, then save the key. ⚠ The save **must** be refused. If it succeeds, FR-004 is decorative and T012 is not doing its job.
- [ ] T052 [US5] **⚠ OPERATOR** Walk [quickstart.md](./quickstart.md) §4 — advertise, **see the banner on a real device**, end the promotion, watch it disappear (SC-010)
- [X] T053 [US5] **⚠ OPERATOR** Prove the **not-advertised** case (SC-011) with advertised and unadvertised promotions live simultaneously — the private-credit case that turns one customer's goodwill into a storewide discount if it leaks
- [ ] T054 [US5] **⚠ OPERATOR** Prove the **exhaustion** take-down — fill `max_redemptions` and confirm the banner goes, because the redemption count says so rather than because anyone flipped a flag

**Checkpoint**: the loop 028 never ran is proven.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T055 [P] Verify reduced motion — the pager and any banner transition route through the existing motion spec; a shopper who asked for less movement gets none added
- [ ] T056 [P] Verify touch targets and accessible labels on every banner and the offers section (FR-025)
- [ ] T057 Verify dark appearance and the **largest supported system text size** — the message stays legible over artwork, nothing clips (SC-008)
- [ ] T058 Verify tablet and landscape — bounded and centred, **not** stretched (FR-015)
- [X] T059 Run the full machine gate set in [quickstart.md](./quickstart.md) §1. ⚠ **`cm-tokens-check` output CHANGES in this slice** — regenerate and commit deliberately; a red guard here is *the change*, not drift, and reverting it is the wrong instinct
- [X] T060 Run both mobile suites plus `assembleDebug` and the iOS Kotlin/Native compile
- [X] T061 [P] Update the parity register at [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) with a §029 entry — including that `customer-web` still does not read `placement`, `code`, `terms` or `target`
- [ ] T062 **⚠ OPERATOR** Walk [quickstart.md](./quickstart.md) §3 on **both Android and iOS**. ⚠ 028's SC-013 was never done because only iOS was ever looked at — do not repeat that.
- [ ] T063 **⚠ OPERATOR** Record the §5 measurements, and **answer 028's research R9**: does a hueless banner draw the eye? (⚠ *028's* R9 — 029's R9 is the carousel bound, a different thing) It has been unanswerable since 028 because no banner ever rendered. ⚠ If it reads too quietly the fix is contrast **within the neutral ramp** and the scrim gradient — **never a new colour**, which would fail `check-no-emerald.sh` and violate Principle V.
- [X] T064 Sign-off: write `SIGNOFF.md`, update [CLAUDE.md](../../CLAUDE.md)'s Active Feature section, and commit

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies
- **Phase 2 (Foundational)** — blocks US1–US4. The canvas is what every other phase reads.
- **Phase 3 (US1)** — depends on Phase 2
- **Phase 4 (US2)** — depends on Phase 2; independent of US1, but **ships with it**
- **Phase 5 (US3)** — depends on Phase 2. It now carries the contract/mapper work it actually needs (T027a–T027d), so it compiles on its own; everything still defaults to carousel until US4 lets an operator choose.
- **Phase 6 (US4)** — depends on US3, which now carries the contract, regen, mapper and wire-contract tasks (T027a–T027d). ⚠ Those were originally placed here, which would have left US3 **uncompilable as ordered** — T029 splits `composeHome` by a field the contract had not yet added.
- **Phase 7 (US5)** — depends on US1–US4 **and** on T047–T049 being run
- **Phase 8** — depends on whichever stories shipped

### Story dependencies

```
Setup ──► Foundational ──┬──► US1 (P1) ──┐
                         │               ├──► ships together = MVP
                         ├──► US2 (P1) ──┘
                         │
                         └──► US3 (P2) ──► US4 (P2) ──► US5 (P3)
```

**US1 and US2 are the only pair that must ship together.** A template operators can trust but that
renders wrong is worthless, and a correct renderer with no way to make artwork is unusable.

### Within each story

- Constants before generators before consumers
- Contract (`shared-types`) → regenerate → consumers, always in that order (Principle II)
- Pure functions and their tests before the composables that use them

---

## Parallel Opportunities

**Phase 2:**
```
T008 (canvas constants test)   ┐ different packages
T010 (dimension reader test)   ┘
```

**Phase 3 / 4 (the P1 pair) — different languages, no shared files:**
```
T014 (edge-api vitest)      — apis/edge-api/admin/…
T021 (back-office test)     — apps/back-office/…
T026 (mobile geometry test) — commonTest/…
```

**Phase 6 — the widest fan-out:**
```
T039 (admin vitest) · T041 (Go banner test) · T042 (Kotlin mapper test) · T046 (console test)
```

**Phase 8:**
```
T055 · T056 · T061 — independent concerns, different call sites
```

---

## Implementation Strategy

### MVP — US1 + US2 (Phases 1–4)

1. Setup → Foundational → US1 → US2
2. **STOP and validate**: an operator produces a banner from the template; it renders at 2:1 on a
   device without stretching or layout shift
3. Shippable. Banners appear where 028 already places them; the carousel and placement control come next.

### Full slice

4. US3 → US4 → US5 → Phase 8
5. ⚠ **Do not skip US5.** It is the whole reason this feature exists rather than being an amendment
   to 028.

---

## Notes

- The three highest-risk tasks, each for a reason already paid for once:
  - **T012 / T051** — verification that only runs client-side is not verification. The bypass test is
    the proof, not the code.
  - **T005 / T059** — `tokens:check` changing looks exactly like drift; the wrong instinct is to revert.
  - **T022 / T026** — 028 twice had layout maths pass a unit test and fail on a device. The pure
    function is worth testing; the device walk is still the gate.
- ⚠ **028's own lesson, which recurred four times in that slice**: a test passes when the fixture
  agrees with the code rather than with the world. Where a task has a fixture, prefer the real shape.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
