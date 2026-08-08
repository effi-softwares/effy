# Research: Monochrome Consoles & Shop Mobile

Phase 0 output. Resolves every unknown in the plan's Technical Context. Each decision is stated as **Decision / Rationale / Alternatives**.

---

## R1 — Token notation: oklch vs hex

**Decision**: Store the adopted values as `#rrggbb` hex in `tokens.css` (convert the pasted `oklch()` losslessly), not as oklch.

**Rationale**: `packages/design-system/scripts/gen-compose-theme.mjs` and `scripts/check-tokens.mjs` are both zero-dependency and parse only `--name: #rrggbb` (regex `#[0-9a-fA-F]{6}`); they silently skip any `oklch()` line. If the tokens were oklch:
- `gen-compose-theme.mjs` would throw `missing --background` and **fail to regenerate every mobile Compose theme** — including shop-mobile's, which is the whole P3 deliverable.
- `check-tokens.mjs` would report every colour var "missing" and fail.

The adopted neutrals are chroma-0 grey (oklch `L 0 0`) — hex is exact. The five chart hues sit inside sRGB and convert exactly for display. "Adopt exactly" is preserved in **value**; only the notation differs, and the notation is an internal storage detail no user sees.

**Alternatives considered**: Rewrite both guards + the generator to parse oklch and convert oklch→sRGB→luminance. Rejected — it burdens two deliberately zero-dependency scripts with a colour-space library for zero visual benefit, and widens the blast radius of a theme change to the build tooling of all six surfaces.

---

## R2 — Which tokens the pasted set replaces, and which are retained

**Decision**: Replace the role colours that have a pasted equivalent. **Retain** the platform-only tokens the pasted set omits: `--success`, `--disabled`, `--disabled-foreground`, `--placeholder`, `--font-sans` (General Sans), the pinned radius scale (`--radius-sm/md/lg/xl`), and the entire `@theme inline` mapping block. **Add** `--chart-1..5` (both appearances).

**Rationale**: The generator's `COLOR_TOKENS` list requires `success`, `disabled`, `disabled-foreground`, `placeholder`; the AA gate's `PAIRS`/`SEMANTIC_NON_TEXT` require them too. None of these conflict with the pasted values — the pasted set simply doesn't mention them (shadcn's default theme has no `--placeholder`/`--disabled`/`--success`). Dropping them would break the build and remove the platform's accessibility-tuned states. General Sans is the platform typeface (Principle V) and must stay. So "adopt exactly" applies to the *overlapping* role colours, with the platform superset intact.

**Token disposition** (pasted → tokens.css):

| Pasted var | Action |
|-----------|--------|
| `background, foreground, card(+fg), popover(+fg), primary(+fg), secondary(+fg), muted, accent(+fg), destructive, border, input` | **Replace** with hex-converted pasted value (both appearances) |
| `muted-foreground, ring` | **Replace, then AA-tune** — see R3 |
| `sidebar, sidebar-foreground, sidebar-primary(+fg), sidebar-accent(+fg), sidebar-border, sidebar-ring` | **Replace** with hex-converted pasted value |
| `chart-1..5` | **Add** (new; both appearances) |
| `radius` (0.65rem/0.625rem duplicate) | **Resolve to 0.625rem** as `--radius` base; keep pinned `--radius-sm/md/lg/xl` (see R4) |
| — (`success, disabled, disabled-foreground, placeholder, font-sans`) | **Retain** platform values unchanged |

---

## R3 — AA reconciliation (the invariant the operator did NOT relax)

**Decision**: Adopt the pasted neutral ramp, but tune the specific pairs that fall below the constitution's zero-exemption WCAG AA bar to the nearest passing value, recording each with its measured ratio — the platform's existing, documented practice.

**Rationale**: The operator's clarification relaxed *monochrome* (permitting chart hues, a card layout, a new radius). It did **not** relax accessibility. `check-tokens.mjs` enforces AA on every text pair in both appearances with zero exemptions, and `tokens.css` already records three source values tuned for exactly this reason ("none negotiable"). Two pasted values fail that gate:

| Pair (appearance) | Pasted value | Approx. ratio | Bar | Tuned to (target) |
|---|---|---|---|---|
| `muted-foreground` on `muted` (light) | `oklch(0.556 0 0)` ≈ `#737373` on `#f5f5f5` | ~4.1:1 | 4.5:1 text | darken to clear 4.5:1 (platform uses `#666666` → 4.60:1) |
| `ring` on `background` (light) | `oklch(0.708 0 0)` ≈ `#b3b3b3` on `#ffffff` | ~2.1:1 | 4.5:1 (guard tests ring as text) | the accent value (platform uses `#1a1a1a`) OR relax the guard's ring row to the 3:1 UI bar and meet 3:1 |
| `ring` on `background` (dark) | `oklch(0.556 0 0)` ≈ `#737373` on `#252525` | ~2.9:1 | 4.5:1 | same treatment as light |

Exact hex and ratios are computed **in the guard/test at implementation time**, not asserted here — the guard is the source of truth, and any pair that reads ≥ its bar is left at the pasted value untouched.

**Open sub-decision for the ring** (surface to operator during implementation): the pasted `ring` is a deliberately-subtle light grey — a shadcn aesthetic that assumes ring is a UI indicator (3:1), whereas the platform's guard tests `ring/background` at the 4.5:1 text bar and sets ring = the high-contrast accent. Two honest resolutions: **(a)** keep the platform's accent-coloured ring (strongest focus visibility, deviates most from the pasted look), or **(b)** relax the guard's single `ring` row from 4.5:1 to the correct WCAG 3:1 UI bar and pick the lightest pasted-adjacent grey that clears 3:1. **Recommendation: (b)** — it is *more* WCAG-correct (a focus ring is a non-text UI component under 1.4.11 → 3:1), keeps the pasted aesthetic closest, and is a principled guard fix rather than an exemption. Recorded here; the tasks phase will implement (b) unless the operator prefers (a).

**Alternatives considered**: Relax the whole AA gate to shadcn's defaults. Rejected — introduces genuinely illegible text (`muted-foreground` is used for secondary copy across both consoles) and contradicts a constitutional invariant the operator kept.

---

## R4 — Radius

**Decision**: Set `--radius: 0.625rem` (resolving the pasted duplicate `0.65rem`/`0.625rem` by CSS last-wins). **Keep** the pinned `--radius-sm` = `0.5rem` (8px) and `--radius-md` = `1rem` (16px) scale.

**Rationale**: `check-tokens.mjs` hard-requires `--radius-sm`=8px and `--radius-md`=16px, and `gen-compose-theme.mjs` maps those to `EffyRadius.sm/md` dp so **web px == mobile dp** (017 SC-004, a Principle V invariant). shadcn's dashboard derives radii from `--radius` via a calc chain the platform deliberately does not use. Keeping the pinned scale preserves mobile parity; the dashboard's `rounded-lg`/`rounded-md`/`rounded-xl` classes resolve through the `@theme` scale, so components render with platform radii. The `--radius` base (0.625rem) is honoured for anything reading it directly.

**Alternatives considered**: Adopt shadcn's full calc-chain radii (sm ≈ 6px, md = 10px, …). Rejected — it breaks the web↔mobile radius guard and would require re-pinning the mobile `EffyRadius` scale and a further SC-004 amendment, for a sub-pixel visual difference on corners.

---

## R5 — The shadcn "dashboard" structure: how to obtain and apply it

**Decision**: Add the dashboard structure from the shadcn registry into the **shared foundation**, not per app. Concretely:
- Add the missing **`chart`** primitive (`packages/design-system/src/ui/chart.tsx`) and the `recharts` dependency — the repo has `card`, `sidebar`, `table`, `badge`, `separator`, `breadcrumb`, `tooltip`, `dropdown-menu` already, but **no chart** and **no recharts**.
- Rebuild `@effy/web-kit/console/ConsoleShell` to the `dashboard-01` shell shape: an app-sidebar (brand · role-aware nav · user menu — the existing pieces re-composed), a `site-header`, and a `SidebarInset` main region.
- Provide a shared **dashboard overview** scaffold (section-cards row + interactive chart + a data-table slot) that each console's `app.tsx` landing composes with its own data.

**How to fetch the code**: the shadcn CLI installs blocks by name against the app's `components.json` (all three web apps already have one). The reference example is the `dashboard-01` block:
- `pnpx shadcn@latest add dashboard-01` scaffolds the full example (`app-sidebar`, `site-header`, `nav-*`, `section-cards`, `chart-area-interactive`, `data-table`) — use it as the **source to adapt**, not to drop in verbatim, because it writes into an app's local `components/` whereas this platform centralises primitives in `@effy/design-system/ui` and the shell in `@effy/web-kit`.
- Individual primitives (the one that is actually missing): `pnpx shadcn@latest add chart` — then relocate it into `packages/design-system/src/ui/chart.tsx` and export it from `ui/index.ts`, matching how the other 30 primitives live there.

**Rationale**: Principle II — one shell and one chart primitive, consumed by both consoles, so a future change is made once. The example is a *reference to adapt*; the platform's shared-package layout is authoritative over shadcn's default per-app file placement.

**Alternatives considered**: `npx shadcn add dashboard-01` directly into each app. Rejected — duplicates the shell and chart into two apps (copy-paste Principle II forbids) and bypasses the centralised `@effy/design-system/ui` registry.

---

## R6 — shop-mobile: colour-only

**Decision**: shop-mobile gets its new theme purely by regenerating `packages/design-system/compose-shop/EffyTokens.kt` from the updated `tokens.css` (`pnpm --filter @effy/design-system tokens:gen`), plus removing any residual hardcoded legacy accent in app source. No screen, navigation, or flow change.

**Rationale**: The compose theme is a committed, drift-guarded artifact derived from the SSOT; updating the tokens and regenerating is the entire colour change (FR-014/FR-015). `make sm-tokens-check` / `sm-guard` and the retired-hue sweeps prove no drift and no legacy accent remains. Chart hues do **not** reach shop-mobile — `COLOR_TOKENS` in the generator does not surface `--chart-*`, and the mobile app has no dashboard chart; the mobile theme stays a pure neutral ramp + two semantic hues.

**Alternatives considered**: Also restyle shop-mobile screens/structure. Rejected — the operator scoped mobile to colour only ("just change the color theme").

---

## R7 — Visual-equivalence validation for the four already-monochrome surfaces

**Decision**: Because `tokens.css` is the shared SSOT, adopting the pasted values re-tokens customer-web, customer-mobile, and driver-mobile too. Validate SC-006 by (a) diffing the resolved hex per role before/after and confirming any change is imperceptible on the neutral ramp, and (b) confirming no new off-identity colour (the chart hues are opt-in and appear only where a `chart` component is used — none exist on those surfaces).

**Rationale**: The prior ramp (`#1A1A1A … #FFFFFF`) and the pasted neutrals are near-identical greys; the material additions (chart hues, a slightly different radius base) do not reach surfaces that don't render charts and read radii through the pinned scale. Any per-role delta large enough to perceive is a finding to reconcile, not accept silently.

---

## R8 — Governance sequencing

**Decision**: The constitution amendment (via `/speckit-constitution`) permitting the chart hues, the card/chart dashboard layout for internal consoles, and the radius base is a **prerequisite task in this feature**, expected to bound the chart hues to data-visualisation use only and keep the AA + retired-hue invariants intact. The feature is not "done" until the amendment lands and `tokens.css`'s header comment is updated to match.

**Rationale**: Constitution Principle V is NON-NEGOTIABLE; live source must not contradict it. The platform's precedent (039 FR-005a coloured panels, 028 card exception) is to amend rather than silently deviate.
