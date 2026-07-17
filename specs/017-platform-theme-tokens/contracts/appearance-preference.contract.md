# Contract: Appearance Preference (the runtime switcher)

Uniform behavior across all six surfaces (FR-009…FR-013); per-surface storage.

## Model

- **Mode**: `light | dark | system`. `system` follows the OS/device appearance and updates live.
- **Default**: `system` for any user who has never chosen (FR-013).
- **Resolution**: `light|dark` apply directly; `system` resolves to the current OS appearance and MUST
  re-resolve when the OS setting changes while the surface is open (FR-012).
- **Application**: takes effect immediately, no reload/restart (FR-010). Web = toggle `.dark` on
  `<html>`; mobile = swap the Compose `ColorScheme`.
- **Persistence**: local to the surface/device; survives relaunch/reload (FR-010). **Not** synced across
  a person's other installs (out of scope, spec Assumptions).
- **Control**: a visible, labelled selector offering the three modes, identically on every surface
  (FR-011). It is a menu item / settings row — **never a card** (Principle V).

## Per-surface realization

| Surface | Mechanism | Storage key | Live OS tracking | Control location |
|---|---|---|---|---|
| customer-web | `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) — already present | `theme` (next-themes `localStorage`) | built-in | new `AppearanceControl` in header/account |
| back-office | `@effy/web-kit` `ui-store` (extended to tri-state) | `back-office.theme` (`localStorage`) | `matchMedia` `change` listener while `system` | `ConsoleUserMenu` 3-way selector |
| shop-web | `@effy/web-kit` `ui-store` (same) | `shop-web.theme` | same | `ConsoleUserMenu` 3-way selector |
| customer-mobile | `EffyTheme` mode resolver + `core/settings` | `appearance.mode` (multiplatform-settings) | `isSystemInDarkTheme()` recomposition | Account tab row |
| shop-mobile | same | `appearance.mode` | same | Account tab row |
| driver-mobile | inherits when built | — | — | — |

## `ui-store` change (web-kit, consoles)

- `Theme` becomes the persisted **mode** `"light" | "dark" | "system"` (rename kept backward-compatible:
  an old stored `"light"|"dark"` still loads; absence → `"system"`).
- `applyTheme(mode)` resolves `system` via `matchMedia("(prefers-color-scheme: dark)")`, toggles `.dark`,
  and (when `system`) registers a `change` listener that re-applies; forcing `light|dark` detaches it.
- `setTheme(mode)` persists the mode string and applies. `toggleTheme` is superseded by an explicit
  3-way `setTheme` (keep a no-op/back-compat shim only if a caller still needs it).

## Invariants (tested)

1. First run with empty storage resolves to `system` and matches the OS appearance (FR-013/FR-012).
2. Setting a mode persists it; re-init reads it back (FR-010).
3. In `system`, an OS light→dark change flips the surface without reload (FR-012).
4. Forcing `light|dark` ignores subsequent OS changes.
5. The three surfaces' controls expose the same three options and produce the same applied result (FR-011)
   — asserted in `ui-store.test.ts` (web) and the mobile theme-resolver `commonTest`.
