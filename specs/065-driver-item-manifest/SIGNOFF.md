# Sign-off — 065 Driver Item Manifest & Temperature Classes

**Date**: 2026-10-04 · **Status**: 🚧 **41/43 — CODE-COMPLETE AND MACHINE-VERIFIED. NOT DEPLOYED, NOT
COMMITTED, NOT WALKED BY A PERSON.** The two open tasks are the operator's: the deploy (T042) and
the device walks (T043).

## What this slice changed that was not true before

**A driver can see what is in every package, and which of it will spoil.** At a shop pickup and at
the customer's door, each package lists its items by name and quantity, each marked Frozen, Chilled
or Normal, with a summary readable before the package is opened.

Also now true, and not before:

- **A package's item count is its own.** Before 065 every package at a shop stop carried every line
  at the stop, so three packages of 2, 5 and 1 items each read "8 items".
- **A drop shows its real packages.** It used to return one synthetic package for the whole order,
  so the drop, en-route, arrived and proof screens all said "1 package" for a two-shop order.
- **The driver's list matches the bag.** Quantities are what the shop gathered; a line the shop
  could not supply reads "Not included".
- **The order line records how the product was stored when it was sold.**
- **A stop or drop already loaded stays readable with no connection.**

## Built

| Layer | What |
|---|---|
| Migration | `20261004035955_order_item_storage_class.sql` — one nullable column + CHECK on `public.order_item` |
| `core-api` | `checkout/store.go` — the line read resolves the `storage` attribute; the order-line INSERT writes it |
| `shared-types` | `driver.ts` — `TemperatureClass`, `ClassSummary`, widened `ManifestLine`, per-package `DropPackageRef`, summaries on three DTOs; Kotlin regenerated |
| `edge-driver` | `work/manifest.ts` (new, pure) · `PACKAGE_ITEMS` keyed by package · `STOP_PACKAGES` · stop, run and drop reads reshaped |
| `driver-mobile` | `features/manifest/` (domain, mappers, shared views) · pickup, run list, drop detail, en-route and arrived screens · `core/offline/LastRead` · retry states |
| Docs | `docs/telemetry/driver-events.md`, `docs/audiences/driver-capabilities.md` §065 |

## Verified

`pnpm -r typecheck` **20/20** (unchanged) · `pnpm -r test` exit 0 · edge-driver **128** with
containers (was 104; **+24**: 13 unit, 11 container) · edge-fleet **196** and edge-orders **54** with
containers, unmodified · Go build / vet / gofmt clean, `go test -short ./...` clean, checkout incl.
**4 new container tests against every migration** · driver contract regenerates byte-stable, counts
are `Long` · driver-mobile Android host **49** tests (was 35; +14), **iOS test target compiles** ·
`mobile-guard` clean.

**Docker was up for the whole run**, so every container test executed.

### Negative proofs, each executed by breaking the thing

| # | Break | Caught by |
|---|---|---|
| 1 | Map a NULL class to `normal` | **5** tests — 4 unit, 1 container (SC-008) |
| 2 | Hand every package every row at the stop | **6** tests — incl. the two-package stop and the two-package drop |
| 3 | Select `unit_price_amount` and let it reach the payload | the prohibition guard |
| 4 | Read the class from the live product instead of the order line | **6** tests — incl. "a later product edit does not change what the driver is told" |

## Defects found while building

1. **Pre-existing, fixed — every package at a stop claimed the stop's whole item list.**
   `collectionStop` fetched items for all packages and assigned the full result to each. Its comment
   called it deliberate; the contract and the app both treat `items` as per-package.
2. **Pre-existing, fixed — a drop always reported one package.** `deliveryDrop` built a single
   synthetic `packages` entry, and four mobile screens count `drop.packages.size`.
3. **My own — a backtick inside a Go raw string.** A SQL comment quoting `` `storage` `` closed the
   query literal. Caught by the compiler, not by a test.
4. **My own — the storage attribute's values are back-office data.** The first draft copied
   `value_text` straight onto the order line. An admin adding a fourth allowed value would then fail
   the line's CHECK and **stop a shopper paying**. Anything not exactly `frozen` or `chilled` is now
   written `ambient`; pinned by `TestStorageClass_AnUnrecognisedStorageValueCannotFailCheckout`.

## Deviations from tasks.md

- **Container tests are one file, not three.** T011, T020, T021, T028 and T032 all live in
  `manifest.container.test.ts` (one container start instead of three).
- **Mobile tests are two files, not five.** `ManifestTest.kt` covers the mapping and summary rules
  (T012, T022, T030); `LastReadTest.kt` covers offline (T036). There is no Compose UI test harness
  in this app, so rendering (T019, T026, T027, T029, T033, T038) is compile-verified only.
- **Offline retention is a helper, `core/offline/LastRead.kt`**, used by both repositories, because
  the app has no mock HTTP engine and the rule needed a test.
- **`fromShopCount` is now 1 per package entry.** A package is one shop's portion.

## Not done, stated plainly

- **`driver_manifest_opened` is declared and documented, and nothing emits it.** That is true of
  every driver-workflow event (recorded by 064): no analytics driver is wired through the
  ViewModels.
- **Nobody has looked at any screen.** Layout, the drawn class icons, greyscale legibility (SC-004)
  and large-text behaviour are unverified. 039 shipped four live defects with a fully green suite.
- **SC-002, SC-003, SC-009 are unmeasured** (glance time, sorting accuracy, 30-item open time).
- **Offline retention is in memory.** It does not survive the app being killed.

## Pre-existing failures, NOT caused by this slice

Two `edge-shop` container tests fail **with this slice's migration removed** (verified by moving it
out and rerunning):

- `attention/repository.container.test.ts` — "resolves recipients and their manager flag from the
  PLATFORM RECORD"
- `orders/repository.container.test.ts` — "pages with a total order and a stable total"
  (`expected ['EFY-01','EFY-00'] to deeply equal ['EFY-25','EFY-26']`)

They are skipped in the default `pnpm -r test` (no `CONTAINER_TESTS=1`), which is why it is green.

## Open (operator)

1. Commit.
2. `make db-up ENV=dev` — additive, safe first.
3. `make core-image-push ENV=dev && make core-deploy ENV=dev` — new orders start recording a class.
4. `make edge-deploy SERVICE=driver ENV=dev` — ⚠ **never before step 2**: the read names the new
   column and every stop would 500.
5. Release the driver app. Installed builds keep working: they ignore unknown fields, and they now
   show correct per-package counts.
6. Walk W1–W10 in [quickstart.md](quickstart.md). ⚠ **W2** (two packages at one shop) and **W3** (a
   two-shop drop) exercise the two pre-existing defects; **W9** (greyscale, large text) is the one no
   test can stand in for.

Orders placed between steps 2 and 3 have no class recorded and read "Class not recorded".
