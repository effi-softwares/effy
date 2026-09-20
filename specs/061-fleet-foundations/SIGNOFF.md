# Sign-off — 061 Fleet Foundations

**Date**: 2026-09-20 · **Status**: 🚧 **CODE-COMPLETE AND MACHINE-VERIFIED, INCLUDING AGAINST REAL
POSTGRESQL. NOT DEPLOYED, NOT COMMITTED, NOT WALKED BY A PERSON.**

Slice A of four ([docs/logistics-engine-architecture.md](../../docs/logistics-engine-architecture.md)).
**98 of 105 tasks.** **Every build task is done.** The 7 remaining are operator steps and the walk —
the checks only a person can perform.

---

## What was built

Effy can now **describe its fleet**. It still assigns nothing — no task, round, dispatch or routing
concept exists anywhere in this slice (FR-037), and that is deliberate: this makes the vocabulary the
dispatch slice will speak.

| | |
|---|---|
| **Migration** | `db/migrations/20260920143000_fleet_foundations.sql` — `vehicle`, `vehicle_holding`, licence class, `expected_end_at`, five shop address columns, **six columns dropped** |
| **Service** | `apis/edge-api/fleet` — vehicle + holdings domains, **12 → 19 handlers** |
| **Also touched** | `edge-admin` (shop address, **zero new functions**), `edge-driver` (duty + one removal) |
| **Console** | vehicle register, detail, create, edit, status, issue/return, handover history; driver + shop screens extended |
| **Seeds** | `db/seeds/061_fleet_dev.sql` — 10 vehicles covering every body type and both refrigeration capabilities |

---

## Verified

```
pnpm -r typecheck                          20/20
pnpm -r test                               exit 0
CONTAINER_TESTS=1 edge-fleet               95 tests, 9 files — against real PostgreSQL 16
tokens:check                               UNCHANGED   (this slice adds no token)
check-no-emerald / check-no-jade           pass
brand-check                                pass
banned-address sweep                       clean
```

**Unchanged-suite proof** — these passed with their expectations **unedited**, which is how we know
this slice added rather than altered: `edge-customer` **170**, `edge-shop` **358**, `edge-orders`
**16**, `edge-auth` **151**, `edge-notifications` **43**, `customer-web` **463**, `shop-web` **440**.

Counts that moved, all additions: `edge-fleet` 47 → **61** (+34 container = **95**), `back-office`
174 → **195**, `edge-admin` 191 → **193**.

### The ten container proofs, against real PostgreSQL
| | Proof |
|---|---|
| C1 | ⚠ **two CONCURRENT issues of one vehicle → exactly one succeeds**, asserted on the constraint name |
| C2 | ⚠ **two CONCURRENT issues to one driver → exactly one succeeds** |
| C3 | closing odometer below opening → refused **by the database** |
| C4 | duplicate plate refused; **the same plate accepted once the first is retired** |
| C5 | plate uniqueness is case-insensitive |
| C6 | returning a holding frees **both** the vehicle and the driver |
| C7 | retiring preserves the handover history |
| C8 | ⚠ **every** applicable blocked reason, not the first found |
| C9 | an expired licence is reported, naming the licence |
| C10 | a non-compliant vehicle blocks its holder — and **not** for a licence reason |

C1 and C2 issue both inserts without awaiting the first, so they genuinely race.

### Twelve negative proofs, each executed by breaking the thing and reverting
| | Break | Caught |
|---|---|---|
| NP1 | remove the open-vehicle unique index | ✅ |
| NP2 | remove the open-driver unique index | ✅ |
| NP3 | drop the odometer CHECK | ✅ |
| NP4 | make the plate index blanket-unique | ✅ |
| NP5 | make the plate index case-sensitive | ✅ |
| NP6 | return only the first blocked reason | ✅ 2 tests |
| NP7 | add a `/fleet/v1/*` route with no authorizer | ✅ names `vehiclesListV1` |
| NP8 | re-add a `location` route to `edge-driver` | ✅ |
| NP9 | leak `addressLine1` into a customer service | ✅ |
| NP10 | add `latitude` to `shop` / `vehicle` | ✅ both `ALTER` and inline forms |
| NP11 | default `expectedEndAt` to a shift length | ✅ 2 tests |
| NP12 | drop a blocked-reason label key | ✅ 3 tests **and** a compile error |

⚠ NP11 and NP12 are the two the plan flagged as otherwise leaving a green suite and a feature that
looks like it works.

---

## ⚠ Defects found while building

**1. A live-only defect the container test caught immediately.** `readiness/repository.ts` still read
`d.vehicle_registration_expires_on`, a column this migration drops. It **typechecks perfectly** and
fails only against a real database. The fix is better than the original: a registration expiry is a
fact about a **vehicle**, not a person — it sat on the driver row only because vehicles had no table,
which meant two drivers sharing a van kept two hand-maintained copies of one date. It now reads
through the open holding, so the warning names whoever would actually be stopped at the roadside.

**2. I nearly shipped a second definition of one fact.** I wrote `export type AustralianState` into
`shop.ts`; `delivery.ts` has owned it since 047. The barrel re-export caught it at compile time. This
is the shape the constitution names for the palette and this repo has shipped five defects through.

**3. The seed refused to load, and the refusal was right.** A tray ute was seeded with
`load_volume_litres = 0` against `CHECK (> 0)`. A ute has **no enclosed load space** — that is NULL,
not zero. Storing 0 would let a capacity filter treat "not applicable" as a measured value. Found by
applying the migration and seed to a throwaway PostgreSQL container, not by reading them.

**4. A task was ticked without being done.** T002 (`mkdir`) was marked `[X]` and never ran; a later
heredoc failed with "no such file or directory". Recorded because a task ticked without being done is
the failure mode this repo keeps finding.

**5. The seed was about to depend on shop codes I could not verify.** The first draft addressed shops
by `code = 'SHOP-ONE'`. Dev shops were created by hand through the console, so those codes are
operator-chosen and a wrong guess makes the `UPDATE` match nothing and **silently do nothing** — the
seed reports success, the walker finds no addresses, nothing says why. Rewritten to address the
oldest addressless active shops by position.

---

## ⚠ One finding worth carrying forward

**T015's enum audit came back better than the risk register assumed.** Widening `DriverBlockedReason`
is caught **at compile time**: `BLOCKED_LABEL` is `Record<DriverBlockedReason, string>`, and tsc named
both missing keys. Unlike 053, 056 and 057, this path cannot fail silently. NP12's runtime test still
ships, guarding against someone loosening the type to `Record<string, string>` during a refactor.

---

## Open — 7 tasks, all operator

**Nothing machine-verifiable remains.**

**Operator**, in this order:
1. **Commit the migration**, then `make db-up ENV=dev` (003 commit-guard). ⚠ **DESTRUCTIVE** — drops
   `driver.vehicle_type/_plate/_registration_expires_on` and `driver_duty_session.last_location_*`.
2. `psql "$(infra/scripts/db-dsn.sh dev)" -f db/seeds/061_fleet_dev.sql`
3. `make edge-deploy SERVICE=fleet ENV=dev` — ⚠ **before the console**, or every screen 404s
4. `make edge-deploy SERVICE=admin ENV=dev`
5. `make edge-deploy SERVICE=driver ENV=dev` — last; it is the step that removes a route
6. Push to `dev` (Amplify deploys the console)
7. **Walk W1–W20** from [quickstart.md](quickstart.md) §5

⚠ **NOBODY HAS LOOKED AT ANY SCREEN.** 039 shipped four live defects with a fully green suite, because
layout, contrast and hierarchy are not properties a DOM assertion can see. **W18 is the most important
walk** — stand down a driver holding a vehicle and confirm the refusal names it.

**Pre-existing, not caused by this slice**: `driver-contract:check` is red at clean HEAD (stale
`ProblemJSON` and `DriverRunType` drift from 055). Verified by stashing. The generated Kotlin was
deliberately **not** regenerated here, so `apps/driver-mobile` compiles exactly as it did before.
