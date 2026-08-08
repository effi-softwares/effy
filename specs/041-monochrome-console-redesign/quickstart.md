# Quickstart: Monochrome Consoles & Shop Mobile — validation guide

Runnable checks that prove the feature works end-to-end. Details live in the contracts and research; this is the run/validate sheet.

## Prerequisites
- Monorepo installed (`pnpm install`).
- The **constitution amendment** (research R8) landed via `/speckit-constitution` — permitting the chart hues, the internal-console card/chart dashboard layout, and the `0.625rem` radius base, while keeping the AA + retired-hue invariants. *(Feature is not complete without it.)*

## 1. Token adoption (governance half)

```bash
# AA gate + completeness + radius parity
pnpm --filter @effy/design-system test          # runs check-tokens.mjs → expect "OK … all pairs pass WCAG AA"
# regenerate + drift-check the mobile Compose themes from the new tokens
pnpm --filter @effy/design-system tokens:gen
pnpm --filter @effy/design-system tokens:check   # expect no drift
# retired hues absent everywhere
scripts/check-no-emerald.sh && scripts/check-no-jade.sh   # expect clean
```

Expected: no `oklch()` in `tokens.css` colour blocks; `--chart-1..5` present in both appearances with no `-foreground`; `--radius-sm/md` still 8/16px; every AA-tuned value carries a recorded ratio.

## 2. Shop web console (P1 — FR-006…FR-009)

```bash
make shop-lint && make shop-test
make shop-dev    # walk every screen in a browser
```

Validate: sign-in → dashboard shell (app-sidebar + site-header + inset); overview landing shows section cards + interactive chart + table; catalog, orders/fulfillment, shop-identity render inside the shell with unchanged behaviour; only monochrome + two semantic states + chart hues appear; Light/Dark/Follow-System all correct.

## 3. Back-office console (P2 — FR-010…FR-013)

```bash
make bo-lint && make bo-test
make bo-dev      # walk every management area
```

Validate: same shell + overview landing as shop-web; shops, staff, catalog-schema, promotions, deliverability render inside the shell, behaviour unchanged; the two consoles read as one system.

## 4. Shop mobile (P3 — FR-014…FR-016)

```bash
make sm-tokens-check && make sm-guard
# Android + iOS compile + unit tests, then run on a device/emulator
```

Validate: every existing screen renders in the monochrome identity matching the customer app, both appearances; navigation and flows **unchanged**; no chart hue present.

## 5. Visual-equivalence of the already-monochrome surfaces (SC-006)

```bash
make cm-tokens-check      # customer-mobile drift
make cw-build && make cw-size   # customer-web builds + bundle within budget
```

Validate: customer-web, customer-mobile, driver-mobile show no perceptible ramp shift and no new off-identity colour (no charts on those surfaces).

## 6. Full sweep

```bash
pnpm -r typecheck && pnpm -r test
```

## Success-criteria mapping
- SC-001 → §2, §3 · SC-002 → §4 · SC-003 → §2/§3 side-by-side · SC-004 → §1 (`check-no-*`) · SC-005 → §2/§3/§4 appearance switch · SC-006 → §5 · SC-007 → §2/§3 (colour audit) · SC-008 → shared shell/tokens (one change reaches all consumers).
