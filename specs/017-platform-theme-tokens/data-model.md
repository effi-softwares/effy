# Data Model: Platform Theme & Design Tokens

This slice's "data" is the **design token set** and the **appearance preference**. No database entities.

## Entities

- **Design token** — a named semantic value with a light and a dark resolution. Atomic unit of the theme.
- **Semantic role** — the *intent* a token carries (surface / button / text / icon / border; primary /
  secondary / accent / disabled / destructive). Surfaces reference roles (via the CSS-var names), never
  raw hex.
- **Appearance variant** — the light or dark resolution of the full token set.
- **Appearance preference** — a user's chosen mode: `light | dark | system`; local per surface; default
  `system`. Detailed in [contracts/appearance-preference.contract.md](contracts/appearance-preference.contract.md).

## Value legend

- **supplied** — value taken directly from the operator's light palette.
- **derived** — computed from the supplied grey/green ramp to fill a shadcn role the palette does not
  name 1:1 (documented so it is not "invented" silently).
- **AA-tuned** — nudged from the supplied value to pass the WCAG AA gate (R8/SC-003); the supplied value
  is recorded as the design intent.
- Dark values are **authored** (R3), not inverted; all pairs are subject to the contrast gate — a
  ⚠ marks a pair to watch.

## Color token map (Figma intent → shadcn CSS var → light → dark → M3 slot)

| Figma intent | CSS var (unchanged name) | Light | Dark | M3 slot (mobile) |
|---|---|---|---|---|
| surface/primary | `--background` | `#efeff1` (supplied) | `#001a13` (surface/accent-dark) | `background` |
| txt/primary | `--foreground` | `#0d0d0d` (supplied) | `#efeff1` | `onBackground` |
| surface/static-white | `--card` | `#ffffff` (supplied) | `#0f241b` (derived lift) | `surface` |
| txt/primary | `--card-foreground` | `#0d0d0d` | `#efeff1` | `onSurface` |
| surface/static-white | `--popover` | `#ffffff` | `#0f241b` | — (M3 default) |
| txt/primary | `--popover-foreground` | `#0d0d0d` | `#efeff1` | — |
| button/primary (brand) | `--primary` | `#26483a` (supplied) | `#69b08b` (button/primary-light) | `primary` |
| txt/static-white | `--primary-foreground` | `#ffffff` (supplied) | `#001a13` (dark on light green) | `onPrimary` |
| button/secondary | `--secondary` | `#e6e7e9` (derived) | `#1c2f27` (derived) | `secondary` |
| txt/primary | `--secondary-foreground` | `#0d0d0d` | `#efeff1` | `onSecondary` |
| surface/primary | `--muted` | `#efeff1` (supplied) | `#12271e` (derived) | `surfaceVariant` |
| txt/secondary | `--muted-foreground` | `#5f6368` (AA-tuned; intent `#767a7f`) | `#b5b7ba` (supplied) | `onSurfaceVariant` |
| neutral hover | `--accent` | `#efeff1` (derived) | `#1c2f27` (derived) | — |
| txt/primary | `--accent-foreground` | `#0d0d0d` | `#efeff1` | — |
| button/red (terracotta) | `--destructive` | `#bf5540` (AA-tuned; intent `#d0735a`) ⚠ | `#dd8368` (lifted) ⚠ | `error` |
| txt/static-white | `--destructive-foreground` | `#ffffff` | `#0d0d0d` | `onError` |
| border/primary | `--border` | `#d5d6d8` (supplied) | `#24382f` (derived) | `outline` |
| border/primary | `--input` | `#d5d6d8` | `#24382f` | — |
| border/accent (brand) | `--ring` | `#26483a` (supplied) | `#69b08b` | — |

### Sidebar (console chrome) — same intents, sidebar-scoped vars

| CSS var | Light | Dark |
|---|---|---|
| `--sidebar` | `#fafafa` (grey/50) | `#0f241b` |
| `--sidebar-foreground` | `#0d0d0d` | `#efeff1` |
| `--sidebar-primary` | `#26483a` | `#69b08b` |
| `--sidebar-primary-foreground` | `#ffffff` | `#001a13` |
| `--sidebar-accent` (hover/active) | `#efeff1` | `#1c2f27` |
| `--sidebar-accent-foreground` | `#0d0d0d` | `#efeff1` |
| `--sidebar-border` | `#d5d6d8` | `#24382f` |
| `--sidebar-ring` | `#26483a` | `#69b08b` |

### Documented design intents with no distinct shadcn slot

Recorded so future work has the names; not emitted as separate vars unless a component needs them:
`surface/accent #26483a`, `button/primary-dark #172b23` (pressed state), `surface/red #f5e1db` /
`border/red #d0735a` (soft error surface), `border/secondary #b5b7ba`, `border/green #69b08b`,
`icon/*` (icons inherit `currentColor` from text/accent roles), `txt/disabled #9b9da1` /
`button/disabled #d5d6d8` (map to shadcn `disabled:` opacity + these where a solid disabled fill is
needed). `surface/blur #0d0d0d1a` → the existing dialog/sheet backdrop-blur overlay.

## Typography (Outfit — one family, both roles)

Family token `--font-sans: "Outfit", <system fallback>`; weight 400 baseline.

| Role (supplied) | Size / line-height | M3 slot (mobile, approx) |
|---|---|---|
| Head/H1 | 44 / 54 | `displaySmall` |
| Head/H6 | 14 / 20 | `titleSmall` |
| Body/Body2 | 14 / 20 | `bodyMedium` |
| Button/Button1 | 16 / 18 | `labelLarge` |
| Button/Button2 | 14 / 18 | `labelMedium` |
| (base) | md 16 | `bodyLarge` |

Slots not supplied inherit the M3 default **metrics** but the **Outfit family** (family set on the whole
`Typography`). Web sizes stay Tailwind's scale bound to Outfit; only the family token changes globally.

## Radius scale

| Token | Value | Use |
|---|---|---|
| `radius/sm` | 8px / 8.dp | inputs, small controls |
| `radius/md` | 16px / 16.dp | buttons, cards, sheets (the brand default) |
| `radius/xl` | 100 → `rounded-full` / pill | chips, pills, avatars, primary CTAs where pill-shaped |

Web: pin the radii **explicitly** in `@theme` — do **not** use shadcn's `calc(var(--radius) ± Npx)`
chain, which would yield `md=14px` and break parity with mobile. Exact values:

```css
--radius: 1rem;        /* base / brand default = md */
--radius-sm: 0.5rem;   /* 8px  — inputs, small controls */
--radius-md: 1rem;     /* 16px — buttons, cards, sheets (brand default) */
--radius-lg: 1rem;     /* 16px */
--radius-xl: 1.25rem;  /* 20px */
```

Pill (scale xl = 100) via `rounded-full`. Mobile: `EffyRadius { sm=8.dp; md=16.dp; default=16.dp }`
(explicit rem sources let the generator parse them) + pill via `RoundedCornerShape(50%)`. Web `--radius-sm`
= mobile `EffyRadius.sm` = 8px/dp and web `--radius-md` = mobile `EffyRadius.md` = 16px/dp — this equality
is what SC-004 (cross-surface parity) rests on.

## Spacing scale

`xs 4 · s 8 · md 12 · lg 16 · xl 20 · 4xl 40` (px / dp) — the scale's `4xl (40)` step maps to the Kotlin
token **`EffySpacing.xxxl`** (a Kotlin identifier cannot start with a digit). Web maps to Tailwind's
existing 4px step scale; mobile gets a generated
`EffySpacing { xs=4.dp; s=8.dp; md=12.dp; lg=16.dp; xl=20.dp; xxxl=40.dp }`.

## Generator coverage (what `gen-compose-theme.mjs` must emit after this slice)

- All color tokens above → `EffyColor.Light` / `.Dark` (extend `COLOR_TOKENS`; M3 map unchanged in shape).
- `EffyRadius` with `sm/md/default` (currently only `default`).
- New `EffySpacing` object.
- New `EffyTypography`/font-family handle for the Outfit `FontFamily` (family reference; the .ttf is an
  app resource, so the generated file may only expose sizes/weights + a hook the app binds the family to).
- Remains **zero-dependency** and **diff-guarded** (`tokens:check`), for both `compose/` and `compose-shop/`.

## Validation rules

- Every CSS var has both a `:root` (light) and `.dark` value — the generator throws on a missing key.
- Every foreground/background pair passes WCAG 2.1 AA in both appearances (≥4.5:1 text, ≥3:1 large/UI) —
  automated gate (R8). ⚠-marked terracotta pairs are the ones that decide final values.
- Mobile generated files equal the source (`git diff --exit-code`) — CI gate.
- No surface declares its own `@theme` block or hardcoded brand hex (existing per-surface token guards,
  e.g. `apps/shop-web/src/theme-tokens.test.ts`, extended to the new palette).
