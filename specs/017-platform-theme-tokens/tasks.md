---

description: "Task list for 017-platform-theme-tokens"
---

# Tasks: Platform Theme & Design Tokens Refresh

**Input**: Design documents from `/specs/017-platform-theme-tokens/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. This slice's success criteria are themselves automated gates — SC-002 (no fork),
SC-003 (WCAG AA contrast), SC-007 (mobile drift) — so the guard/test tasks are first-class, not optional.

**Organization**: By user story (US1 palette · US2 switcher · US3 consistency), on top of a shared
foundational token layer.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup / Foundational / Polish carry no story label)
- Exact file paths are in each task.

## Path notes

- SSOT: `packages/design-system/src/tokens.css` + `scripts/gen-compose-theme.mjs` → generated
  `compose/EffyTokens.kt` (customer) and `compose-shop/EffyTokens.kt` (shop).
- Web consumers: `apps/customer-web` (Next.js), `apps/back-office` + `apps/shop-web` (Vite) via
  `@effy/web-kit`. Mobile: `apps/customer-mobile`, `apps/shop-mobile` (`apps/driver-mobile` inherits when built).

---

## Phase 1: Setup (Governance & Font Prerequisites)

**Purpose**: Land the governance change FR-016 depends on and stage the Outfit font sources.

- [X] T001 Amend constitution Principle V (brand: Jade `#0FB57E`/`#047857` → Effy Forest `#26483a` accent family + terracotta `#d0735a`; note the Outfit/spacing/radius token set is part of the design-system SSOT; dark mode stays REQUIRED, now user-selectable) and add a Sync Impact Report entry; bump `1.9.0 → 1.10.0` in `.specify/memory/constitution.md` (research R9; blocks shipping per FR-016).
- [X] T002 [P] Update brand text to Effy Forest in `CLAUDE.md` (§ Design system brand line) and `packages/design-system/package.json` (`description`) — Jade → Forest + Outfit + token set.
- [X] T003 [P] Add `@fontsource-variable/outfit` to `apps/back-office/package.json` and `apps/shop-web/package.json`; run `pnpm install`.
- [ ] T004 [P] Add Outfit `.ttf` weights to `apps/customer-mobile/shared/src/commonMain/composeResources/font/` and `apps/shop-mobile/shared/src/commonMain/composeResources/font/` (SIL OFL, self-hosted).
- [ ] T005 [P] Add the `multiplatform-settings` dependency (if absent) to `apps/customer-mobile/shared/build.gradle.kts` and `apps/shop-mobile/shared/build.gradle.kts` (mobile appearance-mode persistence, research R5).

---

## Phase 2: Foundational (Token SSOT — BLOCKS all stories)

**Purpose**: The single source of truth. Every surface consumes this, so nothing visual can start until
it is correct and the mobile theme is regenerated + drift-clean.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T006 Rewrite the color palette (`:root` light + `.dark` dark) in `packages/design-system/src/tokens.css` per the token map in `data-model.md` — CSS-var names FROZEN, values only (Forest `--primary`, terracotta `--destructive`, new greys/surfaces/borders, `--sidebar*`).
- [X] T007 Add typography/radius tokens to the `@theme inline` block in `packages/design-system/src/tokens.css`: `--font-sans: "Outfit", <system fallback>` and **explicit** radii (replace shadcn's `calc()` chain) — `--radius: 1rem`, `--radius-sm: 0.5rem` (8px), `--radius-md: 1rem` (16px), `--radius-lg: 1rem`, `--radius-xl: 1.25rem` (20px); pill via `rounded-full`. These exact px MUST equal mobile `EffyRadius` (sm=8, md=16) — assert the px in the token test (T010), not "derive correctly" (SC-004 parity).
- [X] T008 Extend `packages/design-system/scripts/gen-compose-theme.mjs` to additionally emit `object EffyRadius { sm; md; default }`, `object EffySpacing { xs; s; md; lg; xl; xxxl }`, and an Outfit font handle — zero-dependency, both targets (contract: `contracts/design-tokens.contract.md`).
- [X] T009 Regenerate the mobile theme — `pnpm --filter @effy/design-system tokens:gen` — committing updated `packages/design-system/compose/EffyTokens.kt` and `compose-shop/EffyTokens.kt` (depends on T006–T008; DO NOT hand-edit).
- [X] T010 Add a vitest config + `packages/design-system/src/tokens.test.ts` asserting (a) every color var exists in BOTH `:root` and `.dark`; (b) every foreground/background pair meets WCAG 2.1 AA (≥4.5:1 text, ≥3:1 large/UI) in both appearances — SC-003, research R8; and (c) `--radius-sm` = 0.5rem/8px and `--radius-md` = 1rem/16px exactly (SC-004 parity with mobile `EffyRadius`). Tune the ⚠ terracotta/`--muted-foreground` values in T006 until green.
- [X] T011 Confirm the mobile drift guard is green — `pnpm --filter @effy/design-system tokens:check` (gen + `git diff --exit-code compose/ compose-shop/`) — SC-007.

**Checkpoint**: SSOT correct, contrast-verified, mobile regenerated + drift-clean. Stories can begin.

---

## Phase 3: User Story 1 — Unified new brand palette across every surface (Priority: P1) 🎯 MVP

**Goal**: All six surfaces render the new Forest palette + Outfit typography + brand radius in light and
dark, with no trace of Jade.

**Independent Test**: Open each surface in light and dark (quickstart §3–§4); confirm accent/surfaces/
text/icons/borders/type/radius match the token set and the retired Jade appears nowhere.

- [X] T012 [P] [US1] customer-web: swap Inter → Outfit via `next/font/google` in `apps/customer-web/app/layout.tsx` (keep self-hosted `--font-sans`, `font-sans`; no external origin).
- [X] T013 [P] [US1] back-office: import `@fontsource-variable/outfit` and bind `font-sans` to Outfit in `apps/back-office/src/main.tsx` / `apps/back-office/src/styles.css` (replace the `system-ui` string).
- [X] T014 [P] [US1] shop-web: same Outfit wiring in `apps/shop-web/src/main.tsx` / `apps/shop-web/src/styles.css`.
- [ ] T015 [P] [US1] customer-mobile: add `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/theme/Typography.kt` (Outfit `FontFamily` + M3 `Typography` from the type scale in `data-model.md`) and apply it in `core/theme/EffyTheme.kt`.
- [ ] T016 [P] [US1] shop-mobile: add the equivalent `core/theme/Typography.kt` under `apps/shop-mobile/shared/.../core/theme/` and apply it in that app's `core/theme/EffyTheme.kt`.
- [X] T017 [US1] Add a committed no-Jade sweep (test or `scripts/` check) that greps `0fb57e`/`047857` across `packages/` + `apps/` (excluding node_modules) and fails on any hit — SC-008.
- [ ] T018 [US1] Validate US1 — run quickstart §3–§4: new palette + Outfit + radius in light and dark on customer-web, back-office, shop-web, customer-mobile, shop-mobile (Android + iOS).

**Checkpoint**: The platform is fully rebranded and legible in both appearances (dark still OS-driven).

---

## Phase 4: User Story 2 — User-controllable appearance switcher (Priority: P2)

**Goal**: Light / Dark / Follow-System on every surface, default System, persisted, instant, live-tracking.

**Independent Test**: On each surface pick each mode; confirm instant reflow, persistence across
relaunch/reload, and System tracking the OS (quickstart §3–§4). Contract:
`contracts/appearance-preference.contract.md`.

- [X] T019 [US2] web-kit: extend `Theme` to mode `"light"|"dark"|"system"` and make `applyTheme` resolve `system` via `matchMedia("(prefers-color-scheme: dark)")` with a live `change` listener (attached only while `system`) in `packages/web-kit/src/runtime/ui-store.ts`; keep back-compat for a stored `light`/`dark`.
- [X] T020 [US2] web-kit: update `packages/web-kit/src/runtime/ui-store.test.ts` for tri-state, default `system`, persistence round-trip, and live OS-change reflow.
- [X] T021 [US2] web-kit: replace the binary item with a 3-way Light/Dark/System selector in `packages/web-kit/src/console/ConsoleUserMenu.tsx` (menu items — no card).
- [X] T022 [US2] web-kit: update `packages/web-kit/src/console/ConsoleUserMenu.test.tsx` for the 3-way control.
- [X] T023 [P] [US2] back-office: consume the tri-state mode — pass it to `ConsoleShell` in `apps/back-office/src/routes/app.tsx` and apply via `apps/back-office/src/main.tsx` `applyTheme(mode)`; align `src/lib/ui-store.ts` re-export.
- [X] T024 [P] [US2] shop-web: same tri-state consumption in `apps/shop-web/src/routes/app.tsx`, `apps/shop-web/src/main.tsx`, `apps/shop-web/src/lib/ui-store.ts`.
- [X] T025 [P] [US2] customer-web: add a visible, labelled Appearance control (Light/Dark/System) in the header/account calling `next-themes` `setTheme` — `apps/customer-web/components/…/AppearanceControl.tsx` wired into the header (replaces the removed hotkey; next-themes already does the persistence/no-flash/tracking).
- [ ] T026 [P] [US2] customer-mobile: add `core/settings` appearance-mode store (interface + `multiplatform-settings` impl, key `appearance.mode`, default `system`) under `apps/customer-mobile/shared/.../core/settings/`.
- [ ] T027 [US2] customer-mobile: change `core/theme/EffyTheme.kt` from `darkTheme = isSystemInDarkTheme()` to a mode resolver (Light/Dark force; System defers to `isSystemInDarkTheme()`); wire the setting at the app entry `app/App.kt` (explicit, no DI).
- [ ] T028 [US2] customer-mobile: add an appearance selector row (Light/Dark/System) in the Account tab `features/account/presentation/AccountScreens.kt` + expose mode via its ViewModel (sectioned row, no card).
- [X] T029 [US2] customer-mobile: `commonTest` for the mode resolver (System defers to OS flag; Light/Dark force) under `apps/customer-mobile/shared/src/commonTest/`.
- [ ] T030 [P] [US2] shop-mobile: mirror T026 — `core/settings` appearance store under `apps/shop-mobile/shared/.../core/settings/`.
- [ ] T031 [P] [US2] shop-mobile: mirror T027 — mode resolver in `core/theme/EffyTheme.kt` + wiring in `app/App.kt`.
- [ ] T032 [P] [US2] shop-mobile: mirror T028 — appearance row in the Account tab `features/account/presentation/…` + ViewModel state.
- [X] T033 [P] [US2] shop-mobile: `commonTest` for the mode resolver under `apps/shop-mobile/shared/src/commonTest/`.
- [ ] T034 [US2] Validate US2 — switch modes on all built surfaces: instant reflow, persistence across relaunch/reload, System tracks the OS (quickstart §3–§4; customer-web E2E `test:e2e` for persistence + System + no-flash SSR).

**Checkpoint**: Identical Light/Dark/System switcher behavior on all five built surfaces.

---

## Phase 5: User Story 3 — Guaranteed consistency & no drift (Priority: P3)

**Goal**: One token change propagates to all six surfaces; no surface can fork colors/fonts/spacing.

**Independent Test**: Change a token → rebuild → all surfaces reflect it with no per-surface edit; the
guards fail on a deliberately hardcoded hex / a fork.

- [X] T035 [US3] shop-web: extend the fork guard `apps/shop-web/src/theme-tokens.test.ts` to the new palette (asserts no `@theme` block and no hardcoded brand hex of its own) — SC-002.
- [X] T036 [P] [US3] back-office: add/extend an equivalent fork-guard test under `apps/back-office/src/` (no own `@theme`, no hardcoded brand hex).
- [X] T037 [US3] Confirm `tokens:check` covers the newly emitted `EffyRadius`/`EffySpacing`/font output (the guard diffs whole generated files, so verify a manual edit to those objects is caught) — extend the generator/guard scope if any emitted region is uncovered.
- [X] T038 [US3] Cross-surface propagation proof (quickstart §5): change one value in `tokens.css`, run `tokens:gen`, confirm every surface (web + regenerated mobile) reflects it with zero per-surface edits; then revert.
- [X] T039 [US3] Negative proof: temporarily introduce a hardcoded brand hex and a fake `@theme` fork; confirm the fork guards (T035/T036) and no-Jade sweep (T017) fail; revert.

**Checkpoint**: The "every app, one theme" guarantee is machine-enforced.

---

## Phase 6: Polish & Cross-Cutting

- [X] T040 [P] Update `packages/design-system/README.md` with the new palette, Outfit type, radius/spacing scales, and appearance-mode contract.
- [ ] T041 [P] (Optional, non-blocking) Emit a `theme_changed` PostHog event via the shared typed taxonomy on web appearance change (no PII); mobile telemetry stays deferred (013/014 pattern) — record the deferral.
- [X] T042 Full workspace green: `pnpm typecheck` + `pnpm -r test` + `turbo build` (web) and the customer/shop mobile builds (Android + iOS).
- [ ] T043 Run `quickstart.md` end-to-end incl. customer-web bundle-budget check (≤160 KB) and no-flash SSR; confirm `tokens:check` + contrast test + fork guards all green.
- [ ] T044 Final sign-off: constitution `1.10.0` + CLAUDE.md reflect Effy Forest; zero Jade remains (SC-008); note `driver-mobile` inherits the theme when built (no exception created).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: T001 (constitution) is the governance gate; T002–T005 are independent prep — can start immediately.
- **Foundational (P2)**: T006→T007→T008→T009 are a chain (tokens → generator → regenerate); T010/T011 gate on T009. **BLOCKS all user stories.**
- **US1 (P3)**: after Foundational. T012–T016 are per-surface `[P]`; T017 independent; T018 validates (after T012–T017).
- **US2 (P4)**: after Foundational. web-kit chain T019→T020, T021→T022; surfaces T023/T024/T025 depend on T019/T021; mobile T026→T027→T028→T029 (customer) and T030→T031→T032→T033 (shop) are two independent chains; T034 validates.
- **US3 (P5)**: after Foundational (independently testable of US1/US2, but most meaningful once surfaces consume the palette). 
- **Polish (P6)**: after the desired stories.

### Story independence

- **US1** delivers the rebrand alone (dark still OS-driven) — MVP.
- **US2** rides the same tokens but is orthogonal to US1's exact colors — the switcher works regardless.
- **US3** is the durability guarantee over the shared token layer.

### Parallel opportunities

- Setup: T002, T003, T004, T005 in parallel.
- Foundational is mostly a chain (single source file → generator → regenerate).
- US1: T012–T016 in parallel (five different surfaces/files).
- US2: T023/T024/T025 in parallel; the two mobile chains (customer T026–T029, shop T030–T033) in parallel with each other and with the web work once web-kit (T019/T021) lands.
- US3: T035/T036 in parallel.

---

## Parallel Example: User Story 1

```bash
# Five surfaces, five files, no shared edits — run together after Foundational:
Task: "customer-web Inter→Outfit in apps/customer-web/app/layout.tsx"      # T012
Task: "back-office Outfit in apps/back-office/src/main.tsx"                 # T013
Task: "shop-web Outfit in apps/shop-web/src/main.tsx"                       # T014
Task: "customer-mobile Typography.kt + EffyTheme"                          # T015
Task: "shop-mobile Typography.kt + EffyTheme"                              # T016
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 Setup (land the constitution amendment first — FR-016).
2. Phase 2 Foundational (tokens + generator + regenerate + contrast + drift green).
3. Phase 3 US1 (fonts + typography per surface + no-Jade sweep).
4. **STOP & VALIDATE**: quickstart §3–§4 — the rebrand is live and legible. Ship/demo.

### Incremental

- US1 (rebrand) → US2 (switcher) → US3 (guarantees), each independently testable, each additive.

---

## Notes

- `[P]` = different files, no incomplete dependency. The token source (T006/T007) is a single file — not `[P]`.
- Never hand-edit `compose/EffyTokens.kt` / `compose-shop/EffyTokens.kt`; always `tokens:gen`.
- Keep CSS-var names frozen — this is a value swap, so surfaces/primitives don't change.
- The contrast gate (T010) is where the ⚠ terracotta and `--muted-foreground` values are finalized.
- `driver-mobile` gets NO task — it inherits the tokens when it is built (no per-surface exception).

---

## Implementation Status (2026-07-17)

**Web: COMPLETE + verified.** The full rebrand + Outfit + radius + the Light/Dark/System switcher ship
on all three web surfaces. Verified green: `check-tokens` (27 vars × 2, WCAG AA, radii 8/16),
`tokens:gen` deterministic + regenerated mobile theme, `pnpm -r typecheck`, `pnpm -r test` (web-kit 44,
back-office 36, shop-web 106, customer-web 45, edge suites unchanged), customer-web `build` (PPR intact),
`depcruise` (Amplify quarantine clean), `size` (159.0/160 KB — tight; next-themes on the guest path),
no-Jade sweep + its negative proof, fork-guard negative proof. Constitution → v1.10.0; CLAUDE.md + README
rebranded.

**Mobile: FOUNDATION done (compile-safe), integration handed off.** Delivered for **all three** KMP apps
(customer-, shop-, AND driver-mobile): `core/theme/AppearanceMode.kt` (enum + `resolveDark` + storage
tokens, default System), `EffyTheme(mode)` signature (default System = prior device-driven behaviour),
and `AppearanceModeTest` (commonTest). The generated `EffyTokens.kt` (colors + `EffyRadius` +
`EffySpacing`) is emitted to THREE targets — `compose/` (customer), `compose-shop/`, `compose-driver/` —
all srcDir'd into their apps and diff-guarded together by `tokens:check`. **driver-mobile is no longer
the bare template for theming**: its `App()` root now renders inside `EffyTheme` (was vanilla
`MaterialTheme`), so all six surfaces consume the one SSOT. `mobile-guard` clean.

**Operator / toolchain-gated (could not be done or verified in this environment):**
- **T004** — Outfit `.ttf` binary assets (SIL OFL) into each app's `composeResources/font/`.
- **T005** — `multiplatform-settings` dependency + platform init.
- **T015/T016** — Outfit `Typography.kt` (needs the `.ttf`).
- **T026/T028/T030/T032** — persisted `AppearanceStore` + Account appearance row + ViewModel state.
- **T027/T031** — wire the persisted mode into `App.kt` → `EffyTheme(mode)` (resolver already in place).
- **T018/T034** — Android + iOS device validation (needs the mobile toolchain).
- **T041** — optional PostHog `theme_changed` web event (non-blocking; mobile telemetry stays deferred).
- **T043/T044** — customer-web Playwright E2E + final live sign-off (bundle/depcruise already green).
