# Baseline — before any 036 change

**Captured**: 2026-08-05, on branch `035-six-digit-otp` at `50c3675`, working tree clean.
**Tasks**: T001, T002.

⚠ **Purpose**: 035 and 033 both recorded gates that were *already red on the branch* and were later
mistaken for regressions introduced by the slice. Everything below was measured **before the first edit**.

## Verdict: GREEN. No pre-existing failure found.

## Typecheck — 13/13

`pnpm -r typecheck` → all Done: `brand`, `shared-types`, `edge-api/shared`, `design-system`,
`edge-api/shop`, `edge-api/customer`, `edge-api/auth`, `edge-api/admin`, `api-client`, `customer-web`,
`web-kit`, `back-office`, `shop-web`.

## Tests — `pnpm -r test`

| Package | Files | Tests |
|---|---|---|
| `packages/shared-types` | 1 | 7 |
| `apis/edge-api/shared` | 6 | 49 |
| `apis/edge-api/auth` | 10 | **104** |
| `apis/edge-api/admin` | 12 | 113 |
| `apis/edge-api/shop` | 15 | 170 |
| `apis/edge-api/customer` | 10 (+1 skipped) | 87 (+8 skipped) |
| `packages/web-kit` | 9 | **48** |
| `apps/customer-web` | 26 | **208** |
| `apps/back-office` | 18 | 77 |
| `apps/shop-web` | 20 | 138 |
| **Reporting total** | **127** | **1001** |

`packages/design-system`, `packages/brand` and `packages/api-client` report "Done" without a vitest
count (their `test` scripts are node check-scripts, not vitest). ⚠ **13 packages must report.** 029
recorded a case where `pnpm -r test` was green while `typecheck` failed, caught only because the Done
count fell 12→11 — so counting reporting packages is part of the sweep.

## Guest bundle — the gate that must not move

⚠ **These nine numbers must be byte-identical after 036** (SC-018, FR-041). The limit is **174 KB** and
must **not** be raised.

| Route | Size | Headroom |
|---|---|---|
| `/` | 171.7 KB | 2.3 |
| `/browse` | 168.1 KB | 5.9 |
| **`/search`** | **172.0 KB** | ⚠ **2.0** |
| `/product/[id]` | 170.4 KB | 3.6 |
| **`/cart`** | **172.0 KB** | ⚠ **2.0** |
| `/promotions/[id]` | 169.1 KB | 4.9 |
| `/delete-account` | 159.5 KB | 14.5 |
| `/legal/privacy` | 147.3 KB | 26.7 |
| `/legal/terms` | 147.3 KB | 26.7 |

⚠ The plan assumed `/search` was the tightest at 2.0 KB; **`/cart` is equally tight**. Both are the
constraint on anything reaching the `@effy/design-system/ui` barrel — which is why the Google mark is
inlined and deliberately kept out of it (T109).

## Guards

- `tokens:check` — ✓ all **8** generated Compose files match `tokens.css`; **82** mobile-asset copies
  match across 3 apps; banner template matches the 1200×600 canvas.
- `mobile-guard.sh` — ✓ auth/config clean; retired presentation and excluded affordances absent; every
  customer destination reachable.
- `check-no-emerald.sh` — ✓ · `check-no-jade.sh` — ✓

## Mobile

Captured separately (`:shared:testAndroidHostTest`, `:shared:compileKotlinIosSimulatorArm64`,
`:shared:compileTestKotlinIosSimulatorArm64`). ⚠ The **test** compilation for iOS is included
deliberately — 033 found it had never run while every "iOS compiles" claim covered only `main`.
