# Implementation Plan: Platform Theme & Design Tokens Refresh

**Branch**: `017-platform-theme-tokens` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-platform-theme-tokens/spec.md`

## Summary

Replace the platform's single Jade accent + neutral surfaces with a **richer forest-green brand
palette** (accent `#26483a`, terracotta `#d0735a`, structured greys, Outfit typography, defined
spacing/radius scales), authored in **both light and dark**, and add a **user-controllable appearance
switcher** (Light / Dark / Follow-System) to every surface. The whole change rides the **existing
single-source-of-truth pipeline** — `packages/design-system/src/tokens.css` is the brand SSOT, from
which the Compose (mobile) theme is **generated and diff-guarded**. This slice edits token *values*,
extends the generator to carry the new roles + type/spacing/radius, tokenizes the **Outfit** typeface,
upgrades the two web appearance mechanisms and the mobile theme to a tri-state persisted mode, and adds
the visible switcher control on all six surfaces. **Presentation-only**: no backend, DB, infra, auth,
layout, or flow change. It requires one **constitution amendment** (Principle V brand constant: Jade →
Effy Forest) as a governance prerequisite.

## Technical Context

**Language/Version**: TypeScript 5.9 / React 19 (web); Kotlin 2.4 / Compose Multiplatform 1.11 (mobile);
Tailwind v4 CSS tokens; Node 22 (token generator). No backend/Go/SQL in this slice.

**Primary Dependencies**: `@effy/design-system` (tokens.css + `gen-compose-theme.mjs` + shadcn UI),
`@effy/web-kit` (`runtime/ui-store.ts` client store, `console/*` chrome), `next-themes` (customer-web),
Compose Material 3 (`EffyTheme.kt`). New: an Outfit web-font source (`@fontsource-variable/outfit` for
the Vite consoles; `next/font/google` Outfit for customer-web) and Outfit `.ttf` bundled into each KMP
app's `commonMain` resources; a multiplatform persisted-setting for the mobile appearance mode.

**Storage**: No server storage. Appearance preference is **local per surface** — web: `localStorage`
(console `ui-store` key `${prefix}.theme`; customer-web via `next-themes`); mobile: a small key/value
settings store (multiplatform-settings) already-or-newly wired in `core/`.

**Testing**: vitest (design-system token guards, `web-kit` ui-store, console user-menu), Playwright
(customer-web appearance E2E), Kotlin `commonTest` (theme-mode resolution unit), and the existing
`tokens:check` diff guard (generator gen + `git diff --exit-code`). Contrast verified by an automated
WCAG check over the token pairs.

**Target Platform**: 3 web surfaces (customer-web Next.js 16 SSR; shop-web + back-office Vite SPAs) and
3 KMP mobile apps (customer/shop built; driver on base template — inherits tokens when built).

**Project Type**: Cross-cutting design-system + client presentation slice (shared packages + six
surfaces). No new project.

**Performance Goals**: Appearance switch applies within one frame with no reload/restart (FR-010);
customer-web keeps its static shell and no flash-of-wrong-theme (next-themes pre-paint script); no
increase in the customer-web guest bundle beyond the swapped font (budget 160 KB, measured ~149.9 KB).

**Constraints**: WCAG 2.1 AA contrast in both appearances (SC-003); zero hardcoded brand values outside
tokens (SC-002); mobile tokens must equal the source (diff guard, SC-007); no-card layout doctrine held
(FR-014); customer-web root layout rules (no `cookies()/headers()` above Suspense; no `aws-amplify`
import) untouched.

**Scale/Scope**: ~40 semantic color tokens × 2 appearances, 1 type family + scale, spacing scale,
radius scale; 2 shared packages + 5 built surfaces edited (+ 1 generated pair regenerated); 1
constitution amendment; 1 CLAUDE.md design-note update.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **II — Shared packages, single source** | ✅ Strengthened. All values stay in `tokens.css` (web) → generated Compose theme (mobile). No per-surface palette; the drift guard is extended, not bypassed. |
| **V — Native-feel, consistent design** | ⚠️ **Requires amendment.** Principle V pins "Brand color is Jade `#0FB57E`; fill `#047857`." This slice **replaces** that constant with Effy Forest `#26483a` + terracotta `#d0735a` + the Outfit/spacing/radius token set. Amendment is the *mechanism* (governance), authored as a task, not a violation. Dark mode stays REQUIRED (now user-selectable). No-card doctrine held: the switcher is a menu item / settings row, never a card. |
| **VI — Layered architecture, unidirectional state, no DI** | ✅ Web appearance mode is *genuine client state* → the TanStack `ui-store` (consoles) / `next-themes` (customer-web); never hand-cached server data. Mobile mode override flows through a ViewModel-exposed state + a persisted setting driver, wired explicitly (no DI framework). |
| **VII — Observability & telemetry** | ➖ Mobile telemetry remains deferred (013/014 pattern). Web MAY emit a PostHog `theme_changed` event via the existing typed taxonomy (optional, non-blocking). No new PII. |
| **I / III / IV** | ➖ N/A — no backend hot/cold path, no auth pools, no data isolation touched. |

**Gate result**: PASS, conditioned on the Principle V amendment being landed as part of this slice
(tracked as T-amend below; recorded in Complexity Tracking as a governance action, not an unjustified
violation).

## Project Structure

### Documentation (this feature)

```text
specs/017-platform-theme-tokens/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (mapping, dark palette, per-surface switcher, fonts)
├── data-model.md        # Phase 1 — the token map (Figma → CSS var → M3 slot), light+dark values, scales
├── quickstart.md        # Phase 1 — how to validate the theme + switcher on all six surfaces
├── contracts/
│   ├── design-tokens.contract.md        # Token names, generator output shape, drift guard
│   └── appearance-preference.contract.md # Tri-state mode, storage keys, default, live-tracking
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/design-system/
├── src/tokens.css                     # ★ full palette rewrite (light + dark) + spacing/radius/font tokens
├── scripts/gen-compose-theme.mjs      # ★ extend: new color roles + radius scale + spacing + font family
├── compose/EffyTokens.kt              # �­ regenerated (customer)  — diff-guarded, DO NOT hand-edit
├── compose-shop/EffyTokens.kt         # �­ regenerated (shop)      — diff-guarded
├── src/fonts/ (or per-app)            # Outfit web-font wiring decision → research
└── package.json                       # description SSOT text (Jade → Forest); tokens:gen/check unchanged

packages/web-kit/
├── src/runtime/ui-store.ts            # ★ Theme "light|dark" → mode "light|dark|system" + matchMedia live-track
├── src/runtime/ui-store.test.ts       # ★ tri-state + system-tracking coverage
├── src/console/ConsoleUserMenu.tsx    # ★ binary toggle → 3-way appearance selector (Light/Dark/System)
└── src/console/ConsoleUserMenu.test.tsx

apps/customer-web/                     # Next.js 16 SSR (customer, public)
├── app/layout.tsx                     # ★ Inter → Outfit (next/font); ThemeProvider already system-capable
├── components/theme-provider.tsx      # ✓ next-themes already defaultTheme=system/enableSystem — add nothing structural
└── components/…/AppearanceControl      # ★ NEW visible, labelled switcher (header/account) — replaces removed hotkey

apps/back-office/  apps/shop-web/       # Vite SPAs
├── src/main.tsx                       # ★ font-sans → Outfit; keep applyTheme wiring
├── src/routes/app.tsx                 # ★ pass mode to ConsoleShell; consume tri-state
└── src/lib/ui-store.ts                # (re-exports web-kit store) — tri-state flows through

apps/customer-mobile/  apps/shop-mobile/  # KMP + Compose
├── shared/…/core/theme/EffyTheme.kt   # ★ darkTheme boolean → mode resolver (Light/Dark/System)
├── shared/…/core/settings/…           # ★ persisted appearance-mode setting (multiplatform-settings)
├── shared/…/core/theme/Typography.kt  # ★ NEW Outfit FontFamily + M3 Typography from the type scale
├── shared/…/composeResources/font/    # ★ Outfit .ttf assets
└── shared/…/features/account/…        # ★ appearance selector row (sectioned, no card)

apps/driver-mobile/                    # base template — NO work; inherits tokens when built

.specify/memory/constitution.md        # ★ Principle V amendment (Jade → Forest); v1.9.0 → v1.10.0
CLAUDE.md                              # ★ § Design system brand line updated (Jade → Forest + token set)
```

**Structure Decision**: No new project or surface. Two shared packages (`design-system`, `web-kit`) are
the leverage points — edit tokens + generator + client store + one console component once, and five
surfaces inherit. Each surface then gets only its **local delta**: load Outfit, render the visible
switcher, and (mobile) resolve + persist the mode. `driver-mobile` is untouched by design.

## Complexity Tracking

*Only governance/deviation items that must be justified.*

| Item | Why needed | Simpler alternative rejected because |
|------|------------|--------------------------------------|
| **Constitution amendment (Principle V brand constant)** | The operator confirmed Jade is retired and replaced by Effy Forest `#26483a`; the constitution currently hard-codes Jade, so shipping without amending would put the repo out of compliance (spec FR-016). | *Keeping Jade as a hidden alias* rejected — the palette contains no Jade and the intent is a full rebrand; a stale constant would mislead every future slice. |
| **Two web appearance mechanisms** (`next-themes` for customer-web vs `web-kit` `ui-store` for Vite consoles) | Next.js SSR needs a pre-paint inline script to avoid flash-of-wrong-theme (next-themes provides it); the Vite SPAs have no SSR and already own a TanStack client store. **Both toggle the same `.dark` class from the same `tokens.css`** — the SSOT is single; only the *mode-selection plumbing* differs by framework. | *Forcing one mechanism* rejected — porting next-themes into SPAs adds a dependency for no gain; porting the store into Next SSR reintroduces the hydration-flash next-themes exists to solve. The token source stays single, so this is not a second source of truth. |
| **Mobile M3-not-HIG chrome** (inherited from 013/014) | Unchanged by this slice; recorded here only for continuity. | — |
