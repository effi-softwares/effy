# `@effy/design-system` — the brand SSOT

The single source of truth for Effy's web brand (constitution Principle V). The Jade brand
**`#0FB57E`** / fill **`#047857`** and dark mode live here **once** — never hardcoded per surface.
Internal package: exports TypeScript source + a CSS token file (each consumer's bundler transpiles).

## Exports

| Import | What |
|---|---|
| `@effy/design-system` | `cn(...)` — the Tailwind class-merge util |
| `@effy/design-system/tokens.css` | Tailwind v4 `@theme` tokens + light/dark CSS variables |

Consumers import the tokens in their entry stylesheet **after** Tailwind:

```css
@import "tailwindcss";
@import "@effy/design-system/tokens.css";
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
