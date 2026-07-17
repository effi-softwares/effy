# Quickstart: Validate the Theme Refresh & Appearance Switcher

Validation guide only — implementation details live in tasks.md. All commands run from repo root.

## Prerequisites

- pnpm workspace installed (`pnpm install`).
- JDK + Android/iOS toolchain for the KMP builds (same as 013/014).
- The **Principle V amendment** landed (constitution `1.9.0 → 1.10.0`) — governance prerequisite (FR-016).

## 0. Single source of truth & mobile drift guard (SC-002, SC-007)

```bash
pnpm --filter @effy/design-system tokens:gen     # regenerate compose/ + compose-shop/ from tokens.css
pnpm --filter @effy/design-system tokens:check   # gen + `git diff --exit-code` → MUST be clean
```

Expected: after editing `tokens.css`, `tokens:gen` rewrites both Kotlin files; `tokens:check` passes
only when they are committed in lockstep. A stale mobile theme fails here.

## 1. Contrast gate (SC-003)

```bash
pnpm --filter @effy/design-system test           # includes the WCAG AA pair check (R8)
```

Expected: every foreground/background pair ≥4.5:1 (text) / ≥3:1 (large/UI) in **both** light and dark;
0 failures. The terracotta `--destructive` pairs are the ones to watch.

## 2. No retired brand, no per-surface fork (SC-002, SC-008)

```bash
# No Jade anywhere:
grep -ri "0fb57e\|047857" packages apps --include="*.css" --include="*.ts" --include="*.tsx" --include="*.kt" | grep -v node_modules
# Per-surface token guards (shop-web asserts it defines no @theme of its own; extend to new palette):
pnpm --filter @effy/shop-web test
pnpm --filter @effy/back-office test
```

Expected: the grep returns nothing; the guard tests pass.

## 3. Web — palette + Outfit + switcher

```bash
pnpm --filter @effy/customer-web dev     # :3000  (Next.js SSR)
pnpm --filter @effy/back-office dev       # Vite console
pnpm --filter @effy/shop-web dev          # :5174 Vite console
```

Check on each:
- Forest-green primary actions, new surfaces/greys/borders, Outfit type, rounded (md/pill) controls.
- The appearance control offers **Light / Dark / System**; switching reflows instantly, no reload.
- Reload the page → the chosen mode persists. Set **System**, flip the OS appearance → the surface
  follows (customer-web via next-themes; consoles via the `matchMedia` listener).
- customer-web only: view source / DevTools → **no flash of the wrong theme** on first paint; the static
  shell and guest bundle are intact (no `aws-amplify` in the shared chunk; budget ≤160 KB).

E2E:
```bash
pnpm --filter @effy/customer-web test:e2e   # appearance persistence, System tracking, no-flash SSR
```

## 4. Mobile — palette + Outfit + switcher (customer & shop)

```bash
pnpm --filter @effy/design-system tokens:gen         # ensure theme is current first
# then build/run each app as in its own quickstart (Android + iOS)
```

Check on customer-mobile and shop-mobile:
- New palette in light and dark; Outfit typography; brand radius.
- Account tab shows an appearance row (Light / Dark / System) — a **sectioned row, not a card**.
- Choose Dark → app reflows immediately; relaunch → still Dark. Choose System → follows the device;
  toggle the device appearance → app follows.
- Same element (e.g. primary button) looks identical to the web surfaces in the same appearance (SC-004).

Unit:
```bash
# mobile-kit / app commonTest — appearance-mode resolver: system defers to OS, light/dark force
```

## 5. Cross-surface consistency spot check (SC-001, SC-004)

Open a web surface and a mobile app side by side in the same appearance; confirm accent, surface, text,
border, and radius match. Change one token in `tokens.css`, re-run step 0, rebuild — confirm every
surface reflects it with no per-surface edit (SC-007).

## Done when

- Steps 0–2 green (SSOT, drift, contrast, no-Jade, no-fork).
- All six intended surfaces render the new palette + Outfit in light and dark (driver-mobile inherits
  when built).
- The Light/Dark/System switcher behaves identically and persists on every built surface.
- Constitution `1.10.0` + CLAUDE.md brand line reflect Effy Forest.
