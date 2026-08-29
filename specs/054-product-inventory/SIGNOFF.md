# 054-product-inventory — Sign-off record

**Date**: 2026-08-29 · **Status**: 🚧 **CODE-COMPLETE, FULLY MACHINE-VERIFIED INCLUDING SC-003, NOT
DEPLOYED, NOT COMMITTED, NOT WALKED BY A PERSON.** 78 of 93 tasks.

---

## What this closes

Gap **G2** in [ORDER-FLOW-GAPS.md](../../ORDER-FLOW-GAPS.md): nothing on the platform knew how much of
anything a shop had. `public.product` carried `status` and nothing else, so a shopper could buy 20 of
something a shop had 2 of, and the only discovery mechanism was a picker at an empty shelf hours later.

All five user stories are built across five surfaces: the hot path, a new cold-path service, shop-web,
shop-mobile and back-office. **The customer surfaces gained nothing** — no screen, no route, no DTO
change. A shopper experiences this entirely through the value of the `available` flag they already
receive, which is the same return 052 got from deleting `summarizeFulfillment`.

## Verified by machine

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | **19/19** |
| `pnpm -r test` | **1,716** tests, **zero** failures |
| `go test -short ./...` | **17/17** packages |
| `go build` / `go vet` / `gofmt` | clean |
| shop-mobile Android host tests | **107**, zero failures |
| shop-mobile iOS **main and test** compile | pass |
| `sm-guard` · `mobile-assets:check` | clean |
| `brand-check` · `check-no-emerald` · `check-no-jade` | clean |
| `cm-tokens-check` · `sm-tokens-check` | **unchanged** — this slice adds no design token |
| `terraform validate` | pass |
| Kotlin contract drift (`shop-contract:check`) | ⚠ will pass once committed; the generated files are new |

## Ten negative proofs — each done by breaking the thing

1. Revert one adoption site → the one-rule guard fails **naming the file:line**.
2. Change `availability.Predicate` once → cart, checkout, saved-items and storefront all fail together (**SC-012**).
3. Wire a manager-only shop gate → `authz.test.ts` fails (**FR-010**, the defect the analysis pass found in the task text).
4. Restore the old `toDomainError` reader → the api-client test fails.
5. Swap the shortfall and deduction statements → the ordering test fails.
6. Remove the un-flag guard → the pick-correction test fails.
7. Wire an admin route to the **shop** authorizer → the config-contract test fails (**Principle IV**).
8. Swap a metric's label name → the label test fails, naming what would silently match nothing.
9. `UPDATE` against `stock_movement` → the append-only guard fails, naming the file (**FR-008**).
10. Add `cached()` to a storefront read → the freshness guard fails (**FR-015a**).

## ✅ SC-003 — executed, and proven by breaking it

Docker came up at the end of the session and every container test ran.

`TestStock_TwoConcurrentPaymentsForTheLastUnitNeverDriveTheCountNegative` passes against real
PostgreSQL 16: two finalize transactions race for the last unit, the count never reads below zero,
both movements are recorded, and neither records a negative. **Removing `GREATEST(0, …)` from the real
statement makes the second payment violate `product_stock_on_hand_ck`** — so the floor is doing the
work, not the test's own arithmetic.

Also executed: the exactly-once proof, the without-the-floor proof, the untracked-produces-no-movement
proof, and the **57 previously-skipped** edge container tests (orders 33, customer 200, admin 204).

⚠ **Two Go packages still fail, and neither is this slice's**: `saveditems`
(`public.delivery_pricing_rule does not exist`, recorded under 033) and `platform/delivery`
(`column z.sameday_eligible does not exist`). Both error messages match what CLAUDE.md already records
verbatim, and neither package's tests were touched here.

## ⚠ What is NOT verified

- **No screen has been looked at by a person.** 039 shipped four live defects with a fully green suite,
  because layout, contrast and hierarchy are not properties a DOM assertion can see.
- **Nothing has run against a real database.** The migration has not been applied.
- **The alert is written and inert.** `infra/observability/alerts/054-product-inventory.yml` exists in
  the home 032 created for this, but the Prometheus/Grafana stack does not exist — nothing scrapes
  `core-api`'s `/metrics`. Until it does, an oversell is detectable only by querying
  `public.stock_movement`. Recorded in the plan's Complexity Tracking as a deviation from Principle VII.

## Four pre-existing defects found and fixed

1. **⚠ `DomainError.fields` was `undefined` on every refusal, on every surface, since the type existed.**
   `toDomainError` read `problem.fields`; `@effy/edge-shared`'s `problem()` serialises under `errors`.
   053 recorded it as latent; FR-016 could not be met around it. The package had **no tests at all**.
2. **shop-mobile's product detail tabs were decorative** — `DetailTabs()` hard-coded index 0, so
   Attributes, Media and Inventory did nothing. Inventory is now real; the other two are recorded, not
   silently widened.
3. **A comment in `edge-api/shop`** asserting pick rows "do not exist until picking begins" — true
   before this slice, false after it.
4. **`TestRailsCarryOnlyAvailableProducts` passed vacuously** once rails emptied; zero rails trivially
   contain no unavailable product.

## Five defects of my own, each caught before shipping

1. **The storefront filter/projection confusion.** Making the rule a *filter* on listings made
   out-of-stock products **vanish**, contradicting FR-013/A10 — and it would have broken FR-023 in the
   other direction. Three jobs, one rule: refuse (cart/checkout), project (search/detail), filter (rails).
2. **The shortfall computed after the deduction**, when the shelf already reads 0.
3. **`run { … }` in a ViewModel resolved to Kotlin's stdlib `run`**, so `load()` never published state.
4. **The pick correction fired on un-flagging**, zeroing a shelf on "it turned up after all".
5. **A metric declared `outcome` and called with `stage`** — which does not panic; it silently emits a
   series every alert querying `{stage=…}` misses.

Plus **027's R13 recurring**: the first contract draft used bare `number` and generated `Double`. The
drift guard could never have caught it — the generated file matched its source exactly.

## Open (18)

**Operator, in order:**
1. **Capture the SC-004 baseline** — the current proportion of picks ending in a shortfall. After
   deployment the pre-slice figure is unrecoverable and SC-004 becomes unprovable rather than unmet.
2. Commit (the migration must be committed before `db-up` — the 003 commit-guard), then `make db-up ENV=dev`.
3. `make edge-deploy SERVICE=inventory ENV=dev` and `SERVICE=shop ENV=dev`.
4. `make core-image-push && make core-deploy ENV=dev` — ⚠ **before** pushing to `dev`; Amplify
   auto-deploys the consoles on push, and 047 recorded that the reverse order briefly broke dev checkout.
5. ~~Start Docker and run the container tests.~~ ✅ **Done — SC-003 passes.**

**Walks:** quickstart §3–§7 (US1–US5), and §9 — *look at it*, on both shop surfaces, in light, **dark**
and large text, with shop-mobile on a tablet in landscape.

**Deliberately not marked done**: T062 (back-office attribution end to end — each link is proven, their
alignment needs one real assisted change), T043's live half, T053.
