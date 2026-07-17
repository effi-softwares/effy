# Research: Platform Theme & Design Tokens Refresh

Phase 0 decisions. Each resolves an unknown from the plan's Technical Context. Format: Decision /
Rationale / Alternatives.

## R1 — How the theme reaches all six surfaces (the mechanism already exists)

**Decision**: Reuse the existing SSOT pipeline unchanged in shape. `packages/design-system/src/tokens.css`
is the brand source. Web surfaces consume it directly (Tailwind v4 `@theme` + `.dark` class). Mobile
consumes `compose/EffyTokens.kt` (customer) and `compose-shop/EffyTokens.kt` (shop), **generated** from
`tokens.css` by `scripts/gen-compose-theme.mjs` and **diff-guarded** by `tokens:check`
(`gen-compose-theme` + `git diff --exit-code`). This slice changes token *values* and *extends the
generator's coverage*; it does not introduce any parallel theme system.

**Rationale**: "Every app MUST have the same theme" is already an enforced invariant, not a new goal.
Editing values in one file propagates to web immediately and to mobile via a guarded, committed
artifact. SC-007 is satisfied by construction.

**Alternatives**: A standalone design-token tool (Style Dictionary) — rejected; the zero-dependency
generator already does exactly what's needed and the guard is proven (013 D16). Hand-maintained mobile
colors — rejected; that is the drift the guard exists to prevent.

## R2 — Figma token names → shadcn CSS vars → Material 3 slots (semantic mapping)

**Decision**: Map the supplied Figma roles (`surface/*`, `button/*`, `txt/*`, `icon/*`, `border/*`) onto
the platform's existing shadcn CSS-variable contract (`--background`, `--foreground`, `--card`,
`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`,
`--sidebar*`). Keep the CSS-var names identical so **no shadcn primitive or surface markup changes** —
only the *values* behind the names change. The full table (with light + dark values) lives in
[data-model.md](data-model.md). Terracotta `#d0735a` maps to the `--destructive`/error family. Forest
`#26483a` maps to `--primary`/`--ring`/brand mark. The M3 mapping table in the generator is unchanged in
structure; new roles that have no M3 slot are **left at the M3 default** (never invented) — the rule the
generator already enforces.

**Rationale**: The platform's whole UI is built on the shadcn var contract; preserving the names is what
makes this a value swap rather than a rewrite. Mapping intent → var keeps surfaces referencing meaning.

**Alternatives**: Renaming CSS vars to the Figma taxonomy (`--surface-primary`, `--txt-secondary`) —
rejected; it would touch every className across five surfaces and every shadcn primitive for zero user
value. The Figma names are documented in data-model.md as the *design intent* behind each var instead.

## R3 — Dark palette (authored here, not auto-inverted)

**Decision**: Author dark values deliberately. Key moves: (a) a branded near-black background from
`surface/accent-dark` `#001a13` with lifted card/border greens; (b) **the accent lightens in dark** —
filled primary becomes `button/primary-light` `#69b08b` with a dark foreground, because the deep
`#26483a` has too little contrast against a dark background to read as a raised action; (c) text inverts
to the light greys (`#efeff1`/`#b5b7ba`); (d) terracotta is tuned so its foreground passes AA. Exact hex
values and every pair's target contrast are tabulated in data-model.md; final values are **gated by the
automated WCAG check (SC-003)** and may be nudged during implementation to pass.

**Rationale**: The supplied set is light-only (FR-003). Mechanical inversion produces muddy, off-brand,
often-failing dark colors. Lightening the accent for dark surfaces is the standard, brand-preserving
move (Material, Uber, eBay all do it).

**Alternatives**: Auto-invert / single-accent-across-modes — rejected on contrast and brand grounds.

## R4 — The appearance switcher, per surface (uniform behavior, uneven starting point)

**Decision**: Deliver Light / Dark / Follow-System everywhere, defaulting to Follow-System, persisted
locally, applied without reload, live-tracking the OS when in System.

- **customer-web (Next.js)**: `next-themes` is **already** `defaultTheme="system"` + `enableSystem` +
  pre-paint no-flash. The tri-state + persistence + live tracking already work; the only gap is a
  **visible, labelled control** (the old letter-key hotkey was deliberately removed). Add an
  `AppearanceControl` in the header/account that calls `setTheme("light"|"dark"|"system")`.
- **Vite consoles (back-office, shop-web)**: extend `web-kit` `ui-store` `Theme` from `"light"|"dark"`
  to a **mode** `"light"|"dark"|"system"`. When mode is `system`, resolve via
  `matchMedia("(prefers-color-scheme: dark)")` and **attach a `change` listener** so a live OS switch
  reflows; detach when the user forces light/dark. `applyTheme` still toggles the `.dark` class. Replace
  the binary item in `ConsoleUserMenu` with a 3-way selector.
- **Mobile (customer, shop)**: replace `EffyTheme(darkTheme = isSystemInDarkTheme())` with a resolver
  over a persisted `AppearanceMode` (Light/Dark/System); System defers to `isSystemInDarkTheme()`. Mode
  is stored via a multiplatform key/value setting and exposed through a ViewModel-observed state; the
  selector is a sectioned **row** in the Account tab (no card, per Principle V).

**Rationale**: Same contract, minimum change per surface. customer-web needs almost nothing structural;
the consoles need a tri-state upgrade; mobile needs a persisted override. All three end at identical
user-visible behavior (FR-011).

**Alternatives**: A shared cross-framework switcher component — rejected; Next SSR and Compose cannot
share a React SPA control, and the token source is already shared, which is what matters.

## R5 — Persisting the mobile appearance mode

**Decision**: Use a small multiplatform key/value settings store (`multiplatform-settings`, the KMP
idiom) behind a `core/settings` interface, wired explicitly at the app entry point (no DI framework,
Principle VI). Key `appearance.mode`, values `light|dark|system`, default `system`. Read synchronously
at startup to set the initial scheme; write on change; expose as observable state for instant reflow.

**Rationale**: Matches the platform's explicit-wiring rule and the existing `core/` driver pattern
(AuthDriver etc.). Avoids DataStore's Android-only coupling in `commonMain`.

**Alternatives**: Android DataStore + a Swift shim — rejected as heavier and platform-split for a single
enum. In-memory only — rejected; FR-010 requires persistence across relaunch.

## R6 — Outfit typography across web and mobile

**Decision**: Tokenize the font family (`--font-sans: "Outfit", …system fallback`) in the design system's
`@theme` block so Tailwind's `font-sans` resolves to Outfit on every web surface. Load the font per
framework: **customer-web** via `next/font/google` `Outfit` (self-hosted at build, no third-party
origin — preserves the storefront's no-external-request rule); **Vite consoles** via
`@fontsource-variable/outfit` imported once in `main.tsx` (replacing the `system-ui` string).
**Mobile**: bundle Outfit `.ttf` in each app's `composeResources/font/`, build a `FontFamily`, and set an
M3 `Typography` from the supplied scale (title + body = Outfit); apply in `EffyTheme`.

**Rationale**: One tokenized family, framework-appropriate loading, all self-hosted (Outfit is SIL OFL —
embedding is permitted on web and in apps). Keeps customer-web's zero-external-origin guarantee.

**Alternatives**: A CDN `<link>` to Google Fonts — rejected; adds a third-party origin on the storefront
critical path and violates the layout.tsx doctrine. Leaving fonts per-surface — rejected; fonts are part
of "same theme" and must be tokenized (SC-002).

## R7 — Spacing & radius scales

**Decision**: Add the supplied spacing scale (xs 4 · s 8 · md 12 · lg 16 · xl 20 · 4xl 40) and radius
scale (sm 8 · md 16 · xl 100 = pill) as tokens. Web: expose via `@theme` with **explicit** `--radius-sm`
(0.5rem/8px) and `--radius-md` (1rem/16px) — **not** shadcn's `calc()` chain, which would yield md=14px
and break mobile parity — and lean on Tailwind's spacing scale which already matches 4px steps. Mobile:
extend the generator to emit an `EffyRadius` object with **`sm` (8.dp), `md` (16.dp), and `default`
(= md, 16.dp)** and an `EffySpacing` object (top step `4xl 40` → `EffySpacing.xxxl`). The pill (scale
xl = 100) is `RoundedCornerShape(50%)` — **not** a numeric radius token.

**Rationale**: Radius especially is visible brand identity (the pill `100` for chips/buttons). Emitting
it through the same generator keeps mobile in lockstep and drift-guarded.

**Alternatives**: Hardcoding radii per component — rejected (SC-002). Web-only radius tokens — rejected;
mobile must match (SC-004/SC-007).

## R8 — WCAG contrast verification

**Decision**: Add an automated contrast check over the semantic foreground/background pairs (both
appearances) as a design-system test, asserting ≥4.5:1 for normal text and ≥3:1 for large text / UI
affordances (WCAG 2.1 AA). This is the machine enforcement of SC-003 and the gate that finalizes any
borderline dark/terracotta value.

**Rationale**: Contrast is easy to regress silently; a test makes "is this pair legible?" a build
failure, consistent with the platform's guard-first culture (bundle budget, quarantine, token drift).

**Alternatives**: Manual spot-check — rejected; not repeatable and misses the terracotta edge cases the
spec calls out.

## R9 — Constitution amendment scope & version

**Decision**: Amend Principle V's brand line from "Jade `#0FB57E`; fill `#047857`" to Effy Forest
`#26483a` (accent family) + terracotta `#d0735a`, and note the token set (Outfit type, spacing, radius)
is part of the design-system SSOT. Dark mode stays REQUIRED and is now user-selectable. **MINOR** bump:
`1.9.0 → 1.10.0` (a principle's guidance value materially changes, but no principle is removed and no
committed plan's *structure* is invalidated — surfaces still consume the SSOT). Update the Sync Impact
Report, and the CLAUDE.md § Design system brand line, in the same change (amendment procedure).

**Rationale**: This is the governance prerequisite behind FR-016. Prior neutral-theme work (D2) avoided
an amendment only because it *kept* Jade; retiring Jade requires one.

**Alternatives**: MAJOR bump — rejected; nothing is removed/redefined in a way that invalidates existing
plans. PATCH — rejected; a brand constant change is material, not wording.

## R10 — Scope guard: what this slice does NOT do

**Decision**: No additional named color palettes beyond light/dark (the switcher is appearance-mode, not
a palette gallery); no cross-device/account-level theme sync (preference is local per surface); no layout
or component-structure change; no `driver-mobile` UI work (it inherits tokens when built); no backend/DB.
The token architecture is left *extensible* for future named palettes but none ship here.

**Rationale**: Bounds the slice to the confirmed intent (spec Assumptions) and keeps it presentation-only.

**Alternatives**: Building a full multi-palette theming engine now — rejected as unrequested scope; the
single supplied palette + light/dark is the deliverable.
