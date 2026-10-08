# Sign-off: 076 — Effy Delivery Coverage

**Status (2026-10-08)**: **migrated, deployed to dev and committed (`f649fac3`). Checked live by
machine (below). NOT walked by a person** — the walks V1–V12 in [quickstart.md](quickstart.md) are the
one thing left. 58/58 tasks; two carry a recorded note (below).

## Checked live in dev (2026-10-08, after the operator's deploys)

| Check | Result |
|---|---|
| `make edge-health ENV=dev` | all eleven services live and ready, on both gateways |
| `make gateway-usage ENV=dev` | shared 158 / 300 (53%) · staff 145 / 300 (49%) — as predicted |
| Staff gateway's delivery routes | the twelve `…/delivery/coverage…` routes are present; the eleven zone, tier-edit and exception routes are gone |
| Public delivery check | a listed postcode answers `coverage: "effy"`; an unlisted and an unknown one answer `"none"` (courier delivery is off, as designed until E5) |

The last row also shows the migration ran: the answer comes from `coverage_for_postcode`, which only
it creates.

## What changed

- **One list of postcodes Effy delivers to.** Being on it is the only thing that makes an address
  "Delivered by Effy". The existing tables were evolved in place: `delivery_zone_postcode` is the list,
  `delivery_zone` an optional group. Every listed postcode has a distance from the hub, worked out by
  the database or entered by hand.
- **One answer per address** — Effy, courier, or cannot deliver — decided by one database function
  (`public.coverage_for_postcode`) and read by the address book, the storefront check, the checkout
  quote and the staff checker.
- **One refusal sentence** — "Sorry, we can't deliver to this address." — in one file, shown by the
  server, the website and the app. The two older wordings are gone.
- **Back-office → Delivery → Coverage** replaces the Zones and Rings tabs: the list with search and
  filters, add places by name, a postcode checker, groups, per-postcode distance, courier reach.
- **Removed**: creating distance tiers, creating/editing zones, ring suggestion, per-shop same-day
  exceptions, the old postcode check — eleven admin routes and four dialogs.
- **Customers** see who delivers beside each saved address (web and mobile) and the one sentence at
  checkout.
- **A hub move** recalculates every worked-out distance in the same save, leaves hand-entered ones
  alone, flags them, and says how many.
- **Courier delivery** has a switch and an exclusions list; the switch cannot be turned on yet.

## The numbers

| | Before | After |
|---|---|---|
| `admin` routes | 71 | 72 (−11, +12) |
| Staff gateway | 144 / 300 | 145 / 300 (49%) |
| Shared gateway | 158 / 300 | 158 / 300 — no customer route added |

## Verified by machine

All backend suites were run **with containers** (real PostgreSQL, the real migration chain).

| Check | Result |
|---|---|
| `pnpm -r typecheck` | clean |
| edge-shared | 706 passed (incl. coverage migration + decision 14, coverage guards 16) |
| edge-admin | 213 passed (incl. coverage console 27) |
| edge-commerce · edge-customer · edge-storefront | 297 · 221 · 180 passed |
| edge-fleet · edge-driver · edge-orders | 288 · 177 · 95 passed |
| edge-shop | 476 / 478 — the same two failures recorded under 073 and 074 (attention recipients, order paging); neither touches delivery |
| inventory · catalog · notifications · auth · live · ops | 64 · 43 · 64 · 151 · 41 · 22 passed |
| shared-types (incl. the Kotlin words mirror and live-kind mirror) | 73 passed |
| back-office (incl. Coverage 13) | 310 passed |
| customer-web (incl. CoverageNote 4) | 617 passed |
| customer-mobile host tests · `compileKotlinIosSimulatorArm64` | passed · clean |
| `terraform validate`, `fmt -check` (dev) · `check-no-refresh-timers.sh` · design-system guards | clean · OK · OK |
| gateway capacity | shared 158 / 300, staff 145 / 300 |

**Proofs broken once and caught**:

| Proof | Broken by | Caught by |
|---|---|---|
| P1 nobody gains or loses delivery | the migration also deleting an ACTIVE zone's postcode | P1 (+ P7, P2) |
| P3 the five answers | an excluded postcode still answered "courier" | P3 |
| P4 a removed group keeps its postcodes | `removeGroup` deleting them | P4 |
| P5 deleting a group row keeps its postcodes | leaving the foreign key as CASCADE | P5 |
| P6 a hub move leaves hand-entered distances | recalculating every row | P6 — **after the test was strengthened** (see Findings) |
| P7 nobody's fee tier moves | tiering every postcode by distance | P7 (both forms) |
| P9 courier cannot be switched on | marking courier ordering available | P9 |
| P10 one refusal sentence | restoring the old wording in `CheckoutFlow.tsx` | P10 |
| P11 customer contracts carry no reason | a `distanceKm` field on `AddressDTO` | P11 |
| P12 one place decides | a new SQL reader of the list in `storefront` | P12 |
| P14 every change is audited | skipping the audit row on add | P14 |
| P16 the three answers agree | a second rule in `serviceableForPostcode` | P16 (+ P1) |

**Not broken by mutation** (covered by passing tests only): P2's backfill split, P8, P13, P15.

## Findings while building

- ⚠ **I deleted the admin service's whole `resources:` section** (its four CloudWatch alarms) while
  removing the eleven old routes: the script that cut each function block ran on past the last one.
  `background-alarms.contract.test.ts` caught it in the full run. Restored from git and verified:
  exactly the eleven functions are gone, twelve are added, and the `resources:` section is
  byte-identical to before.
- ⚠ **The hub-move test could not fail.** Its only hand-entered distance was on a place with no
  location, so a recalculation that wrongly included hand-entered rows had nothing to overwrite. Found
  by breaking it; the test now has a hand-entered distance on a locatable place.
- ⚠ **Today, deleting a zone deletes every postcode in it** (`ON DELETE CASCADE`). Nothing in the
  console did that, but it was one statement away. Now `SET NULL`.
- ⚠ **A fleet test fixture had to name the distance column, which that service is forbidden to
  mention** (`no-location.guard.test.ts`: the planner sequences by order and distance must never
  creep back as a tie-break). The guard is right. The fixture now lists a postcode through
  `LISTED_POSTCODE_FIXTURE_SQL` in the shared test support — which my own P12 guard then flagged as a
  new reader of the list's table, and which is now on its allow-list with the reason.
- **`delivery_zone.sameday_eligible` defaults to true now**; one test fixture relied on the old default.
- **The storefront has no "do you deliver to me?" island** — the comment in `page.tsx` is vestigial and
  nothing on the website calls the serviceability route. The route is updated (released mobile builds
  and future use); no web change was needed (T026).
- **A mobile test pinned the old refusal words** and failed when they changed — the right failure.

## Deviations from the plan

| Task | What differs |
|---|---|
| contracts | **Twelve** new admin routes, not thirteen: a distance change rides on `PATCH …/postcodes`. Net +1 on the staff gateway. |
| T002 | `coverage` is optional (`coverage?:`) on the three customer DTOs, like 074's `points?` — additive for released clients; a 076 server always sends it. |
| T021 | The Kotlin generator emits types, not constants. The app's words are a hand-written mirror (`CoverageWords.kt`) held to the source by `coverage-words.test.ts` — the pattern `LiveKind.kt` already uses. |
| T017 | No fleet or driver SQL changed: every reader already LEFT JOINs the group. |
| T026 | Not applicable (see Findings). |
| R9 | The storefront answer maps a `courier` result to `none` while courier ordering is unavailable, in addition to the admin lock. |

## ⚠ A limitation this feature leaves (removed by E8)

Driver clearances are granted per group, or for everywhere. **A postcode in no group can only be
delivered by a driver cleared for everywhere.** The Coverage screen shows how many drivers can deliver
to each group and to ungrouped postcodes, and asks for confirmation before leaving postcodes with none
— but it does not stop a later change on the Drivers screen from doing the same. The existing
unplanned-work alarm is the backstop.

## Not verified

- **No person has walked it.** No staff member's use of the Coverage tab and no customer's sight of
  the new sentence is recorded here; V1–V12 cover both, and V10 (two open Coverage tabs updating each
  other) can only be seen on screen.
- The migration ran in dev without stopping, so every listed postcode got a distance. Which postcodes
  it removed (disabled zones) or flagged for review was printed in its NOTICE lines and is not
  recorded here; flagged ones show under "needs review" on the Coverage tab.
- The dev seed (`db/seeds/047_delivery_dev.sql`) was updated for the new columns and not re-run.

## Operator steps (done 2026-10-08)

```sh
make db-up ENV=dev                               # ⚠ read the NOTICE lines (removed + to-review postcodes)
make edge-deploy SERVICE=storefront ENV=dev      # ┐ readers first: they need the migration, and
make edge-deploy SERVICE=commerce ENV=dev        # │ nothing else
make edge-deploy SERVICE=customer ENV=dev        # ┘
make edge-deploy SERVICE=admin ENV=dev           # eleven old routes go, twelve arrive
make plan ENV=dev && make apply ENV=dev          # live.tf: kind `coverage` (expect only that alarm set to change)
make gateway-usage ENV=dev                       # staff 145, shared 158
# push to dev → back-office and customer-web build. Build customer-mobile.
```

⚠ Deploy `admin` and let back-office build close together: the old Zones tab calls routes the new
`admin` no longer has.

⚠ `fleet`, `driver`, `orders`, `shop` need no redeploy: their code did not change.

⚠ Between `make db-up` and the `admin` deploy, the OLD console's "Add postcode" fails (it sends no
distance, which the list now requires). Do not edit zones in that window; it is a failed click, not
bad data.

Then walk V1–V12 in [quickstart.md](quickstart.md).
