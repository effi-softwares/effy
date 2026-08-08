# Sign-off: 041-monochrome-console-redesign

**Status**: Foundation + both web consoles + shop-mobile theme **BUILT and machine-verified**.
Operator device walk + commit **pending**. Not committed.

## What shipped

- **Governance** — constitution amended **1.12.0 → 1.13.0**: UI stays monochrome; one bounded
  exception, a data-visualisation palette (`--chart-1..5`) for charts only, never a UI accent, never
  surfaced to the mobile themes, never given a `-foreground` pair.
- **Tokens (`packages/design-system/src/tokens.css`)** — adopted the operator-supplied appearance
  identity, hex-converted from the source oklch:
  - Neutrals adopted (`#0a0a0a … #ffffff` ramp, both appearances).
  - `--chart-1..5` added (both appearances); `@theme` mappings added.
  - **Semantic error kept at `#e01010`** (constitution-pinned), NOT the theme's `#e7000b`.
  - **AA tunings** (the AA invariant was not relaxed): `--muted-foreground` `#737373`→`#6b6b6b`
    (was 4.35:1), `--ring` `#a1a1a1`→`#808080` light / `#737373` dark (was 2.58:1, failed even 3:1).
  - **Dark `--sidebar-primary` neutralized** from the source blue `#1447e6` → `#e5e5e5`.
  - `--radius` base → `0.625rem`; pinned `--radius-sm/md` (8/16px) unchanged (web↔mobile parity).
- **Guard (`check-tokens.mjs`)** — `ring` row corrected to the WCAG 1.4.11 UI bar (3:1); chart tokens
  asserted present in both appearances with no `-foreground` pair.
- **Shared web foundation** — `@effy/design-system/ui` `chart` primitive added (recharts);
  `@effy/web-kit/console` `DashboardOverview` scaffold added; `ConsoleShell` already matched the
  dashboard shell shape.
- **shop-web / back-office** — overview landings rebuilt on `DashboardOverview` (section cards +
  chart + proving screen); `amber` "warning" hue removed everywhere (→ monochrome emphasis); green
  `#5c6b64` neutralized; theme-token guards updated to the adopted values.
- **shop-mobile** — Compose theme regenerated from the new tokens (colour only). No screen/flow change.
- **Derived artifacts regenerated** — all 8 compose theme files; `packages/email-kit/dist/*` (10 files,
  token-derived — caught by the sweep).

## Verification (machine)

| Check | Result |
|---|---|
| `pnpm -r typecheck` | 14/14 ✅ |
| design-system AA gate (`check-tokens.mjs`) | ✅ 36 vars × 2 appearances, all WCAG AA |
| `tokens:check` (compose drift) | ✅ 8 files match |
| `check-no-emerald` / `check-no-jade` | ✅ clean |
| web-kit test | ✅ 48 |
| shop-web test / typecheck / build | ✅ 139 / clean / builds |
| back-office test / typecheck / build | ✅ 77 / clean / builds |
| customer-web test / bundle | ✅ 351 / **172.8 KB / 174** (SC-006) |
| email-kit test + `email-check` | ✅ 52 + clean (regenerated) |
| `sm-tokens-check` / `sm-guard` | ✅ |

## Open (operator)

- **T031 (full) / T032** — shop-mobile Gradle Android+iOS compile + on-device walk (Light / Dark /
  Follow-System). The change is a pure token regen (guards green), so risk is low, but it has not been
  compiled by Gradle or seen on a device here.
- **T038** — commit (tokens, guards, shared foundation, both consoles, shop-mobile theme, regenerated
  compose + email artifacts, constitution, docs).

## Notes / carry-forwards

- Overview chart data on both consoles is **illustrative sample data**, explicitly labelled "not live
  operations" (console-shell contract C2). Wiring live metrics is a later slice.
- `recharts` adds ~400 KB to the (login-gated) console bundles — a code-split candidate; internal
  consoles have no strict size gate.
- SC-003 (side-by-side one-visual-system observer test) and the dark-mode console walk are visual
  properties best confirmed by a person, alongside the operator device walk.
