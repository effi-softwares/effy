# Quickstart: validating 065

Contract: [contracts/driver-manifest.md](contracts/driver-manifest.md) · Data:
[data-model.md](data-model.md)

## Prerequisites

- 063 and 064 deployed to dev (a driver can be assigned a collection run and a same-day round).
- Docker running, for the container tests.
- Three dev products at one shop with `storage` set to frozen, chilled and ambient, and one product
  with no storage attribute.

## Baseline (T001, taken 2026-10-04 before any change)

| Check | Before | After |
|---|---|---|
| `pnpm -r typecheck` reporting packages | 20 | 20 |
| `@effy/edge-driver` (default) | 35 passed, 69 skipped | 48 passed, 80 skipped |
| `@effy/edge-driver` (`CONTAINER_TESTS=1`) | 104 | 128 |
| `@effy/shared-types` | 7 | 7 |
| `go test -short ./internal/features/checkout/...` | ok | ok |
| driver-mobile `:shared:testAndroidHostTest` | 35 (not measured before; 49 minus the 14 added) | 49 |
| `driver-contract:check` | green | regenerates byte-stable; ⚠ reads red until the regenerated files are committed, because it diffs against HEAD |

## 1. Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/shared-types driver-contract:check     # generated Kotlin has no drift
pnpm --filter @effy/edge-driver test                       # incl. manifest unit tests
CONTAINER_TESTS=1 pnpm --filter @effy/edge-driver test     # manifest against the real migrations
(cd apis/core-api && go test ./internal/features/checkout/...)
(cd apps/driver-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileTestKotlinIosSimulatorArm64)
```

Expected: all green; the count of reporting packages from `pnpm -r typecheck` is unchanged.

## 2. Deploy (operator; order matters)

```sh
make db-up ENV=dev                          # additive column — safe first
make core-image-push ENV=dev && make core-deploy ENV=dev
make edge-deploy SERVICE=driver ENV=dev     # ⚠ never before db-up: the read names the new column
```

## 3. Walks

| # | Do | Expect | Proves |
|---|---|---|---|
| W1 | Order one frozen, one chilled, one ambient item from one shop; pick and mark ready; open the shop stop as the assigned driver | Package shows a three-way summary without opening; opening lists three lines, frozen first, each with a word + icon | SC-001, SC-002, US1 |
| W2 | Two orders ready at the same shop, 2 items and 5 items | Each package shows its own count and its own lines, not 7 | research R2 |
| W3 | Same-day order spanning two shops; open the drop | Two groups labelled by position; every line listed; combined summary on the round's drop list; no shop named; no price anywhere | US2, SC-007 |
| W4 | At the shop, mark one line unavailable and part-pick another, then Fulfil | Driver sees the first as not included, the second at the supplied quantity; summary excludes the missing line | US3, SC-005 |
| W5 | After W1's order is paid, change the chilled product to ambient; reopen the stop; then place a new order | Old order still says Chilled; new order says Normal | US4, SC-006 |
| W6 | Open a stop for an order placed before the deploy | Lines read "Class not recorded", never Normal | SC-008 |
| W7 | Order the product with no storage attribute | Normal | FR-008 |
| W8 | Load a stop, enable airplane mode, reopen it | Items still shown; a never-loaded stop shows an error with retry, not an empty list | FR-024, FR-025 |
| W9 | Device in greyscale; then largest text size | Every class still identifiable; nothing clipped | SC-004 |
| W10 | Repeat W1 and W3 on the other platform | Identical items, classes, summaries | SC-010 |

## 4. Negative proofs (break it, see it caught)

- Map NULL → `normal` in `manifest.ts` → the SC-008 test fails.
- Drop the package key from `PACKAGE_ITEMS` grouping → the two-package container test fails.
- Add `unit_price_amount` to the items SELECT and DTO → the prohibition guard fails.
- Read the class from the live product instead of `order_item` → the US4 container test fails.
