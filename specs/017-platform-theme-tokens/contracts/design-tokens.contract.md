# Contract: Design Tokens (the brand SSOT)

The single source of truth is `packages/design-system/src/tokens.css`. This contract fixes the *shape*
every consumer relies on; values are in [../data-model.md](../data-model.md).

## Web contract (`tokens.css`)

- **`:root { … }`** declares the light appearance; **`.dark { … }`** declares the dark appearance. Every
  color token MUST appear in both blocks with a 6-digit `#rrggbb` value.
- The `@theme inline { … }` block maps each `--x` to `--color-x` (Tailwind v4) and declares
  `--radius-*` and `--font-sans`. Consumers use Tailwind utilities (`bg-background`, `text-foreground`,
  `bg-primary`, `rounded-md`, `font-sans`) — never raw hex.
- The CSS-var **names are frozen** by this slice (value swap only): `--background --foreground --card
  --card-foreground --popover --popover-foreground --primary --primary-foreground --secondary
  --secondary-foreground --muted --muted-foreground --accent --accent-foreground --destructive
  --destructive-foreground --border --input --ring` and the `--sidebar*` set. Adding a *new* var is
  allowed; renaming/removing an existing one is out of scope (would ripple across five surfaces).
- Dark appearance is selected by the `.dark` class on `<html>` (`document.documentElement`). Nothing
  else toggles appearance.

## Mobile contract (generated, diff-guarded)

`scripts/gen-compose-theme.mjs` parses `tokens.css` and writes, per KMP app package:

- `object EffyColor { object Light {…}; object Dark {…} }` — one `val` per color token (ARGB `0xFF……`).
- `val EffyLightColorScheme / EffyDarkColorScheme: ColorScheme` — shadcn var → M3 slot via the FIXED map;
  M3 slots with no source stay at the M3 default (never invented).
- `object EffyRadius { sm; md; default }` and `object EffySpacing { xs; s; md; lg; xl; xxxl }` (dp).
- A font handle the app binds the Outfit `FontFamily` to (the `.ttf` is an app resource, not generated).
- Banner `// GENERATED … DO NOT EDIT`. Targets: `compose/EffyTokens.kt` (customer),
  `compose-shop/EffyTokens.kt` (shop).

**Guard**: `pnpm --filter @effy/design-system tokens:check` = `tokens:gen` then `git diff --exit-code
compose/ compose-shop/`. A `tokens.css` change not regenerated **fails the build**. This is the mobile
half of SC-007.

## Invariants (tested)

1. Missing a token in either block → generator throws (no silent default).
2. Generated Kotlin equals committed Kotlin (drift guard).
3. Every FG/BG pair passes WCAG 2.1 AA in both appearances (contrast test, R8).
4. No consumer surface hardcodes a brand hex or declares its own `@theme` (per-surface token guards).
5. Zero occurrences of the retired Jade `#0fb57e` / `#047857` remain anywhere (SC-008 sweep).
