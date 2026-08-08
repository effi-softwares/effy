# Data Model: Monochrome Consoles & Shop Mobile

**This feature introduces no persistent data entities.** It changes presentation only (FR-018): the shared design tokens, the shared console shell, and per-surface theming. There is no migration, no schema change, no new table or column.

What follows is the *design model* — the token roles and their disposition — because that is the artifact this feature actually mutates. The authoritative token contract is [contracts/design-tokens.contract.md](./contracts/design-tokens.contract.md).

## Token roles (the thing being changed)

Stored in `packages/design-system/src/tokens.css`, one `:root` (light) block and one `.dark` block. Every colour is `#rrggbb` (R1). Three categories:

### 1. Adopted from the pasted set (replace existing)
`background · foreground · card(+foreground) · popover(+foreground) · primary(+foreground) · secondary(+foreground) · muted · accent(+foreground) · destructive · border · input · sidebar · sidebar-foreground · sidebar-primary(+foreground) · sidebar-accent(+foreground) · sidebar-border · sidebar-ring`

- Rule: value = hex conversion of the pasted `oklch()`, both appearances.
- Constraint: every text pair still passes the AA gate (`check-tokens.mjs`). Pairs that don't (`muted-foreground`, `ring`) are AA-tuned — see [research R3](./research.md).

### 2. Added (new)
`chart-1 · chart-2 · chart-3 · chart-4 · chart-5` (both appearances).

- Rule: value = hex conversion of the pasted oklch chart hues.
- Constraint: **data-visualisation use only** (constitution amendment R8). Not an accent, not a fill, never text-on-fill. Not surfaced to mobile (`gen-compose-theme.mjs` `COLOR_TOKENS` excludes them). The AA gate treats them as non-text (no `-foreground` pair permitted).

### 3. Retained (platform-only; not in the pasted set)
`success · disabled · disabled-foreground · placeholder · font-sans (General Sans) · radius scale (--radius-sm/md/lg/xl) · @theme inline mapping`

- Rule: unchanged. Required by the generator and AA gate; not in conflict with the pasted values.
- `--radius` base → `0.625rem` (R4); the pinned scale stays 8/16px for web↔mobile parity.

## Derived artifacts (regenerated, not authored)

| Artifact | Source | Regen command | Guard |
|---|---|---|---|
| `packages/design-system/compose-shop/EffyTokens.kt` (shop-mobile theme) | `tokens.css` | `pnpm --filter @effy/design-system tokens:gen` | `tokens:check` / `make sm-tokens-check` |
| `compose/…` (customer-mobile), `compose-driver/…` (driver-mobile) | `tokens.css` | same | same |

## State / transitions

None. Appearance selection (Light / Dark / Follow-System) is pre-existing runtime state on each surface (`ui-store` web, `AppearanceMode` mobile) and is unchanged by this feature.
