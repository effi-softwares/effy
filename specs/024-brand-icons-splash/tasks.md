---

description: "Task list for 024 — Brand Marks: App Icons, Splash Screens & Favicons"
---

# Tasks: Brand Marks — App Icons, Splash Screens & Favicons

**Input**: Design documents from `/specs/024-brand-icons-splash/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[data-model.md](data-model.md) · [contracts/asset-manifest.contract.md](contracts/asset-manifest.contract.md) ·
[quickstart.md](quickstart.md)

**Tests**: Unit tests ARE included — not as a TDD preference, but because three success criteria
(SC-006 no-alpha, SC-008 drift, SC-009 determinism) are *only* provable by executable checks. Visual
criteria (SC-002/003/004/007) are human sign-off and are tasked as such.

**Organization**: Grouped by user story. Each story phase is independently completable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1–US4, mapping to the spec's user stories
- **[OPERATOR]**: Requires the user — physical device, store submission, or an out-of-code action

## Path Conventions

Monorepo. `packages/brand/` is new; every other path is an existing surface. Mobile apps are
independent Gradle builds; web apps are pnpm workspace members.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up `@effy/brand` and get the authored mark under version control.

- [X] T001 [OPERATOR] Copy the authored vector to `packages/brand/src/logo.svg` (currently only at `~/Desktop/logo.svg` — spec Dependencies). Confirm it is the 1075-byte hand-authored file with flat named colours, **not** the RealFaviconGenerator raster wrapper.
- [X] T002 Create `packages/brand/package.json` as private workspace member `@effy/brand` (`"type": "module"`), with scripts `brand:gen`, `brand:check`, and `test` = `node --test test/ && node scripts/check-brand-assets.mjs` — this is what puts drift detection inside `turbo run test`, mirroring `@effy/design-system`.
- [X] T003 Add `@resvg/resvg-js` and `sharp` as **devDependencies** of `@effy/brand` and install. `sharp` is already in `pnpm-workspace.yaml` `onlyBuiltDependencies`; verify `@resvg/resvg-js` resolves its platform binary without a postinstall entry, and add one only if it does not.
- [X] T004 [P] Write `packages/brand/README.md` stating the package's one rule — derived assets are generated, never hand-edited — and pointing at the contract.
- [X] T005 [P] Add `brand-gen` and `brand-check` targets to the root `Makefile`, following the existing `cm-tokens-check` convention (`@pnpm --filter @effy/brand …`) and registering both in `.PHONY`.

**Checkpoint**: `pnpm --filter @effy/brand test` runs (and fails — nothing exists yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The mark → colourway → composition → raster machinery that **every** user story consumes.

**⚠️ CRITICAL**: No user story can begin until this phase is complete. This is the generator; without
it there is no legitimate way to produce a single asset.

- [X] T006 Create `packages/brand/src/colourways.mjs` defining Emerald / Blue / Neutral / Mono per [data-model.md](data-model.md) §2. Enforce rule **C2** — `outline` `#0C1D36` and `tag` `#F4F5F7` are shared and MUST NOT vary by colourway. Add a comment recording **C4**: these values are asset-local and must never be imported from or exported into `@effy/design-system` (FR-014a).
- [X] T007 Create `packages/brand/src/compositions.mjs` with the 11 profiles from [data-model.md](data-model.md) §3, each declaring `padding`, `background` and `alpha`. Pin `android-fg` and `android-mono` at **≤61.1% occupancy** (rule P1).
- [X] T008 Create `packages/brand/scripts/lib/compose.mjs` — build a wrapper SVG from (mark, colourway, composition). It MUST substitute explicit `width`/`height` for the authored `width="100%" height="100%"` (rule **V1** — some rasterisers resolve 100% to a zero-size surface), recentre the `viewBox` on the content bbox, and optionally bake a background `<rect>`.
- [X] T009 Derive the content bounding box **by measurement, not by hand** (rule **V2**): render the mark at 2000 px, scan the alpha channel, and cache the result. Expected `x 136.0…379.8, y 71.8…414.8` (244.0 × 343.3). A hard-coded bbox silently mis-centres every asset if the artwork is ever redrawn.
- [X] T010 [P] Create `packages/brand/scripts/lib/raster.mjs` wrapping resvg render + the sharp post-steps. For `alpha: strip`, apply `removeAlpha()` **and assert the written PNG is colour-type 2** (rule **T3**) — this is what makes SC-006 provable before submission instead of after rejection.
- [X] T011 [P] Create `packages/brand/scripts/lib/ico.mjs` — the zero-dependency ICO writer (6-byte header + 16-byte directory entry per image + PNG payloads). Verified approach; output must satisfy `file(1)` as a multi-size ICO.
- [X] T012 Create `packages/brand/src/targets.mjs` — the full surface × slot × colourway × composition × outPath matrix from [contracts/asset-manifest.contract.md](contracts/asset-manifest.contract.md) §3. Enforce rule **T4**: no two targets may write the same path.
- [X] T013 Create `packages/brand/scripts/gen-brand-assets.mjs` — the one generator. Writes to a temp dir then moves into place (no partial writes on failure), and emits `assets.manifest.json` **in the same run** (rule M2), sorted by path, 2-space indent, trailing newline (rules M1/M3/M4).
- [X] T014 Create `packages/brand/scripts/check-brand-assets.mjs` — regenerate to temp, compare **sha256 per file**, and on failure list every stale path **with its surface** (SC-008 requires naming which surface). Fail on undeclared files under managed paths (orphan detection). MUST NOT modify the working tree.
- [X] T015 [P] Write `packages/brand/test/composition.test.js` (`node --test`): bbox recentring maths, per-profile occupancy, and an explicit assertion that `android-fg` ≤ 61.1%.
- [X] T016 [P] Write `packages/brand/test/colourway.test.js`: substitution produces the expected hexes; `outline`/`tag` are invariant across colourways (C2); no retired Jade value appears in any colourway (C3).
- [X] T017 [P] Write `packages/brand/test/ico.test.js`: header, directory offsets and payload boundaries of a 3-size ICO.
- [X] T018 [P] Write `packages/brand/test/alpha.test.js`: every `ios-*` composition yields colour-type 2; every `favicon`/`web-icon`/`android-fg`/`android-mono` composition **preserves** alpha (rule P3).

**Checkpoint**: `pnpm --filter @effy/brand test` green. `make brand-gen` produces the full matrix.
Foundation ready — user stories can proceed.

---

## Phase 3: User Story 1 — A customer recognises Effy before the app or page loads (Priority: P1) 🎯 MVP

**Goal**: The Emerald mark on the customer storefront and the customer mobile app, on every brand slot
each platform offers, plus a branded opening screen replacing today's blank white frame.

**Independent test**: Install customer-mobile on clean iOS and Android devices and load the storefront
in desktop and mobile browsers. The mark appears — never clipped — on the home screen, app switcher,
Settings, device search, browser tab, bookmark and installed-PWA entry; both apps show a branded
opening screen rather than a blank one.

### customer-web (Emerald)

- [X] T019 [US1] Delete the stale generator output: `apps/customer-web/app/icon0.svg` (a base64 1000×1000 raster in the **retired** palette, not a vector), `app/icon1.png`, `app/manifest.json`, and the stray `app/favicon copy.ico` (FR-017, research R9).
- [X] T020 [US1] Register customer-web's Emerald targets in `src/targets.mjs` and generate: `app/icon.svg`, `app/apple-icon.png` (180), `app/favicon.ico` (16/32/48), `public/web-app-manifest-192x192.png`, `public/web-app-manifest-512x512.png`.
- [X] T021 [US1] Replace the deleted static manifest with a typed `apps/customer-web/app/manifest.ts`: name "Effy Shopping", short_name "Effy", real Effy `theme_color`/`background_color` (the `#ffffff` placeholders are wrong — R9-2), and icons declaring **both** `"any"` and `"maskable"` purposes. Declaring only `maskable` (as today) makes launchers that expect an unmasked icon show a visibly over-zoomed mark (R9-4).
- [X] T022 [US1] Fix `apps/customer-web/app/layout.tsx`: remove the `next/head` import and its `<Head>` block — `next/head` is a **Pages Router** API and is inert in the App Router, so that `apple-mobile-web-app-title` never renders (R9-1). Express it via `metadata.appleWebApp.title` instead. Preserve both rules in the file's header comment; changing this file is exactly what those warnings are about.
- [X] T023 [US1] Verify `pnpm --filter @effy/customer-web build` succeeds, all commerce routes still report `◐ PPR`, and `pnpm --filter @effy/customer-web size` is **byte-identical** to before (this feature ships no client JS; the 167.3/160 KB overage is pre-existing under 020 and not ours to fix).

### customer-mobile — Android (Emerald)

- [X] T024 [P] [US1] Add `androidx.core:core-splashscreen` 1.0.1 to `apps/customer-mobile/gradle/libs.versions.toml` and `androidApp/build.gradle.kts`.
- [X] T025 [US1] Generate the Android vector layers into `apps/customer-mobile/androidApp/src/main/res/drawable/`: `ic_launcher_foreground.xml` (≤61.1% occupancy), `ic_launcher_background.xml`, `ic_launcher_monochrome.xml`, `ic_splash_logo.xml`. Delete the template `drawable-v24/ic_launcher_foreground.xml` (the Android robot) and the template grid background.
- [X] T026 [US1] Update `res/mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` to reference the new layers and declare a `<monochrome>` element (API 33+ themed icons, FR-007a).
- [X] T027 [P] [US1] Generate legacy raster mipmaps `ic_launcher{,_round}.png` at 48/72/96/144/192 px into `res/mipmap-{m,h,x,xx,xxx}dpi/`. These serve **API 24–25 only**, which predate adaptive icons — `minSdk` is 24, so they cannot be dropped (research R4).
- [X] T028 [US1] Create `res/values/colors.xml` + `res/values/themes.xml` defining `Theme.Effy.Splash` (parent `Theme.SplashScreen`) with `windowSplashScreenBackground`, `windowSplashScreenAnimatedIcon` = `@drawable/ic_splash_logo`, and `postSplashScreenTheme` — the last one is what prevents the colour flash FR-011 forbids.
- [X] T029 [P] [US1] Create `res/values-night/colors.xml` + `res/values-night/themes.xml` for the dark splash ground (FR-013).
- [X] T030 [US1] Point `android:theme` at `@style/Theme.Effy.Splash` in `apps/customer-mobile/androidApp/src/main/AndroidManifest.xml`, replacing `@android:style/Theme.Material.Light.NoActionBar`.
- [X] T031 [US1] Call `installSplashScreen()` in `apps/customer-mobile/androidApp/src/main/kotlin/com/effyshopping/customer/mobile/MainActivity.kt` — **before** `setContent`. Calling it after produces a white flash.

### customer-mobile — iOS (Emerald)

- [X] T032 [US1] Generate the three iOS app icons into `apps/customer-mobile/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset/`: `app-icon-1024.png` (light), `-dark`, `-tinted`. **All three must be colour-type 2 (no alpha)** — an opaque alpha channel is still rejected at App Store Connect (research R3).
- [X] T033 [US1] Update that `AppIcon.appiconset/Contents.json` to attach `filename` to the **already-declared but empty** `dark` and `tinted` appearance entries.
- [X] T034 [P] [US1] Create `Assets.xcassets/LaunchLogo.imageset/` (@1x/@2x/@3x) and `Assets.xcassets/LaunchBackground.colorset/` with a dark variant.
- [X] T035 [US1] Add a `UILaunchScreen` dictionary to `apps/customer-mobile/iosApp/iosApp/Info.plist` referencing `LaunchLogo` and `LaunchBackground`. **In the same change**, set `INFOPLIST_KEY_UILaunchScreen_Generation` to `NO` in `iosApp.xcodeproj/project.pbxproj` (both Debug and Release configs, currently `YES` at lines ~247 and ~275). ⚠ These two conflict — split across changes, launch behaviour differs between clean and incremental builds (research R5).

### US1 verification

- [X] T036 [US1] Build both platforms: `cd apps/customer-mobile && ./gradlew :androidApp:assembleDebug` and the iOS target from Xcode. Run `make mobile-guard` and `pnpm --filter @effy/brand test`.
- [ ] T037 [US1] [OPERATOR] Android device sign-off per [quickstart.md](quickstart.md) §4: home screen + drawer, **all four launcher mask shapes with no clipping** (SC-004), Settings, device search, themed icons on (SC-007b), cold launch shows branded splash with no blank frame (SC-005), dark-mode cold launch uses the dark ground.
- [ ] T038 [US1] [OPERATOR] iOS device sign-off: home screen in light, **dark** and **tinted** appearances (SC-007b), Settings, Spotlight, app switcher, cold launch branded (SC-005).
- [ ] T039 [US1] [OPERATOR] Browser sign-off: storefront tab mark legible in light **and** dark browser themes (SC-007); Add-to-Home-Screen shows a correctly composed, "Effy"-labelled entry (FR-008); DevTools → Application → Manifest resolves all icons with both purposes present.

**Checkpoint**: US1 complete and independently demonstrable — the public-facing surface is branded
end to end. **This is the MVP.**

---

## Phase 4: User Story 2 — A shop worker tells the two Effy apps apart (Priority: P2)

**Goal**: The Blue colourway on both shop surfaces, so an operator with both apps on one device never
opens the wrong one mid-shift.

**Independent test**: Install both customer and shop mobile apps on one device. From arm's length, at
normal icon size, an untrained person names which is which without reading labels.

**Dependency**: Phase 2. Independent of US1's *implementation*, but SC-002/SC-003 can only be judged
once US1's mobile icon exists to compare against.

- [X] T040 [P] [US2] Register shop-web's Blue targets in `src/targets.mjs` and generate into a **new** `apps/shop-web/public/`: `favicon.ico`, `icon.svg`, `apple-touch-icon.png` (180). The directory does not exist today.
- [X] T041 [US2] Add explicit `<link rel="icon">` / `apple-touch-icon` tags to `apps/shop-web/index.html` — Vite injects nothing automatically, so without these the generated files are never referenced.
- [X] T042 [P] [US2] Add `androidx.core:core-splashscreen` 1.0.1 to `apps/shop-mobile/gradle/libs.versions.toml` and `androidApp/build.gradle.kts`.
- [X] T043 [US2] Generate the Blue Android vector layers into `apps/shop-mobile/androidApp/src/main/res/drawable/` and delete the template robot drawables (mirrors T025).
- [X] T044 [US2] Update `apps/shop-mobile/androidApp/src/main/res/mipmap-anydpi-v26/ic_launcher{,_round}.xml` with the new layers plus `<monochrome>` (mirrors T026).
- [X] T045 [P] [US2] Generate Blue legacy mipmaps at five densities into `apps/shop-mobile/androidApp/src/main/res/mipmap-*dpi/` (mirrors T027).
- [X] T046 [US2] Create `values/` + `values-night/` `colors.xml`/`themes.xml` with `Theme.Effy.Splash` for shop-mobile (mirrors T028/T029).
- [X] T047 [US2] Point `android:theme` at `@style/Theme.Effy.Splash` in `apps/shop-mobile/androidApp/src/main/AndroidManifest.xml`.
- [X] T048 [US2] Call `installSplashScreen()` before `setContent` in `apps/shop-mobile/androidApp/src/main/kotlin/com/effyshopping/shop/mobile/MainActivity.kt`.
- [X] T049 [US2] Generate the three Blue iOS icons (no alpha) into `apps/shop-mobile/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset/` and attach filenames in its `Contents.json` (mirrors T032/T033).
- [X] T050 [P] [US2] Create shop-mobile's `LaunchLogo.imageset/` and `LaunchBackground.colorset/` (mirrors T034).
- [X] T051 [US2] Add the `UILaunchScreen` dict to `apps/shop-mobile/iosApp/iosApp/Info.plist` **and** flip `INFOPLIST_KEY_UILaunchScreen_Generation` to `NO` in its `project.pbxproj`, in one change (mirrors T035, same hazard).
- [X] T052 [US2] Build shop-mobile both platforms; run `make mobile-guard`; verify `apps/shop-mobile` unit tests (152 under 020) stay green.
- [ ] T053 [US2] [OPERATOR] Install **both** mobile apps on **one** device. Show the two icons, labels hidden, at normal size, to 10 people: **≥9 must identify the shop app** (SC-002), and **≥9 must say they are the same brand** (SC-003). A self-check is not this test — the point is whether someone who does not already know can tell.
- [ ] T054 [US2] [OPERATOR] Confirm the shop app's splash carries the **Blue** mark, and that the shop-web tab is distinguishable from the storefront tab (FR-016).

**Checkpoint**: Both mobile apps branded and mutually distinguishable; the shop audience has one mark
across its two surfaces.

---

## Phase 5: User Story 3 — Every internal console is identifiable in a browser tab (Priority: P3)

**Goal**: The Neutral colourway on back-office, making all three web surfaces mutually distinguishable.

**Independent test**: Open back-office, shop-web and the storefront as adjacent pinned tabs; all three
are distinguishable from one another.

**Dependency**: Phase 2. Shippable on its own.

- [X] T055 [P] [US3] Register back-office's Neutral targets in `src/targets.mjs` and generate into a **new** `apps/back-office/public/`: `favicon.ico`, `icon.svg`, `apple-touch-icon.png` (180).
- [X] T056 [US3] Add explicit favicon `<link>` tags to `apps/back-office/index.html`.
- [X] T057 [US3] Confirm the Neutral colourway reuses the **same single-colour composition** required by FR-007a for Android themed icons — one composition serving two requirements (FR-016a), not a separately authored mark.
- [X] T058 [US3] Verify `pnpm --filter @effy/back-office build` and `pnpm --filter @effy/shop-web build` succeed and both `dist/` outputs contain the icon files at the root.
- [ ] T059 [US3] [OPERATOR] Open all three web surfaces as adjacent pinned tabs: **≥9/10 observers correctly name which tab is which from the icon alone** (SC-007a). Check each in light **and** dark browser themes (SC-007).

**Checkpoint**: All six surfaces carry a mark (SC-001 satisfied — baseline was 0 of 6).

---

## Phase 6: User Story 4 — The brand cannot silently drift out of sync (Priority: P3)

**Goal**: Make the generator the *only* legitimate producer, and prove the guard fails when it should.

**Independent test**: Change the authored mark without regenerating; the repository's own checks fail
and name the stale surface.

**Dependency**: The generator and check exist from Phase 2; this phase **wires and proves** them. It
is deliberately last because there must be assets to guard.

- [X] T060 [US4] Confirm `@effy/brand`'s `test` script runs `check-brand-assets.mjs`, so `pnpm test` (→ `turbo run test`) fails on drift with no extra wiring. **Note**: `make lint` is Terraform-only in this repo and is NOT the right home for this gate.
- [X] T061 [US4] Prove SC-009: `make brand-gen && git diff --exit-code` → clean. A non-empty diff on unchanged input means the pipeline is not deterministic; stop, because every other guarantee rests on this.
- [X] T062 [US4] Prove SC-008 by **deliberately breaking it** (the 011 lesson — break a guard the way it will actually break): perturb a colourway hex, run `make brand-check`, require a non-zero exit that names the stale paths *and their surfaces*; then revert.
- [X] T063 [US4] Prove orphan detection: drop an undeclared file under a managed asset path, require `make brand-check` to fail, then remove it.
- [X] T064 [P] [US4] Record the **known cross-platform limitation** (research R8) in `packages/brand/README.md`: determinism is proven within a platform (macOS arm64), not across macOS↔Linux; the manifest's `toolchain` block is the first thing to compare when a check fails on someone else's machine; a library version bump is a regeneration event, not a transparent upgrade.

**Checkpoint**: Drift is mechanically impossible to miss.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T065 [P] Update [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) — add a §024 row recording brand-mark parity across customer-web and customer-mobile.
- [X] T066 [P] Update [docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md) — add a §024 row for shop-web and shop-mobile.
- [X] T067 [P] Add a `## Active feature` entry for 024 to `CLAUDE.md` in the established style, recording the three colourways, the mark-only fencing of the blue (FR-014a), and that **no constitution amendment or guard exemption was needed**.
- [X] T068 Run SC-011: `git diff --name-only main | grep -E '^(apis|infra|db)/'` must return nothing — this feature touches no backend, infrastructure or database artifact.
- [X] T069 Run SC-010: `bash scripts/check-no-jade.sh` → OK, **with the guard unchanged and no exemption added**. The guard already scans `*.svg`, so the authored mark is covered.
- [X] T070 Run the full workspace suite: `pnpm -r typecheck`, `pnpm -r test`, `pnpm turbo build`, plus both Gradle builds and `make mobile-guard` (SC-012).
- [X] T071 [OPERATOR] Verify `apps/driver-mobile` is untouched (FR-020) — `git diff --stat apps/driver-mobile` must be empty. This feature brands five surfaces, not six mobile-inclusive; do not let the parity docs imply otherwise.
- [ ] T072 [OPERATOR] Walk the full SC table in [quickstart.md](quickstart.md) §5 and record the result. Anything not live-verified must be written down as a carry-forward, not quietly assumed — the 019/020 precedent.
- [ ] T073 [OPERATOR] Commit the slice, including `packages/brand/src/logo.svg`, all generated assets, and `assets.manifest.json`.

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 Setup
      ↓
Phase 2 Foundational  ← ⚠ BLOCKS EVERYTHING (this is the generator)
      ↓
      ├─→ Phase 3  US1 (P1)  customer-web + customer-mobile   ← MVP
      ├─→ Phase 4  US2 (P2)  shop-web + shop-mobile
      └─→ Phase 5  US3 (P3)  back-office
      ↓
Phase 6 US4  wire + prove the guard   (needs assets to guard)
      ↓
Phase 7 Polish
```

### Story independence

- **US1** — fully independent once Phase 2 lands. Ships alone as a complete MVP.
- **US2** — implementable in parallel with US1; its *acceptance* (SC-002/SC-003) needs US1's icon to
  compare against.
- **US3** — fully independent. The smallest story; could ship first if a quick win is wanted.
- **US4** — depends on assets existing, hence last.

### Parallel opportunities

Within Phase 2: **T010, T011** (different lib files), then **T015–T018** (four independent test files).

Across stories after Phase 2: US1's web half (T019–T023), US2's web half (T040–T041) and all of US3
(T055–T058) touch disjoint surfaces and can proceed simultaneously.

Within US1: **T024** (Gradle) ∥ **T027** (mipmaps) ∥ **T029** (night values) ∥ **T034** (iOS imageset).
Within US2: **T042** ∥ **T045** ∥ **T050**.

Phase 7: **T065, T066, T067** are three different documents.

### Sequential constraints worth naming

- **T009 before T008 is usable** — the bbox must be measured before composition maths is meaningful.
- **T035 and T051 are single atomic changes** — the `Info.plist` dict and the `pbxproj` flag must land
  together or iOS launch behaviour is inconsistent.
- **T031 and T048**: `installSplashScreen()` strictly before `setContent`.
- **T061 before T062** — prove the guard passes clean before proving it fails dirty; otherwise a
  failure tells you nothing.

---

## Implementation Strategy

### MVP (recommended first delivery)

**Phases 1 + 2 + 3 (US1)** — T001–T039. Delivers the entire public-facing brand presence: storefront
favicon and PWA identity, customer mobile icons on both platforms with every appearance variant, and
branded splash screens replacing today's blank frames. This is the only surface a paying customer
sees and the only one facing store review.

### Incremental delivery

1. **Setup + Foundational** (T001–T018) — the generator, proven by its own tests. Nothing user-visible.
2. **+ US1** (T019–T039) → **MVP**, independently shippable.
3. **+ US2** (T040–T054) → shop staff stop opening the wrong app.
4. **+ US3** (T055–T059) → all three web tabs distinguishable; SC-001 reaches 6 of 6.
5. **+ US4** (T060–T064) → drift becomes mechanically impossible to miss.
6. **+ Polish** (T065–T073) → parity docs, full-suite verification, sign-off.

### A faster first win

If a visible result is wanted sooner, **US3 (T055–T059) is the smallest complete story** — three files
after Phase 2, verifiable entirely in a local browser with no device required. It does not change the
recommendation above; US1 is the priority because it is the one with public and store-review exposure.

### Operator-gated tasks

**T001** (supply the vector), **T037/T038** (physical device sign-off), **T039** (browser sign-off),
**T053/T054** (side-by-side observer test), **T059** (three-tab test), **T071/T072/T073**
(scope check, SC walk, commit). Consistent with this project's division of work: Claude writes the
code and the assets; the operator runs anything touching a real device or the repository's history.
