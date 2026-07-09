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

## Responsive scaling (Amendment D2)

`src/scale.css` sets a **fluid root font-size** (`clamp()`, rem-anchored for zoom-safety). Because
the whole stack is rem-based (Tailwind spacing/type/controls), the entire UI scales **proportionally
together** on wide displays — baseline (~16px) preserved to ~1536px, scaling up to ~22px by ~2560px,
capped. No per-component work; import it after the tokens.

## Exports

| Import | What |
|---|---|
| `@effy/design-system` | `cn(...)` — the Tailwind class-merge util |
| `@effy/design-system/tokens.css` | Tailwind v4 `@theme` tokens + light/dark CSS variables (neutral surfaces + Jade accent) |
| `@effy/design-system/scale.css` | fluid root font-size (responsive UI scaling) |

Consumers import both in their entry stylesheet **after** Tailwind:

```css
@import "tailwindcss";
@import "@effy/design-system/tokens.css";
@import "@effy/design-system/scale.css";
```

Dark mode is driven by the `.dark` class on `<html>` (shadcn convention); flip it from a client
store (see `apps/back-office/src/lib/ui-store.ts`). Dark mode is **required** on every surface.

## Component graduation rule

shadcn's model copies UI primitives into each app (`apps/*/src/components/ui/`). That is fine — the
**tokens** are shared here, the **components** start app-local. When a **second** web surface needs
the *same* non-trivial component, graduate it up:

1. Move the component into `@effy/design-system/src/components/`, keep it themed from these tokens.
2. Re-export it; update both surfaces to import from `@effy/design-system`.
3. Delete the per-app copies.

Until then, do **not** pre-abstract — a single consumer needs no shared component layer (mirrors
004's in-service `lib/` → package rule).
