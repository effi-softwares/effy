---

description: "Task list for 041-monochrome-console-redesign"
---

# Tasks: Monochrome Consoles & Shop Mobile — Unified Dashboard Identity

**Input**: Design documents from `/specs/041-monochrome-console-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No TDD test files are requested. Verification is via the platform's existing guards
(`check-tokens.mjs` AA gate, `tokens:check` compose drift, `check-no-emerald`/`check-no-jade`,
vitest suites, mobile compile) plus one required guard **code change** (the `ring` row, research R3).

**Organization**: By user story (P1 shop-web, P2 back-office, P3 shop-mobile), on a shared
foundation (the token SSOT + the shared web console foundation).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task → parallelizable
- **[Story]**: US1 = shop-web, US2 = back-office, US3 = shop-mobile
- ⚙️ **OPERATOR**: a step the user runs (device builds, `/speckit-constitution`, commit) per CLAUDE.md mode-of-work

## Path Conventions

Monorepo: shared packages under `packages/`, apps under `apps/`. Real paths used throughout.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: pull in the one missing dependency and scaffold the reference source to adapt.

- [x] T001 Add `recharts` as a dependency of `@effy/design-system` in `packages/design-system/package.json` and install (`pnpm install`).
- [x] T002 [P] Scaffold the shadcn reference source to adapt (do NOT commit into an app): run `pnpx shadcn@latest add chart` and `pnpx shadcn@latest add dashboard-01` in a scratch/throwaway location, to read the `chart`, `app-sidebar`, `site-header`, `section-cards`, `chart-area-interactive`, and `data-table` implementations as the basis for the shared versions.

**Checkpoint**: dependency present; reference code available to adapt.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the governance change + the token SSOT + the shared web foundation. **Blocks all user
stories.** US3 (mobile) needs only T003–T011 (the token subset); US1/US2 additionally need T012–T014.

**⚠️ CRITICAL**: no user-story work begins until the relevant foundational tasks are complete.

### Governance + token SSOT

- [x] T003 ⚙️ OPERATOR — Amend the constitution via `/speckit-constitution` (research R8): permit the five `--chart-1..5` hues **bounded to data-visualisation only**, the operator-directed card/chart dashboard layout for the **internal consoles only**, and the `0.625rem` `--radius` base; explicitly KEEP the WCAG AA (zero-exemption) and retired-hue invariants, and the web↔mobile radius parity. Update `.specify/memory/constitution.md` (expect a MINOR bump).
- [x] T004 Convert the pasted `oklch()` values to `#rrggbb` hex (lossless) and replace the overlapping role colours in **both** appearance blocks of `packages/design-system/src/tokens.css`: `background, foreground, card(+fg), popover(+fg), primary(+fg), secondary(+fg), muted, accent(+fg), destructive, border, input`, and all eight `sidebar-*` roles (data-model §1). Do NOT touch the retained platform tokens.
- [x] T005 Add `--chart-1..5` (hex-converted) to **both** `:root` and `.dark` in `packages/design-system/src/tokens.css` (data-model §2). No `-foreground` pair for any chart token.
- [x] T006 Retain the platform-only tokens unchanged in `packages/design-system/src/tokens.css` — `--success`, `--disabled`, `--disabled-foreground`, `--placeholder`, `--font-sans` (General Sans), the `@theme inline` mapping — and set `--radius: 0.625rem` while keeping `--radius-sm: 0.5rem` / `--radius-md: 1rem` / `--radius-lg` / `--radius-xl` pinned (research R4).
- [x] T007 AA-tune the two failing pairs in `packages/design-system/src/tokens.css` to the nearest passing value, each with a recorded ratio comment alongside the existing three tunings: `--muted-foreground` on `--muted` (light) → ≥ 4.5:1; `--ring` per T008 (research R3 table).
- [x] T008 Apply the ring sub-decision (research R3, recommended option **b**) in `packages/design-system/scripts/check-tokens.mjs`: change the `["ring", "background", TEXT]` PAIR to the WCAG 1.4.11 UI bar (`UI` = 3:1) with a comment explaining a focus ring is a non-text UI component, then set `--ring` (both appearances) in `tokens.css` to the lightest pasted-adjacent grey that clears 3:1. *(If the operator prefers option a, instead keep `--ring` = the accent and leave the guard row at TEXT.)*
- [x] T009 Extend `packages/design-system/scripts/check-tokens.mjs` to assert `--chart-1..5` exist in both appearances and that **none** has a `-foreground` pair (add to `SEMANTIC_NON_TEXT`-style coverage), so the chart tokens can never become text-on-fill.
- [x] T010 Update the header comment block of `packages/design-system/src/tokens.css` to describe the adopted identity (supersedes the "MONOCHROME, no chart hues" narrative) and cite constitution + feature 041; keep the inversion/AA/radius-parity notes.
- [x] T011 Run the token gates and fix until green: `pnpm --filter @effy/design-system test` (AA gate), `pnpm --filter @effy/design-system tokens:gen && tokens:check` (regenerates `compose-shop/`, `compose/`, `compose-driver/` and proves no drift), `scripts/check-no-emerald.sh`, `scripts/check-no-jade.sh`.

### Shared web console foundation (blocks US1 + US2)

- [x] T012 [P] Add the shared chart primitive at `packages/design-system/src/ui/chart.tsx` (recharts wrapper adapted from T002), export it from `packages/design-system/src/ui/index.ts`. It consumes `--chart-1..5` via CSS vars — no hardcoded colours.
- [x] T013 Rebuild `packages/web-kit/src/console/ConsoleShell.tsx` to the `dashboard-01` shell shape (app-sidebar composing `ConsoleBrand`/`NavList`/`ConsoleUserMenu`, a `site-header`, `SidebarInset` main region), keeping the existing generic `TRole` prop API and controlled `sidebarOpen` so both consoles reuse it unchanged (console-shell contract C1). Adjust `ConsoleHeader`/`ConsoleBrand` as needed.
- [x] T014 Add a shared dashboard-overview scaffold at `packages/web-kit/src/console/DashboardOverview.tsx` (section-cards row + `chart` + data-table slot, all prop-fed) and export it from `packages/web-kit/src/console/index.ts` (console-shell contract C2). Card layout is the recorded Principle V exception (plan).

**Checkpoint**: tokens adopted + AA green + compose regenerated; shared shell, chart primitive, and
overview scaffold ready. US3 unblocked after T011; US1/US2 unblocked after T014.

---

## Phase 3: User Story 1 — Shop operator works in the new monochrome dashboard console (Priority: P1) 🎯 MVP

**Goal**: every shop-web screen renders in the dashboard structure + adopted monochrome identity, behaviour unchanged.

**Independent Test**: sign in, walk sign-in · overview · catalog · orders/fulfillment · shop-identity; each is in the new shell, monochrome-only (+ two semantic + chart hues), light & dark, no legacy accent.

- [x] T015 [US1] Wire `apps/shop-web/src/routes/app.tsx` to the rebuilt `ConsoleShell` (unchanged nav/roles/brand props).
- [x] T016 [US1] Build the shop-web overview landing using the shared `DashboardOverview`, fed shop-web's own data (fulfillment/catalog counts) or clearly-marked bounded placeholder data where none exists (console-shell contract C2).
- [x] T017 [P] [US1] Re-skin/verify `apps/shop-web/src/features/catalog/**` inside the new shell — token-only colours, existing table/list/detail layouts and behaviour unchanged (FR-018).
- [x] T018 [P] [US1] Re-skin/verify `apps/shop-web/src/features/fulfillment/**` (orders) inside the new shell — behaviour unchanged.
- [x] T019 [P] [US1] Re-skin/verify `apps/shop-web/src/features/shop-identity/**` and `apps/shop-web/src/features/auth/**` (sign-in) — monochrome identity, both appearances.
- [x] T020 [US1] Sweep `apps/shop-web/src/**` for any hardcoded non-token colour / residual legacy accent; replace with design-system tokens. Confirm `apps/shop-web/src/theme-tokens.test.ts` still passes (update it if it pins old values).
- [x] T021 [US1] Verify shop-web: `make shop-lint && make shop-test`, build + bundle/gate within budget, and a manual light/dark walk of every screen; colour audit shows only ramp + two semantic + chart hues (SC-007).

**Checkpoint**: shop-web fully functional in the new identity — the MVP.

---

## Phase 4: User Story 2 — Back-office admin works in the same structure and identity (Priority: P2)

**Goal**: every back-office area renders in the same shell + identity; the two consoles read as one system.

**Independent Test**: sign in, walk sign-in · overview · shops · staff · catalog-schema · promotions · deliverability; each is in the shared shell, monochrome-only, light & dark.

- [x] T022 [US2] Wire `apps/back-office/src/routes/app.tsx` to the rebuilt `ConsoleShell`.
- [x] T023 [US2] Build the back-office overview landing using the shared `DashboardOverview`, fed back-office data or bounded placeholder.
- [x] T024 [P] [US2] Re-skin/verify `apps/back-office/src/features/shops/**` and `apps/back-office/src/features/staff-identity/**` inside the shell — behaviour unchanged.
- [x] T025 [P] [US2] Re-skin/verify `apps/back-office/src/features/catalog-schema/**` and `apps/back-office/src/features/promotions/**` — behaviour unchanged.
- [x] T026 [P] [US2] Re-skin/verify `apps/back-office/src/features/deliverability/**` and `apps/back-office/src/features/auth/**` — monochrome identity, both appearances.
- [x] T027 [US2] Sweep `apps/back-office/src/**` for hardcoded non-token colour / residual legacy accent; replace with tokens. Confirm/adjust `apps/back-office/src/theme-tokens.test.ts`.
- [x] T028 [US2] Verify back-office: `make bo-lint && make bo-test`, build + bundle/gate, light/dark walk, colour audit; then a **side-by-side** check of shop-web + back-office + the customer app reading as one system (SC-003).

**Checkpoint**: both consoles work independently and look like one product.

---

## Phase 5: User Story 3 — Shop mobile operator sees the monochrome identity (Priority: P3)

**Goal**: every existing shop-mobile screen renders in the monochrome identity; navigation/flows unchanged.

**Independent Test**: open shop-mobile, walk existing screens in light & dark; identity matches the customer app; structure/flows unchanged; no chart hue present.

- [x] T029 [US3] Confirm `apps/shop-mobile` consumes the regenerated `packages/design-system/compose-shop/EffyTokens.kt` (from T011) via its `EffyTheme`; no app-local colour overrides shadow it.
- [x] T030 [US3] Sweep `apps/shop-mobile/**` for hardcoded colours / residual legacy accent (incl. `androidApp/src/main/res/values/colors.xml`); replace with theme tokens. No structural/navigation change (FR-015).
- [ ] T031 [US3] Verify shop-mobile (non-device): `make sm-tokens-check && make sm-guard`, `:shared:compileAndroidMain`, `:shared:compileKotlinIosSimulatorArm64`, `:shared:testAndroidHostTest`, `:shared:iosSimulatorArm64Test`, `:androidApp:assembleDebug`.
- [ ] T032 [US3] ⚙️ OPERATOR — Run shop-mobile on Android **and** iOS; walk existing screens in Light/Dark/Follow-System; confirm identity matches the customer app and flows are unchanged.

**Checkpoint**: all three surfaces on the unified identity.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T033 [P] Validate SC-006 (already-monochrome surfaces): `make cm-tokens-check`; `make cw-build && make cw-size`; diff resolved per-role hex before/after and confirm no perceptible ramp shift and no new off-identity colour on customer-web, customer-mobile, driver-mobile.
- [x] T034 [P] Update the parity register `docs/audiences/shop-capabilities.md` (and `docs/audiences/customer-capabilities.md` if the token note belongs there) with a §041 entry.
- [x] T035 [P] Update `CLAUDE.md` § Design system + § Current status/Active feature to reflect the adopted identity (chart hues bounded to data-viz; consoles on the dashboard structure).
- [x] T036 Run the full workspace sweep: `pnpm -r typecheck && pnpm -r test`; fix any fallout.
- [x] T037 Run the full `quickstart.md` validation (§1–§6) and record results in `specs/041-monochrome-console-redesign/SIGNOFF.md`.
- [ ] T038 ⚙️ OPERATOR — Commit the feature (tokens, guards, shared foundation, both consoles, shop-mobile theme, regenerated compose artifacts, docs) once T003 amendment + all gates are green.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no dependencies.
- **Foundational (P2)**: after Setup. T003 (amendment) should land first or alongside T004–T010; **T011 gates the whole token change**. T012–T014 (shared web foundation) after the primitives/tokens exist.
- **US1 (P3)**: after T014.
- **US2 (P4)**: after T014 (reuses the same shell/overview T13/T14 built for US1; no dependency on US1's app code).
- **US3 (P5)**: after **T011 only** (needs the regenerated compose theme, not the web foundation) — can run in parallel with US1/US2.
- **Polish (P6)**: after the stories being shipped are done. T038 last.

### Within a story

- Wire shell → build overview → re-skin feature areas → sweep for stray colours → verify.

### Parallel opportunities

- T012 ∥ T013/T014 groundwork (different files).
- US1 feature re-skins T017 ∥ T018 ∥ T019; US2 T024 ∥ T025 ∥ T026 (different feature dirs).
- **US3 can run fully in parallel with US1 and US2** once T011 is green.
- Polish T033 ∥ T034 ∥ T035.

---

## Parallel Example: User Story 1

```bash
# After T015/T016, re-skin the three feature areas in parallel (different directories):
Task: "Re-skin apps/shop-web/src/features/catalog/** inside the new shell"      # T017
Task: "Re-skin apps/shop-web/src/features/fulfillment/** inside the new shell"  # T018
Task: "Re-skin apps/shop-web/src/features/shop-identity + auth"                 # T019
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Setup → Foundational (T003–T014, all gates green).
2. US1 (shop-web) → **stop and validate** with `make shop-lint && make shop-test` + a light/dark walk.
3. Demo the shop console in the new identity.

### Incremental delivery

1. Foundation ready (tokens adopted, AA green, shared shell + chart + overview).
2. US1 shop-web → validate → demo (MVP).
3. US2 back-office → validate → side-by-side SC-003 → demo.
4. US3 shop-mobile (parallelizable from T011) → validate → operator device walk.
5. Polish → SC-006 equivalence → full sweep → sign-off → commit.

---

## Notes

- ⚙️ OPERATOR tasks (T003 amendment, T032 device walk, T038 commit) are run by the user per CLAUDE.md mode-of-work; Claude authors everything they need first.
- The **AA invariant is preserved, not relaxed** — T007/T008/T009 keep `check-tokens.mjs` green; only the chart hues + card layout + radius base are the amended relaxations (T003).
- No backend/DB/infra/auth change anywhere (FR-018): if a task tempts a behaviour change, stop — it is out of scope.
- Commit after each logical group; keep regenerated `compose*/` artifacts in the same commit as the `tokens.css` change that produced them.
