# `@effy/design-system` — the brand SSOT

The single source of truth for Effy's web brand (constitution Principle V). The brand accent and
dark mode live here **once** — never hardcoded per surface. Internal package: exports TypeScript
source + CSS token files (each consumer's bundler transpiles).

## Theme: neutral surfaces, single accent (Amendment D2)

- **Surfaces are neutral.** Backgrounds, cards, sidebar, borders, and hover states use the neutral
  (Tailwind `neutral`) scale — **no brand-tinted surface blends** (FR-024). This is the shadcn
  `sidebar-07` neutral base.
- **Jade `#0FB57E` is the single accent.** It appears **only** as `--primary` / `--ring` /
  `--sidebar-primary` (primary actions, focus, brand mark), used sparingly. `fill #047857` remains a
  defined brand token but no longer tints surfaces. (Jade is an emerald shade — this satisfies
  "emerald primary" with no constitution change.) The accent's foreground is **dark** (`#052e1b`):
  white text fails WCAG contrast on the bright emerald; dark green passes.
- To adjust the theme, edit **`src/tokens.css` only** — every surface (sign-in, dashboard shell, all
  shadcn primitives) consumes these tokens, so a single edit re-themes the whole app. Never hardcode
  a colour in a component.

## Sizing: shadcn defaults

The UI uses **shadcn/Tailwind default sizing** — the browser-default 16px root font-size, no fluid
responsive scaling. (An earlier fluid `clamp()` root font-size that grew the whole UI on wide
displays was removed; surfaces render at their native size at every width.)

## Exports

| Import | What |
|---|---|
| `@effy/design-system` | `cn(...)` — the Tailwind class-merge util |
| `@effy/design-system/tokens.css` | Tailwind v4 `@theme` tokens + light/dark CSS variables (neutral surfaces + Jade accent) |

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
