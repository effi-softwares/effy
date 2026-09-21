# Sign-off — 064 Driver Proof of Delivery & Custody

**Date**: 2026-09-21 · **Status**: 🚧 **78/86 — CODE-COMPLETE AND MACHINE-VERIFIED. NOT DEPLOYED, NOT
COMMITTED, NOT WALKED BY A PERSON.**

## What this slice changed that was not true before

**A same-day order can now reach `delivered` by the hand of the driver who delivered it.**

Before 064 the only writer of `shop_fulfillment.status = 'delivered'` anywhere on the platform was
`apis/edge-api/orders/src/arrival/repository.ts` — 053's **back-office manual arrival** path, built
for standard carrier packages. `edge-api/driver/src/work/delivery.ts` said so in its own comment:
*"`delivered` is NOT reachable here: completing a drop requires proof (D16), which is Slice D."*
A delivery could only be completed by an admin asserting it happened.

Also now true, and not before:

- A driver who **cannot** complete a drop can say so. The screens have existed since 060; the
  platform had nothing behind them, so the only options were to mark it delivered falsely or leave it
  open for ever.
- Back-office can **read** delivery exceptions. 056 built that reader because the app was "recording
  exceptions for a reader that does not exist"; 063's teardown dropped the tables from under it,
  leaving neither a writer nor a reader.
- A collection round **keeps outstanding work until the load is checked in at the hub**.
- The platform can state **who is holding any package, and since when**.

## Built

| Layer | What |
|---|---|
| Migration | `20260921215440_driver_proof_custody.sql` — `delivery_proof`, `delivery_attempt_failure`, 8 constraints |
| `edge-driver` | `src/proof/` (sql · types · repository · service) + 3 routes + S3 env and IAM it never had |
| `edge-fleet` | `src/exceptions/` + `src/dispatch/custody.ts` + 3 routes |
| `edge-shared` | **3 Principle II promotions**: `proof-prefix`, `load-migrations`, `custody` |
| `back-office` | `features/exceptions/` — table screen, route, nav |
| `driver-mobile` | proof wiring, contactless-with-photo, hub stop, `code` path removed |
| Infra | S3 lifecycle (archival), `DriverPackagesHeldOvernight` alarm |

## Verified

`pnpm -r typecheck` **20/20** · edge-driver **95** (was 33) · edge-fleet **196** (was 187) ·
edge-shared **131** (was 126) · back-office **230** (was 220) · shared-types 7 ·
driver-mobile Android + **iOS main AND test** compile, host tests green ·
`terraform validate` + `fmt` clean · driver contract regenerates byte-stable.

**All container tests ran** — Docker was up, which it had not been for 052, 057, 059 or 063.

### Negative proofs, each executed by breaking the thing

| # | Break | Caught by |
|---|---|---|
| 1 | Remove the `package_arrival` write | **3** tests, incl. "tells the shopper the order arrived" |
| 2 | Announce delivery on the drop id (053's defect) | 2 tests — the mixed order speaks |
| 3 | Widen the method CHECK to admit `code` | the FR-003 deferral test |
| 4 | Point the S3 lifecycle filter at the bucket root | 2 assertions |
| 5 | Switch the archive tier to `DEEP_ARCHIVE` | the storage-class assertion |
| 6 | Add an `expiration` block | the never-expires assertion |
| 7 | Stop excluding the hub stop from the run detail | the identity-less-row test |

## Defects found while building

**Mine, caught before shipping**

1. ⚠ **Every "left at the door" would have been filed as a customer signature.** `completeWithMedia`
   mapped `if (method == PHOTO) Photo else Signature`. Harmless while two methods reached it; silently
   wrong the moment contactless did. The backend **accepts** it — signature + media is valid proof —
   so nothing would have failed anywhere. Now an exhaustive `when`.
2. ⚠ **The hub would have rendered twice** once the backend sent it as a real item, because
   `UpNextList` still drew its synthetic `HubRow` from `hubName`.
3. ⚠ **The hero card would have said "CURRENT STOP / Collect" for the hub** — telling a driver to
   collect from the hub they are about to hand the load to. It derived chrome from `phase`, which was
   fine while every item was a stop.
4. ⚠ **An alarm with no producer.** `DriverPackagesHeldOvernight` referenced a metric nothing emitted.
   Wired to the **scheduled planner**, not the custody read — an alarm fed by a dispatcher opening a
   screen is silent exactly when nobody is looking.
5. I duplicated `DeliveryFailureReason`, which already existed (`tsc` caught it); put
   `PROOF_MEDIA_PREFIX` in a package the consuming service cannot import; and wrote a `changeId` test
   that asserted something untrue about PostgreSQL (deleting a row removes the unique index's witness,
   so the replay legitimately succeeds).

**Pre-existing, found by running things**

6. ⚠ **`edge-orders`' refund container tests are BROKEN AT HEAD, and this slice did not cause it.**
   `refunds.container.test.ts` mocks `@effy/edge-shared` with a factory that does **not** spread
   `actual`, so `proposedRefunds` — which `refunds.ts:98` re-exports from the shared package — is
   `undefined`, and 14 tests fail with *"proposedRefunds is not a function"*. `git diff HEAD` shows no
   change from 064 in that service. It has gone unnoticed because **Docker has been down for several
   slices**, so these tests never ran. **NOT FIXED — out of scope, reported.**
7. `history()`'s `drops` array was hardcoded `[]`, so `HistoryDropRow.proofCaptured` has existed on
   the contract since 049 and never carried a value. Now populated.
8. ⚠ **Driver telemetry has no call sites.** Only `ScreenViewed` is ever emitted; `DutyToggled`,
   `HubCheckedIn`, `DropCompleted` and the rest are declared, documented and fired by nothing — since
   049/050. 064 did not fix it (wiring an analytics driver through the ViewModels is its own change)
   but recorded it in `AnalyticsEvent.kt` so the next reader does not assume those dashboards have
   data. 050 recorded the same shape on customer-web, where `capture()` was a no-op for eleven slices.

## Decisions worth knowing

- ⚠ **`code` proof is DEFERRED, not built** (FR-003, amended during planning). No delivery code exists
  anywhere — `delivery_code` appears in no service, migration, contract or app — so verifying one
  would compare a value to itself. Refused by name at the service **and** excluded by the database
  CHECK, so neither half can drift into accepting it alone. `ProofMethod` keeps `"code"` on the wire
  because the method is coming.
- ⚠ **Contactless now requires a photograph** (FR-002). This reversed the app's existing one-tap
  contactless flow: an unattended drop is the case most likely to become a dispute. The method still
  records that nobody took it in hand.
- ⚠ **Proof media is ARCHIVED, NEVER DELETED** (operator direction, reversing the settled 90-day
  deletion). Glacier Instant Retrieval at 90 days — API-identical, millisecond reads, **zero code**. A
  colder tier saves ~$0.11/month and would fork every read path with an async restore.
- ⚠ **The reversal REMOVED scope**: a shared retention module, a derived "has this expired?" answer on
  three read paths, and the test keeping that derivation in step with the Terraform number all ceased
  to exist.
- ⚠ **A near-miss recorded**: while retention was time-limited the rule would have been an
  `expiration` — and versioning is enabled on that bucket, where `expiration` writes a delete marker
  and the object persists. The platform would have reported every photograph deleted while all of them
  remained in S3, passing `terraform validate` and every test.
- **Custody is derived, never stored** (027's counted-not-stored rule, fifth application).

## Open — 8 tasks

**Two authoring tasks**: T078 (parity register) and this file (T079).

**Six operator tasks**, in this order:

1. `make db-up ENV=dev`
2. ⚠ `make edge-deploy SERVICE=fleet ENV=dev` **BEFORE** `SERVICE=driver` — fleet creates the hub
   stop, driver serves it. The reverse gives a driver a round whose final stop does not exist, which
   looks exactly like the defect this slice fixes.
3. `make edge-deploy SERVICE=driver ENV=dev`
4. `make apply ENV=dev` — the lifecycle configuration and both alarms
5. `git push` (Amplify deploys back-office); rebuild driver-mobile in Xcode
6. **Walk W1–W14** in [quickstart.md](quickstart.md)

⚠ **W1 is the walk that matters most** — the first time in this platform's history that a delivery can
be completed by the driver who made it.
⚠ **W12 cannot be faked**: an archive nobody has read back is an assumption, not an archive.
⚠ **Nobody has looked at any screen.** 039 shipped four live defects with a fully green suite, and
063 shipped a scheduled handler that never ran once.

## Known-red, not caused by this slice

- `edge-orders` refund container tests (item 6 above).
- `make check-no-phantm` fails on **specs 042/045/050 prose**, as CLAUDE.md already records. 064's own
  artifacts are clean — its only matches are the words "check-no-phantm" in task text.
- ⚠ **`pnpm -r test` with `CONTAINER_TESTS=1` is flaky under parallelism** — every package starts its
  own PostgreSQL and they contend. Two full runs failed in *different* services; each failing file
  passed in isolation. Run per-package when it matters.
