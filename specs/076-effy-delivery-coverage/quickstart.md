# Quickstart: Effy Delivery Coverage (076)

Contracts: [contracts/routes.md](contracts/routes.md) · Data: [data-model.md](data-model.md) ·
Why: [research.md](research.md).

## Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/shared-types test
TESTCONTAINERS_RYUK_DISABLED=true CONTAINER_TESTS=1 pnpm --filter @effy/edge-shared test
TESTCONTAINERS_RYUK_DISABLED=true CONTAINER_TESTS=1 pnpm --filter @effy/edge-admin test
for s in commerce customer storefront fleet; do pnpm --filter @effy/edge-$s test; done
pnpm --filter back-office test && pnpm --filter customer-web test
(cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest)
make validate ENV=dev
docker ps -aq --filter label=org.testcontainers=true | xargs -r docker rm -f
```

Proofs — each broken once to see it fail:

| # | Proves | Spec |
|---|---|---|
| P1 | The migration changes coverage for **no** postcode: `serviceableForPostcode` for every postcode before = after (disabled zones' postcodes were not served before either) | FR-029, SC-002 |
| P2 | Every listed postcode has a distance; the migration raises if one cannot | FR-007, SC-006 |
| P3 | `coverage_for_postcode` returns each of the five reasons for its case | FR-019 |
| P4 | Removing a group leaves its postcodes listed and `effy` | FR-015 |
| P5 | Deleting a `delivery_zone` row does **not** delete postcodes (FK is SET NULL) | FR-015 |
| P6 | A hub move recomputes every `computed` distance, leaves every `manual` one, flags them, returns the counts | FR-012, SC-007 |
| P7 | A pre-076 postcode quotes the **same fee** before and after the migration | FR-032 |
| P8 | A postcode added after the migration, grouped or not, quotes a fee (tier by distance) and offers same-day | FR-032 |
| P9 | The courier switch cannot be turned on (`courier_ordering_unavailable`) | Assumption 1 |
| P10 | The refusal sentence exists in one file; no other customer surface or service contains the old wordings | FR-022, SC-004 |
| P11 | No customer DTO has a group, distance, reason or hub field | FR-023, SC-010 |
| P12 | No SQL outside the allowed files joins `delivery_zone_postcode` to decide coverage | FR-020 |
| P13 | A csa can read and cannot write any coverage route | FR-026 |
| P14 | Every write leaves an audit row with before and after | FR-027 |
| P15 | Changing a `shop_sameday_exception` or any shop column changes `coverage_for_postcode` for nothing | FR-024, SC-008 |
| P16 | The address answer, the storefront answer and the quote answer agree for a table of postcodes | FR-020, SC-003 |

## Operator steps

```sh
make db-up ENV=dev                               # read the NOTICE lines: postcodes removed with
                                                 #   disabled zones, and manual distances to review
make edge-deploy SERVICE=storefront ENV=dev      # ┐ readers first — they understand both the old and
make edge-deploy SERVICE=commerce ENV=dev        # │ the new shape
make edge-deploy SERVICE=customer ENV=dev        # ┘
make edge-deploy SERVICE=admin ENV=dev           # staff gateway: the 11 old routes go, 12 arrive
make plan ENV=dev && make apply ENV=dev          # live.tf: kind `coverage`
make gateway-usage ENV=dev                       # staff 145
# push to dev: back-office, customer-web. Build customer-mobile.
```

⚠ Deploy `admin` and build back-office close together: the old Zones tab calls routes the new `admin`
no longer has.

## Walks (dev)

| # | Do | Expect |
|---|---|---|
| V1 | Back-office → Delivery → Coverage | Every postcode served yesterday is listed, in a group named after its old zone, with a distance. No Zones, Rings or same-day-exception control anywhere. |
| V2 | Add → search "Richmond" | Several results told apart by state and postcode; pick one; see the places it brings; add. Under a minute, no postcode or distance typed. |
| V3 | Add a postcode with no known location | A distance is demanded; after adding, the row says "entered by hand". |
| V4 | Check a listed postcode, an unlisted one, a made-up one | Effy + group + distance · "courier delivery is switched off" · "not a known postcode". |
| V5 | As a customer (web, then mobile): add an address in a listed postcode, then one that is not | "Delivered by Effy" · the refusal sentence — the same words at the address and at checkout. |
| V6 | Remove a postcode that has a delivered order | The order is unchanged; a new address there is refused. |
| V7 | Create a group, move postcodes in, rename it, remove it | The postcodes stay listed throughout; the customer answer never changes. |
| V8 | Try to switch courier delivery on | Refused, with a sentence saying courier ordering is not available yet. Add and remove an exclusion. |
| V9 | Change the hub point slightly in Settings | "41 distances recalculated, 2 hand-entered ones flagged"; put it back. |
| V10 | With Coverage open in two windows, add a postcode in one | It appears in the other by itself. |
| V11 | As a csa | Everything visible; no add, remove or edit control. |
| V12 | Place a same-day order to a pre-076 postcode and to a newly added one | Both sell and are planned as today (the new one needs a driver cleared for its group, or for every zone). |
