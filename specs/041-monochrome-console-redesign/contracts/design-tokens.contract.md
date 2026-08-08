# Contract: Design Tokens (adopted identity)

**Surface**: `packages/design-system/src/tokens.css` (SSOT) → consumed by all six surfaces; regenerated into the mobile `compose*/` themes.

## C1 — Notation
- Every colour token is `#rrggbb` (6-digit hex, lowercase). No `oklch()`, `rgb()`, or 8-digit hex in `:root`/`.dark` colour declarations. *(Enforced by the hex-only parser in `check-tokens.mjs` and `gen-compose-theme.mjs`; a non-hex colour is silently skipped and then fails the "missing var" check.)*

## C2 — Completeness
- Every colour var present in `:root` MUST be present in `.dark`, and vice-versa. *(check-tokens.mjs rule 1.)*
- The generator's required set MUST all exist: `background, foreground, card(+fg), popover(+fg), primary(+fg), secondary(+fg), muted, muted-foreground, accent(+fg), destructive(+fg), success, disabled, disabled-foreground, placeholder, border, input, ring` plus the eight `sidebar-*` roles.

## C3 — Accessibility (unchanged invariant)
- All text pairs meet WCAG 2.1 AA (≥ 4.5:1) in both appearances; the ring/focus indicator meets its bar (see R3's ring sub-decision — the guard's `ring` row may be corrected from 4.5:1 to the WCAG 1.4.11 UI bar of 3:1, which is the *only* permitted guard change and is a correctness fix, not an exemption).
- `--success` MUST have **no** `-foreground` pair. `--chart-1..5` MUST have **no** `-foreground` pair (non-text).
- Zero exemptions. Any adopted value failing its bar is tuned to the nearest passing value and the tuning is recorded in `tokens.css` alongside the existing three.

## C4 — Radius parity
- `--radius-sm` = `0.5rem` (8px), `--radius-md` = `1rem` (16px), unchanged. `--radius` base = `0.625rem`. *(check-tokens.mjs rule 2; web px == mobile EffyRadius dp.)*

## C5 — Chart hues bounded
- `--chart-1..5` exist and carry the adopted (non-monochrome) hues. They are permitted **only** inside data-visualisation components. They are not exported to the Compose themes. Using a chart hue as an accent/fill/border/text colour is a contract violation (checked by review + `check-no-emerald`-style intent, not a new colour on non-chart surfaces).

## C6 — Retired hues absent
- No emerald/terracotta/jade literal anywhere in live source. *(`scripts/check-no-emerald.sh`, `scripts/check-no-jade.sh` stay green.)*

## Verification
- `pnpm --filter @effy/design-system test` (runs `check-tokens.mjs`) → OK.
- `pnpm --filter @effy/design-system tokens:gen && tokens:check` → no drift.
- `scripts/check-no-emerald.sh` + `scripts/check-no-jade.sh` → clean.
