# `@effy/design-system` — the brand SSOT

The single source of truth for Effy's web brand (constitution Principle V). The brand accent and
dark mode live here **once** — never hardcoded per surface. Internal package: exports TypeScript
source + CSS token files (each consumer's bundler transpiles).

## Theme: Effy Emerald brand (feature 017, constitution v1.10.0)

- **Brand accent is Effy Emerald `#065f46`** (emerald-800) as `--primary` / `--sidebar-primary`, with a
  **white** label in both modes (emerald-800 is dark enough for ~7.7:1). The focus `--ring` brightens to
  `#10b981` (emerald-500) on dark so it stays visible on the dark ground. A **terracotta** `#d0735a`
  (AA-tuned to `#bf5540`) is the `--destructive` accent. This **supersedes the retired Jade accent**.
- **Surfaces are the shadcn `neutral` scale — no brand tint.** Light: `#f5f5f5` ground, white cards,
  neutral-300 borders. Dark: `#171717` (neutral-900) ground, `#262626` (neutral-800) cards, and **subtle
  neutral-800 borders** (close to the ground). No green/black blend anywhere.
- **Typography is Nunito Sans** (`--font-sans`; apps self-host it — `next/font` Nunito Sans on customer-web,
  `@fontsource-variable/nunito-sans` on the Vite consoles, bundled `.ttf` on mobile).
- **Radii are pinned explicitly** (not shadcn's `calc()` chain): `--radius-sm` = 8px, `--radius-md` = 16px
  (brand default), pill via `rounded-full` — so web px equals mobile `EffyRadius` dp (SC-004).
- **Appearance is user-selectable** — Light / Dark / Follow-System, default System (dark mode REQUIRED,
  now switchable). Web via `@effy/web-kit` `ui-store` (consoles) / `next-themes` (customer-web); mobile via
  `AppearanceMode` + `EffyTheme(mode)`.
- **WCAG AA is machine-enforced**: `pnpm --filter @effy/design-system test` (`scripts/check-tokens.mjs`)
  fails the build if any FG/BG pair drops below AA in either appearance, or if the radii drift from 8/16.
- To adjust the theme, edit **`src/tokens.css` only** — every surface consumes these tokens, and mobile
  regenerates from them (`tokens:gen`, diff-guarded by `tokens:check`). Never hardcode a colour.

## Sizing: shadcn defaults

The UI uses **shadcn/Tailwind default sizing** — the browser-default 16px root font-size, no fluid
responsive scaling. (An earlier fluid `clamp()` root font-size that grew the whole UI on wide
displays was removed; surfaces render at their native size at every width.)

## Exports

| Import | What |
|---|---|
| `@effy/design-system` | `cn(...)` — the Tailwind class-merge util |
| `@effy/design-system/tokens.css` | Tailwind v4 `@theme` tokens + light/dark CSS variables (Effy Emerald accent, neutral surfaces, Nunito Sans type, radius scale) |

Consumers import the tokens in their entry stylesheet **after** Tailwind:

```css
@import "tailwindcss";
@import "@effy/design-system/tokens.css";
```

Dark mode is driven by the `.dark` class on `<html>` (shadcn convention); flip it from a client
store (see `apps/back-office/src/lib/ui-store.ts`). Dark mode is **required** on every surface.

## Component graduation rule — **exercised** (007-shop-web)

shadcn's model copies UI primitives into each app. With one web surface that was fine: the **tokens**
were shared, the **components** started app-local, and pre-abstracting a single consumer would have
been speculation.

**The second surface arrived**, and the rule fired. All 13 primitives plus `use-mobile` graduated
out of `apps/back-office/src/components/ui/` into this package:

```
packages/design-system/src/
├── ui/            # avatar, breadcrumb, button, card, collapsible, dropdown-menu, input,
│   └── index.ts   #   label, separator, sheet, sidebar, skeleton, tooltip  → @effy/design-system/ui
└── hooks/
    └── use-mobile.ts                                     → @effy/design-system/hooks/use-mobile
```

Both consoles point `components.json` → `aliases.ui` at `@effy/design-system/ui`, so the shadcn CLI
keeps generating correct imports. **There is no per-app copy.** Constitution Principle V — "one
design-system package drives every surface" — is now literally true rather than aspirational.

Adding a new primitive: `pnpm dlx shadcn@latest add <name>` inside a consuming app writes it to the
alias path (this package), then export it from `src/ui/index.ts`.

The rule for the *next* surface is unchanged: share what two consumers need, and not before.
