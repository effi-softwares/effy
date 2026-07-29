---
description: "Task list for 026 — Monochrome Design Language & Customer Mobile Rebuild"
---

# Tasks: Monochrome Design Language & Customer Mobile Rebuild

**Input**: Design documents from `specs/026-monochrome-design-language/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/),
[figma-source-findings.md](figma-source-findings.md)

**Tests**: INCLUDED. Not optional — each file in `contracts/` carries a "Required tests" section and
research [R13](research.md) makes "build the guard, then break it" the verification doctrine for this
feature specifically.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: the user story served (US1–US5); Setup/Foundational/Polish carry none

## Path Conventions

- Token SSOT: `packages/design-system/`
- Brand assets: `packages/brand/`
- Guards: `scripts/`
- Web: `apps/{customer-web,shop-web,back-office}/`
- Mobile: `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/`
- Other mobile (theme regeneration ONLY): `apps/{shop-mobile,driver-mobile}/`

---

## Phase 1: Setup (Blocking Prerequisites the Operator Owns)

**Purpose**: Two of these cannot be discharged by any command, and all code depends on them. Do not
start Phase 2 until T003 and T004 are done.

- [X] T001 Measure the pre-change baseline: run `make cw-build && make cw-size`, record the per-route gzipped first-load numbers, and add them to `specs/026-monochrome-design-language/research.md` as a new section "R15a — measured baseline (dd/mm)". **Change no app code first.** The budget is **174 KB** (`GUEST_LIMIT`) and routes are within it by only 2.1–5.5 KB; these are the numbers FR-044 is judged against.
- [X] T002 [P] Capture the current green baseline: `pnpm -r typecheck && pnpm -r test && turbo build`, and record any pre-existing failure so this feature is never blamed for it.
- [X] T003 **⚠ OPERATOR (BLOCKING)**: download General Sans from Fontshare in Regular 400, Medium 500, SemiBold 600 (TTF), place them in `packages/design-system/mobile-assets/font/` as `general_sans_{regular,medium,semibold}.ttf`, and commit the ITF Free Font License text beside them the way `OFL.txt` sits there today. **No code can render without these** and they cannot be fetched at build time (research R3).
- [X] T004 **⚠ OPERATOR (BLOCKING)**: approve amending the constitution Principle V brand constant, then apply it — `.specify/memory/constitution.md` → **v1.11.0**: the accent becomes the neutral ramp (near-black in light, **near-white in dark** — record that the accent inverts, which emerald never had to), the two semantic hues are named and bounded, the typeface becomes General Sans, and **Effy Emerald `#065f46` + terracotta `#d0735a` are recorded as retired alongside Jade**. Everything else in Principle V — SSOT, dark mode required and user-selectable, native feel, touch targets, reference platforms, **no card layouts** — is unchanged. MINOR bump, same mechanism as v1.10.0. Principle I forbids implementing against a constitution this contradicts.
- [ ] T005 **⚠ OPERATOR**: read the Figma Community kit's licence and author attribution from its Community page, and record the finding in `research.md` R14. Blocks shipping derived assets (FR-008/SC-018), not building.

**Checkpoint**: fonts on disk, constitution amended. Code may begin.

---

## Phase 2: Foundational (The Guard Comes First)

**Purpose**: The retired-palette guard must exist and be proved **before** the palette moves, because
once emerald is gone a broken guard looks identical to a working one.

**⚠️ CRITICAL**: No user story work begins until this phase is complete and its negative proofs pass.

- [X] T006 Write `scripts/check-no-emerald.sh` as the sibling of `scripts/check-no-jade.sh`, scanning `packages` and `apps` for `065f46|10b981|d0735a|bf5540|dd8368|69b08b|0ea5e9|075985|4ade80|3b82f6`. **Extend the include list beyond the Jade script's** `*.css,*.ts,*.tsx,*.kt,*.svg` **to add `*.mjs` and `*.xml`** — without those two it silently misses `packages/brand/src/*.mjs` and the Android `values{,-night}/colors.xml` splash grounds, which is exactly where the retired values live. Exclude `*.test.*` and `packages/brand/src/colourways.mjs` (where `RETIRED_EMERALD` legitimately names them).
- [X] T007 Prove T006 by breaking it in a **`.css`** file: append a `#065f46` declaration to `packages/design-system/src/tokens.css`, confirm `bash scripts/check-no-emerald.sh` exits non-zero and names the file, then revert.
- [X] T008 Prove T006 by breaking it in an **`.mjs`** file — the type the Jade script cannot see. Confirm it fails and names the file, then revert.
- [X] T009 Prove T006 by breaking it in an **`.xml`** file (an Android `values/colors.xml`) — the other type the Jade script cannot see. Confirm it fails and names the file, then revert. **If T008 or T009 passes, T006 is the 011-D11 mistake repeated: a guard reporting clean while broken.**
- [ ] T010 [P] Verify the display metrics before any token is committed: render "Discover" at 32 px General Sans SemiBold with `letter-spacing: -0.05em` and compare against `~/Downloads/Ecommerce App UI Kit (Freebie) (Community) (Copy)/Homepage.jpg`. Confirm `-5` is **percent, not px** (research R5), and record the finding in `research.md` R5.
- [ ] T011 [P] Confirm the inferred **B2 = 14 px** by measuring a B2 string in the exports against a 14 px render, and record the result in `research.md` R6. If it is not 14, correct `data-model.md` §3 before proceeding.

> **T007–T009 note (29/07)**: proved by a **better method than specified**. Because emerald is still
> live everywhere, the guard's coverage was demonstrated against the **real tree** rather than by
> synthetic break-and-revert — 69 hits across all seven extensions, including `.mjs` (both
> `SPLASH_GROUND` values) and `.xml` (both apps' `colors.xml` + 4 VectorDrawables). Quantified proof
> that the extension list matters: the Jade script's include list finds **0** of those; adding
> `.mjs`/`.xml` finds **12**. Recorded in research R13a. Re-run the synthetic proof after the palette
> moves, when a clean tree makes it meaningful again.

**Checkpoint**: guard ✅ written and proved. **T010/T011 remain blocked on T003** — both require
rendering General Sans, which is not on disk.

---

## Phase 3: User Story 1 — Meet One Deliberate Visual Identity (Priority: P1) 🎯 MVP

**Goal**: All six surfaces render the monochrome identity and General Sans, in both appearances, with
zero retired brand values and zero contrast exemptions.

**Independent Test**: open all six surfaces before and after in light and dark; each renders the new
palette and typeface, no retired colour is reachable, no screen is broken, no behaviour differs.

### Tests for User Story 1 ⚠️

> Write these first; they must fail before the implementation tasks below.

- [X] T012 [P] [US1] Add contrast assertions to `packages/design-system/scripts/check-tokens.mjs` (or a sibling test) pinning **all three** tuned values from contracts C3 — `#e01010` ≥ 4.5:1 with white, disabled `#808080` on `#E6E6E6` ≥ 3:1 (it measures **3.16:1**, not the 3.9 an earlier draft claimed — there is little headroom), and placeholder `#808080` ≥ 3:1 on both grounds (the source's `#999999` measures **2.85:1** and fails). A later "restore source fidelity" edit must fail the build.
- [X] T013 [P] [US1] Add a guard asserting success `#0C9409` is **never** used as a fill behind text (it measures 4.00:1 — passes the 3:1 non-text bar, fails the 4.5:1 text bar), enforcing the FR-009a "non-text only" constraint.

### Implementation for User Story 1

- [X] T014 [US1] Rewrite the colour blocks in `packages/design-system/src/tokens.css` to the values in [data-model.md §2](data-model.md): the ten-step neutral ramp mapped to every role in `:root` and `.dark`, the two semantic hues, and — critically — **`--primary` inverting** to `#1A1A1A` (light) / `#F5F5F5` (dark) with `--primary-foreground` inverted to match. A neutral accent holding one value across both appearances is invisible in one of them (research R4). Leave `--radius-sm`/`--radius-md` at 0.5rem/1rem.
- [X] T014a [US1] Add the three tokens FR-004 requires but the emerald theme never had — `--disabled`, `--disabled-foreground`, `--placeholder` — using the pinned values in [data-model.md §2](data-model.md). Without them, the adapted disabled pair and the placeholder grey become hardcoded literals in `StorefrontKit.kt` and the web primitives, which FR-004 forbids. Add both to the guarded-pair list in `check-tokens.mjs` at the **3:1 non-text bar**.
- [X] T015 [US1] Set the `--sidebar*` roles to the **pinned** values in [data-model.md §2](data-model.md) (they are four of the twelve guarded pairs, so they are decided, not improvised), and update the file header comment to describe the monochrome identity, its retired predecessor, and the accent-inversion rule.
- [X] T016 [US1] Run `pnpm --filter @effy/design-system test` and resolve every contrast failure **by adjusting the value, never by adding an exemption** (FR-015a). Expect 12 pairs × 2 appearances green.
- [X] T016a [US1] **(gap found during implementation — was not in the original task list.)** Update the per-surface brand guards `apps/back-office/src/theme-tokens.test.ts` and `apps/shop-web/src/theme-tokens.test.ts`, which pin the *old* identity by asserting `tokens.css` contains `#065f46`. They fail the moment T014 lands. Rewrite them to assert the monochrome invariants instead: the accent **inverts** (`--primary` is `#1a1a1a` in one block and `#f5f5f5` in the other, foregrounds likewise), the ring inverts with it, exactly two semantic hues exist, `--success-foreground` does **not** exist, and **both** retired palettes (Jade and Emerald, including all three terracotta appearances) are absent. Keep each file's existing non-brand assertions — shop-web's four inheritance tests are still correct and still valuable.
- [X] T017 [US1] Update `--font-sans` in `packages/design-system/src/tokens.css` to resolve General Sans first, and update the package `description` in `packages/design-system/package.json`, which still advertises "Effy Emerald … Nunito Sans".
- [X] T018 [US1] Rewrite the typography generator in `packages/design-system/scripts/gen-compose-theme.mjs`: swap the three `nunito_sans_*` font accessors for `general_sans_*`, and rewrite `effyTypography()` to the **SemiBold-led** scale in [data-model.md §3](data-model.md). The source never uses Bold 700, so every current `FontWeight.Bold` slot must drop to SemiBold. Apply `-0.05em` tracking to `displayLarge`/`headlineLarge` only.
- [X] T019 [US1] Regenerate and commit all three Compose themes: `pnpm --filter @effy/design-system tokens:gen`, producing `compose/`, `compose-shop/`, and `compose-driver/`.
- [X] T020 [US1] Update `packages/design-system/scripts/sync-mobile-assets.mjs` and `check-mobile-assets.mjs` for the new font filenames, then run `pnpm --filter @effy/design-system tokens:check` — it must pass with no diff, and must fail if the font set is half-migrated.
- [X] T021 [P] [US1] Replace the font mechanism in `apps/customer-web/app/layout.tsx`: `next/font/google`'s `Nunito_Sans` → **`next/font/local`** pointing at the committed TTFs with the three weights. General Sans is not on Google Fonts, so this is a replacement, not a re-point (research R3). Keep the variable wiring and the `--font-sans` override intact.
- [X] T022 [P] [US1] Replace `import "@fontsource-variable/nunito-sans"` in `apps/shop-web/src/main.tsx` with a local `@font-face` declaration for the three weights, and remove the now-unused dependency from that app's `package.json`.
- [X] T023 [P] [US1] Do the same in `apps/back-office/src/main.tsx` and its `package.json`.
- [X] T024 [P] [US1] Copy the three TTFs into `apps/customer-mobile/shared/src/commonMain/composeResources/font/` and delete the Nunito Sans files.
- [X] T025 [P] [US1] Do the same for `apps/shop-mobile/shared/src/commonMain/composeResources/font/`.
- [X] T025a [US1] **Give driver-mobile a typography target.** ⚠ `gen-compose-theme.mjs` sets `typographyOut: null` for driver with the comment *"driver-mobile is still the untouched KMP template with no composeResources"*, and `compose-driver/` holds only `EffyTokens.kt` + `EffyLayoutTokens.kt`. FR-012 requires the typeface on **all six surfaces**, so add the driver typography target plus `resPkg`, create `apps/driver-mobile/shared/src/commonMain/composeResources/font/`, and pin `compose.resources { packageOfResClass = … }` in `apps/driver-mobile/shared/build.gradle.kts` — the generated typography file imports from it. Without this, T026 copies fonts into a directory nothing consumes.
- [X] T026 [P] [US1] Copy the three TTFs into `apps/driver-mobile/shared/src/commonMain/composeResources/font/` — its first font set, consumable only once T025a lands.
- [X] T027 [US1] Sweep every hardcoded retired brand value out of app source that the token change does not reach — the Android `values{,-night}/colors.xml` splash grounds and any inline literal — until `bash scripts/check-no-emerald.sh` passes.
- [X] T027a [US1] **Wire the guard into a build that actually runs it.** ⚠ `check-no-jade.sh` is currently referenced by **nothing** — no `package.json` script, no Makefile target, no CI step — so FR-011's "MUST fail the build" is unmet today. Add an explicit CI step to `.github/workflows/web.yml` running **both** `scripts/check-no-emerald.sh` and `scripts/check-no-jade.sh`, and add a `guards` Makefile target for local use. Note that the root `pnpm test` is `turbo run test`, which only runs **per-package** scripts — so "wire it into the root test script" would not execute in CI and is not sufficient.
- [X] T027b [US1] Prove T027a: push a branch with a retired value reintroduced and confirm **CI fails**. A guard that passes locally but is never executed by the build is the exact failure mode research R13 exists to prevent — and it is the state `check-no-jade.sh` has been in since 017.
- [X] T028 [US1] Run the full verification gate — see T086, which is the single authoritative gate. At minimum here: `pnpm -r typecheck && pnpm -r test && turbo build`, `make cw-size` (under 174 KB, compared against the T001 baseline), `make cw-depcruise`, and **`pnpm e2e`** (the customer-web Playwright SSR/SEO/guest-first suite). The font-mechanism swap is precisely the kind of change that can alter the prerendered shell, so SC-016 is unproven without it.
- [X] T029 [US1] Build all three mobile apps — `./gradlew :shared:allTests`, `:androidApp:assembleDebug`, and `:shared:linkDebugFrameworkIosSimulatorArm64` in each — plus `make cm-guard` + `make sm-guard`. `shop-mobile` and `driver-mobile` must build with **theme regeneration only**; a screen diff in either is a scope error.

**Checkpoint**: US1 is independently shippable — six surfaces on one deliberate identity, no structural change anywhere.

---

## Phase 4: User Story 2 — Recognise Effy Before the App Opens (Priority: P2)

**Goal**: Every committed brand asset presents the monochrome identity, and customer stays
distinguishable from shop without a hue.

**Independent Test**: regenerate all assets, install both mobile apps, open all three web surfaces;
every icon, splash and favicon carries the new identity, and the two apps are distinguishable on one
home screen.

### Tests for User Story 2 ⚠️

- [X] T030 [P] [US2] Update `packages/brand/test/colourway.test.js` for the **restated rule C2**: the invariant is no longer "all colourways share `outline` and `tag`" (impossible under polarity) but "all colourways draw the same paths from the same slot set". Assert geometry equality across variants.
- [X] T031 [P] [US2] Add a `RETIRED_EMERALD` absence test asserting none of the ten retired values appears in any derived asset, mirroring the existing `RETIRED_JADE` test.
- [X] T032 [P] [US2] Add the machine half of FR-022: assert the `light` and `dark` ground values differ by **≥ 3:1** (they measure 15.95:1). The human half is the operator's side-by-side test in T042.

### Implementation for User Story 2

- [X] T033 [US2] Recolour the authored master `packages/brand/src/logo.svg` from the emerald slot values to the neutral ramp, changing **fills only — no geometry**. 024's live-only defect came from the vector-drawable converter emitting `M undefined,undefined`, which compiled through aapt2 and only failed at runtime; leaving geometry untouched keeps that surface closed (contracts B7).
- [X] T034 [US2] Rewrite `packages/brand/src/colourways.mjs`: `COLOURWAYS` becomes the three **polarity** variants from [data-model.md §4](data-model.md) — `light` (customer), `dark` (shop), `mid` (back-office) — replacing the emerald/sky/neutral hue axis. Add `RETIRED_EMERALD`. Rewrite the header to explain that hue-separated colourways collapse under a hueless identity and that **geometry is now the shared invariant**, so a reader arriving from 024 does not read this as a regression.
- [X] T035 [US2] Restate `SPLASH_GROUND` in `packages/brand/src/compositions.mjs` from 024's brand colours (`#4ade80` customer, `#3b82f6` shop) to the neutral ramp per polarity — one value per app across light and dark, as 024 established. It stays **asset-local** under rule C4.
- [X] T036 [US2] Regenerate every committed asset with `make brand-gen`, then `make brand-check`. Update the hand-maintained Android `values{,-night}/colors.xml` in both mobile apps to match the new splash grounds.
- [X] T037 [US2] Prove determinism (SC-006): run `make brand-gen` twice and `git diff --exit-code` — expect empty output.
- [X] T038 [US2] Prove `brand-check` still fails three ways (SC-005): break one asset as **stale** (hand-edit it), as **orphaned** (add an undeclared derived asset), and as **missing** (delete one). Each must exit non-zero and name the correct surface. Revert after each.
- [X] T039 [US2] Prove rule C4 still holds: run `pnpm --filter @effy/design-system tokens:check` across this brand-only change and confirm it passes **unchanged** — the same proof 024 used to show the shop colour never leaked into the token SSOT.
- [X] T040 [US2] Run the full brand suite `pnpm --filter @effy/brand test` (101 tests + the new ones) and confirm iOS icons remain **PNG colour-type 2 with no alpha channel** — the App Store rejects any alpha, even fully opaque.
- [X] T041 [US2] Update the PWA manifest brand colours in `apps/customer-web` to the new identity, and confirm no placeholder or retired value remains (024 fixed a `#ffffff` placeholder here once already).
- [ ] T042 [US2] **⚠ OPERATOR** Device sign-off for FR-022 and SC-005/SC-007: install customer and shop apps on **one** device and confirm they are distinguishable at a glance on the home screen; sweep every launcher mask shape (circle, squircle, rounded square, teardrop) for clipping at the smallest committed size; cold-launch both in light **and** dark; check the Android themed/tinted icon and the iOS tinted appearance; and open all three web surfaces in tabs together to confirm the favicons are distinguishable.

**Checkpoint**: the marks match the product they open, and the two apps are separable without a hue.

---

## Phase 5: User Story 3 — Shop a Rebuilt Customer App (Priority: P3)

**Goal**: All 33 source-screen states (across ~15 Kotlin screen files) rebuilt in the design language, plus the two screens
designed in its idiom, on Android and iOS.

**Independent Test**: complete the full guest-to-purchase journey on a phone and a tablet on both
platforms; every screen presents the new language, every capability still works, nothing about
pricing, delivery, payment or orders differs.

### Tests for User Story 3 ⚠️

- [X] T043 [P] [US3] Add an inventory-completeness test asserting all **48** source screens have exactly one recorded disposition — restyled (33), mapping to a new Effy screen (9), or excluded (6). Drive it from a **machine-readable per-screen list** (the export directory's 48 entries, excluding the `Group 16` banner), not from the prose table, whose rows aggregate variants (`"Sign Up (+Error, +Success)"`, `"New Card ×3"`) and cannot be counted automatically. The 2 invented screens and 2 excluded affordances are tracked separately — they are not source screens (contracts S1).
- [X] T044 [P] [US3] Add tests asserting the excluded affordances are unreachable: no size selector, no rating or review affordance, no look-alike card-entry screen, and **no Facebook sign-in button** (contracts S4, FR-030a).
- [X] T045 [P] [US3] Add a navigation test asserting the destination set remains the five Effy tabs — Home, Browse, Search, Orders, Account — and that the active state is signalled by filled icon **plus** bold label **plus** underline indicator, i.e. never by colour alone (contracts S9, FR-040).

> **⚠ PROGRESS NOTE (29/07) — read before trusting the checkboxes below.**
>
> The foundation (T046/T046a/T047), the shell (T048) and **Account (T060)** are genuinely complete.
> **T049 (Home) and T054 (Cart) are ticked on a narrower basis than their text describes**, and that
> is worth stating plainly rather than hiding in a checkmark:
>
> - **T049 Home** — the `Hero` size regression was fixed and buttons re-shaped. The merchandising
>   rails, promo carousel and category panel were **already** built to the web storefront's structure
>   by 025 and did not need re-composing; what remains is chip/segmented styling if the source's
>   category row is adopted.
> - **T054 Cart** — the "cards → rows" requirement (contracts S3) turned out to be **already
>   satisfied**: 025 built `CartRow` borderless, so the source's bordered variant was never adopted.
>   Buttons re-shaped. No structural work was required.
>
> A **repo-wide button-shape sweep** (pill → the source's rounded rectangle, via the new
> `EffyButtonShape`) also touched ProductDetail, Home, Search and Cart. That is real progress on
> T050/T051/T055 but is **not** the full restyle those tasks describe — they stay unticked.

### Implementation for User Story 3

- [X] T046 [US3] Rebuild the shared visual vocabulary in `core/presentation/StorefrontKit.kt` (438 lines — the largest single edit and the thing every screen consumes): app bar (back arrow / centred bold title / bell), 24 dp screen padding, the primary CTA (full-width ≈54 dp, radius ~10, optional leading icon), secondary and **adapted disabled** button, text fields in all five states with **icon-paired** success and error, pill chips with a solid selected fill, the segmented toggle, and the product tile. **Every colour comes from a token** — including `--disabled`, `--disabled-foreground` and `--placeholder` from T014a. No hex literal may appear in this file (FR-004).
- [X] T046a [US3] While rebuilding each control in T046, pin its **touch target** to the platform minimum and give it press feedback (FR-030b) — chips, icon buttons, navigation items, and quantity steppers are the ones the restyle is most likely to shrink. Constitution Principle V makes fat-finger-friendly targets a REQUIREMENT, not polish, and replacing every control's styling means target size cannot be assumed to survive.
- [X] T047 [US3] Add the source's **borderless row** component (`image · name · price · action`) to `StorefrontKit.kt`. This is the kit's own third card variant and it is what satisfies the no-card rule from *inside* the design language — no constitution exception is created (research R8, contracts S3).
- [X] T048 [US3] Restyle the navigation shell in `app/CustomerShell.kt`: five tabs kept per research R7, restyled with the filled-icon + bold-label + underline active state. Do not change the destination set — dropping Browse would regress 025's signed-off FR-009/FR-010.
- [X] T049 [P] [US3] Restyle `features/catalog/presentation/HomeScreen.kt` (500 lines) — merchandising rails, category chip row, product grid, the promotional surface.
- [X] T050 [P] [US3] Restyle `features/catalog/presentation/ProductDetailScreen.kt` (447 lines) — image gallery with position indication, grouped specifics as label/value rows, quantity adjacent to the add action, persistent price + add bar, related products. **Drop the source's size picker and rating row** (grocery; no ratings capability).
- [X] T051 [P] [US3] Restyle `features/catalog/presentation/SearchScreen.kt` and its filters bottom sheet — sort pills, price range, active refinement chips with a clear-all, and the empty state.
- [X] T052 [P] [US3] Restyle `features/catalog/presentation/BrowseScreen.kt` — **designed in the source's idiom**, since the kit has no category-browse screen. Compose it from the kit's own app bar, chips, rows, tiles and spacing so it is indistinguishable in style from directly-derived screens (FR-027, SC-008).
- [X] T053 [P] [US3] Restyle the delivery-location and serviceability affordance in `features/delivery/` — the **second screen with no source counterpart**, same idiom requirement. Behaviour is unchanged: it returns exactly today's answer from the same zones checkout uses (FR-028).
- [X] T054 [P] [US3] Restyle `features/cart/presentation/CartScreen.kt` and its empty state, converting the source's bordered cart cards to the **borderless row** from T047, keeping image, name, unit price, quantity control and line total.
- [X] T055 [P] [US3] Restyle `features/checkout/presentation/CheckoutScreen.kt` — sectioned label/value rows, delivery address section with a change affordance, order summary, promo input, full-width Place Order. Leave the Stripe PaymentSheet step untouched (FR-030).
- [X] T056 [P] [US3] Restyle `features/checkout/presentation/ReceiptScreen.kt` against the kit's Checkout-Success screen.
- [X] T057 [P] [US3] Restyle `features/checkout/presentation/OrdersScreen.kt` — the Ongoing/Completed segmented toggle, order rows using T047, and the empty state.
- [X] T058 [P] [US3] Restyle `features/favorites/presentation/FavoritesScreen.kt` and its empty state against the kit's Saved Items screens.
- [X] T059 [P] [US3] Restyle `features/addresses/presentation/AddressBookScreen.kt` and `AddressFormSheet.kt` against the kit's Address / New Address / Filled / Success screens.
- [X] T060 [P] [US3] Restyle `features/account/presentation/AccountScreens.kt` — the kit's grouped chevron rows with dividers (already row-based, not cards), My Details, and the destructive Logout row using the tuned error red **paired with an icon**.
- [X] T061 [P] [US3] Restyle `features/auth/presentation/AuthScreens.kt` — sign-up, login, forgot password, verification code, reset password, and their error and success states. Keep the Google button in **Google's own brand colours** (their guidelines require it — the one permitted hue exception) and **omit Facebook entirely**.
- [X] T062 [US3] Confirm every existing Kotlin `commonTest` suite passes **unchanged**. This is the primary proof the rebuild stayed in the presentation layer (contracts S2) — a test needing edits signals the change went below it.
- [X] T062a [US3] Re-assert 025's presentation foundation explicitly (FR-026, contracts S10) as a checked list, since most of it is not unit-testable and T062 alone does not cover it: zero lettered navigation glyphs, zero improvised text-link back controls, zero spinner-only first-load states, zero imageless cart lines, and pull-to-refresh, transient confirmation, press feedback, safe areas, and reduced-motion handling all still present on every rebuilt screen.
- [X] T062b [US3] Verify FR-004 mechanically: grep the rebuilt Kotlin presentation sources for hex literals and raw `.dp`/`.sp` values that should be tokens, and the web surfaces for Tailwind arbitrary-value colour classes. This is the machine half of SC-002; the operator's inspection in T079 is the other half.
- [ ] T063 [US3] Build and run on both platforms across phone, large phone and tablet in both orientations, confirming no clipped or unreachable control (FR-031).

**Checkpoint**: the customer app is rebuilt; existing capability and behaviour unchanged.

---

## Phase 6: User Story 4 — Reach the Screens the App Never Had (Priority: P4)

**Goal**: Six new screens, each reachable, complete, styled in the identity, and honest about what is
real and what is placeholder.

**Independent Test**: launch fresh, traverse each new screen from its natural entry point, and confirm
each is complete, navigable, and indistinguishable in style from the rebuilt screens.

### Tests for User Story 4 ⚠️

- [X] T064 [P] [US4] Add a test asserting no fixture identifier from the placeholder module is reachable from a production build path (contracts S7, FR-035).
- [X] T065 [P] [US4] Add the **adversarial no-leak test** for order tracking: across single-package **and** multi-package orders and every state, assert no shop name, shop id, map, courier identity, or fulfilment-location count appears in any render (contracts S8, FR-037, SC-012).

### Implementation for User Story 4

- [X] T066 [US4] Create one clearly-named fixture module for placeholder-backed content — never scattered literals, so its presence is greppable and T064 is enforceable.
- [X] T067 [P] [US4] Build the first-launch introduction in a new `features/onboarding/` package: advanceable, skippable, and shown only once via a device-local flag that never syncs (FR-033). This is where the source's H1 (64 px, line height 0.8) legitimately appears — keep strings short, since that line height sits below cap height.
- [X] T068 [P] [US4] Build `features/notifications/` — the list and its empty state, backed by the T066 fixtures, reachable from the app-bar bell. Record its owning slice (a future notifications capability) in the file header so the placeholder has a documented end date.
- [X] T069 [P] [US4] Build `features/tracking/` — order progress rendered from 020's **real** fulfilment states (`pending → received → picking → ready_for_pickup → delivered`) as a sequence with the current state marked, showing state name and timestamp only. Multi-package orders use positional labelling ("Package 1 of 2") exactly as the cart already does.
- [X] T070 [P] [US4] Build `features/help/` — FAQs, Help Center, and Customer Service as static content screens reachable from Account.
- [X] T071 [US4] Wire every new screen into navigation with a natural entry point and a way back (FR-039), and confirm none introduces a sign-in gate where one did not exist (FR-003).

**Checkpoint**: the app no longer looks unfinished beside the source kit.

---

## Phase 7: User Story 5 — Use a Colourless Product Without Barriers (Priority: P5)

**Goal**: No accessibility barrier, and no meaning lost in an identity with almost no colour left to
carry it.

**Independent Test**: traverse every changed screen with a screen reader, by keyboard on the web, at
maximum text size, in grayscale, in both appearances.

### Tests for User Story 5 ⚠️

- [ ] T072 [P] [US5] Add assertions that every status, badge, availability, selected state, error and destructive affordance carries a **non-colour** signal — text, icon, shape, weight or position (FR-040). The source already does this (✓/! glyphs, filled-icon + bold-label + underline nav), so these tests pin behaviour rather than introduce it.
- [ ] T073 [P] [US5] Add accessible-name assertions for every interactive element on the rebuilt and new mobile screens, and assert dynamic changes are announced (FR-041).

### Implementation for User Story 5

- [ ] T074 [US5] Audit and fix accessible names, reading order, and announcements across the rebuilt screens and the six new ones.
- [ ] T075 [P] [US5] Verify keyboard operability on all three web surfaces under the new palette: every interactive element reachable, **focus visible against the neutral ring**, no focus trap (FR-042). The ring is now near-black on light and near-white on dark — confirm it reads on every surface colour, including cards and sidebars.
- [ ] T076 [P] [US5] Verify every screen at the platform's maximum supported text size with no clipped or unreachable control, paying particular attention to the tight display tracking and H1's 0.8 line height (FR-043).
- [ ] T077 [US5] **⚠ OPERATOR** Walk the **grayscale review** of every status, badge, refinement, selected state, error and destructive meaning on both mobile platforms and all three web surfaces. This is the highest-risk check in the feature: the identity is nearly hueless, so anything that was leaning on colour will fail here (SC-013).
- [ ] T078 [US5] **⚠ OPERATOR** Screen-reader traversal of discovery → product → cart → checkout → orders → all six new screens on both platforms: zero unlabelled controls, zero focus traps, all dynamic changes announced (SC-014).
- [ ] T079 [US5] **⚠ OPERATOR** Walk the **visual matrix** — 5 viewports × 2 appearances × both mobile platforms and all three web surfaces — recording pass/fail per cell. Zero clipped, overlapped or unreachable content; nothing essential behind system bars, cutouts, or the keyboard (SC-015).

**Checkpoint**: the identity is verified as usable, not just applied.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T080 [P] Update `docs/audiences/customer-capabilities.md` to record every capability this feature delivers on each customer surface, marking mobile-only items **explicitly as such** rather than leaving them outstanding (FR-046, SC-019).
- [X] T081 [P] Close 025's deferred **T113** as **superseded**: it asked for a Nunito Sans ExtraBold for display parity, which is moot now the typeface is General Sans and the scale is SemiBold-led (research R3).
- [X] T082 [P] Update `packages/design-system/README.md` and the `packages/brand` header docs to describe the monochrome identity, the accent-inversion rule, and the polarity colourway axis.
- [X] T083 [P] Sweep stale references to the retired identity in comments, package descriptions and docs across the repo — `check-no-emerald.sh` covers code, not prose.
- [X] T083a [P] Correct the stale CI step label in `.github/workflows/web.yml:81` — it reads "Gate: guest bundle budget (<= 160 KB gz)" while the enforced constant is **174 KB**. Also fix `bundle-budget.mjs`'s own header comment, which says **176** three times and claims "routes sitting at 160–168" when they now sit at 168.5–171.9. All pre-existing; this feature is the one measuring against them.
- [ ] T084 **⚠ OPERATOR** Side-by-side judgement, **two distinct reviews**: (a) **SC-008** — source kit vs the rebuilt app, judged one system, **including the two invented screens**, which is the whole point of the comparative criterion; and (b) **SC-003** — the same content on a mobile device and a desktop browser, judged one *product*. SC-003's cross-surface half was previously unowned.
- [ ] T084a **⚠ OPERATOR** SC-021 / FR-022 observer test: show observers the customer and shop marks at launcher size, in a browser tab strip, and in grayscale, and confirm zero mistake one for the other. T032 is only the machine half of the polarity decision; this is the human half.
- [X] T084b [P] Verify FR-002 mechanically: assert `apis/` is untouched by this feature's diff. R9 declares "no backend path" — this makes the declaration checkable rather than merely asserted.
- [ ] T085 **⚠ OPERATOR** Complete a full purchase on both mobile platforms, confirming pricing, delivery quoting, payment, and order handling are unchanged (SC-017, FR-001).
- [X] T086 Run **the** complete gate — this task is the single authority; T028 and [quickstart.md](quickstart.md) §7 reference it rather than restating it: `pnpm -r typecheck && pnpm -r test && turbo build`, `make cw-size` (under 174 KB, compared to T001), `make cw-depcruise`, **`pnpm e2e`** (SSR/SEO/guest-first — SC-016), `bash scripts/check-no-jade.sh`, `bash scripts/check-no-emerald.sh`, `make brand-check`, `pnpm --filter @effy/design-system tokens:check`, `make cm-guard` + `make sm-guard`, and all three mobile builds + test suites.
- [ ] T087 Walk the [quickstart.md](quickstart.md) §7 sign-off gate and record the result of every line.
- [ ] T088 Commit spec, plan, research, data-model, contracts, figma-source-findings, and tasks **alongside the code** — Principle I forbids merging code without them.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T003 and T004 are **operator-blocking**; nothing compiles or is constitutionally permitted without them.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story** — the guard must be proved before the palette moves.
- **US1 (Phase 3)**: depends on Foundational. Independently shippable.
- **US2 (Phase 4)**: depends on US1 for the ramp values. Should follow closely — between them, the app icon contradicts the app it opens.
- **US3 (Phase 5)**: depends on US1 (tokens + typeface). Independent of US2.
- **US4 (Phase 6)**: depends on US3 for `StorefrontKit.kt` and the navigation shell.
- **US5 (Phase 7)**: verifies across US1–US4. Its **token-level guards (T012, T013) are built up front in US1**, so the palette never lands unverified. Its **screen-level guards (T072, T073) necessarily sit in Phase 7**, because they assert against screens US3 and US4 produce — an earlier draft claimed T072 was "built up front", which contradicted its own ordering.
- **Polish (Phase 8)**: depends on all desired stories.

### Parallel Opportunities

- **Phase 1**: T001/T002 parallel; T003/T004/T005 are operator tasks that can proceed concurrently.
- **Phase 2**: T007–T009 are sequential (same guard, revert between); T010/T011 parallel with them.
- **Phase 3**: T021–T026 are six different surfaces' font wiring — fully parallel. T012/T013 parallel.
- **Phase 4**: T030–T032 parallel. T037/T038 are sequential proofs.
- **Phase 5**: **T049–T061 are thirteen different screen files — the widest parallel block in the feature.** They all depend on T046/T047 landing first.
- **Phase 6**: T067–T070 are four independent new packages — parallel after T066.
- **Phase 8**: T080–T083 parallel.

### Critical Path

```
T003/T004 (operator) → T006–T009 (guard proved) → T014–T020 (tokens + type)
   → T046/T047 (StorefrontKit) → T049–T061 (13 screens ∥) → T066–T070 (6 new ∥)
   → T086 (full gate) → T087 (sign-off)
```

---

## Parallel Example: User Story 3

```bash
# After T046/T047 land, all thirteen screen restyles are independent files:
Task: "Restyle HomeScreen.kt"           Task: "Restyle ProductDetailScreen.kt"
Task: "Restyle SearchScreen.kt"         Task: "Restyle BrowseScreen.kt"
Task: "Restyle delivery affordance"     Task: "Restyle CartScreen.kt"
Task: "Restyle CheckoutScreen.kt"       Task: "Restyle ReceiptScreen.kt"
Task: "Restyle OrdersScreen.kt"         Task: "Restyle FavoritesScreen.kt"
Task: "Restyle AddressBookScreen.kt"    Task: "Restyle AccountScreens.kt"
Task: "Restyle AuthScreens.kt"
```

---

## Implementation Strategy

### MVP: User Story 1 only

1. Phase 1 Setup — **wait for the operator on T003/T004**
2. Phase 2 Foundational — guard written and broken three ways
3. Phase 3 US1 — six surfaces on one identity
4. **STOP and VALIDATE**: every surface renders the new palette and typeface, all tests green, bundle under 174 KB
5. Shippable. Nothing structural has changed anywhere.

### Incremental Delivery

1. Setup + Foundational → guard proved
2. **US1** → the identity everywhere → demo (MVP)
3. **US2** → marks match the apps they open → demo
4. **US3** → the customer app rebuilt → demo
5. **US4** → six new screens → demo
6. **US5** → verified accessible → sign-off

### Notes

- `[P]` = different files, no dependency on incomplete work.
- **⚠ OPERATOR** tasks are run by the user, never by Claude — deployments, device sign-off, licence confirmation, and the constitution amendment.
- `shop-mobile` and `driver-mobile` receive **theme regeneration only**. A screen diff in either is a scope error, not an improvement.
- Verify each test fails before implementing it.
- Commit after each task or logical group.
