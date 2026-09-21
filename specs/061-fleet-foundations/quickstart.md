# Quickstart — Fleet Foundations (061)

How to run, prove and walk this feature. **Every step that touches AWS or the database is the
operator's** (CLAUDE.md mode of work); Claude authors, the operator applies.

**Prerequisites**: `AWS_PROFILE=ef`, the dev database reachable, Node 22 + pnpm, Go toolchain,
**Docker running** (container tests skip silently without it — see §2b).

---

## §1 Machine verification — no cloud, no database

```bash
pnpm -r typecheck                                   # expect 20/20
pnpm -r test                                        # expect exit 0
pnpm --filter @effy/edge-fleet test                 # vehicle domain + schema container tests
pnpm --filter @effy/back-office test                # console
pnpm --filter @effy/design-system test              # tokens:check MUST be UNCHANGED
make brand-check
scripts/check-no-emerald.sh && scripts/check-no-jade.sh
```

**Unchanged-suite proof** — these must pass **without their expectations being edited**, which is how we
know the feature added rather than altered:
`edge-admin` · `edge-customer` · `edge-shop` · `edge-orders` · `customer-web` · `shop-web`.

---

## §2 Proofs that need real PostgreSQL

```bash
CONTAINER_TESTS=1 pnpm --filter @effy/edge-fleet test
```

| # | Proof | Requirement |
|---|---|---|
| C1 | Two **concurrent** issues of one vehicle → exactly one succeeds | FR-012 |
| C2 | Two **concurrent** issues to one driver → exactly one succeeds | FR-013 |
| C3 | Closing odometer below opening → refused by the **database** | FR-018 |
| C4 | Duplicate plate among non-retired → refused; **same plate allowed once retired** | FR-006 |
| C5 | Plate uniqueness is **case-insensitive** (`abc123` vs `ABC123`) | FR-006 |
| C6 | Returning a holding frees both the vehicle and the driver | FR-012/13 |
| C7 | Retiring a vehicle leaves its holding history readable | FR-008 |
| C8 | `BLOCKED_REASONS` emits **every** applicable reason, not the first | FR-026 |
| C9 | A driver with an expired licence is reported blocked, naming the licence | FR-027 |
| C10 | A holder of a non-compliant vehicle is blocked, naming **the vehicle** | FR-027 |

### §2b ⚠ Docker must actually be up
058 was written with Docker down; its container tests ran afterwards and found **three** defects a fully
green suite had missed — including one that only appears on the **second** recompute. 059 shipped with 40
container tests never run at all. **If Docker is down, say so in the sign-off rather than reporting a
green suite.**

---

## §3 Database — operator

```bash
git add db/migrations/<ts>_fleet_foundations.sql && git commit     # 003 commit-guard
make db-up ENV=dev
make db-status ENV=dev
psql "$(AWS_PROFILE=ef infra/scripts/db-dsn.sh dev)" -f db/seeds/061_fleet_dev.sql
```

⚠ **DESTRUCTIVE**: the migration drops `driver.vehicle_type`, `driver.vehicle_plate`,
`driver.vehicle_registration_expires_on` and the three `driver_duty_session.last_location_*` columns.
Any values in them are discarded. The Down restores **shape only**.

---

## §4 Deploy — operator, in this order

```bash
make edge-deploy SERVICE=fleet  ENV=dev      # 1. vehicles + driver extensions
make edge-deploy SERVICE=admin  ENV=dev      # 2. shop address fields
make edge-deploy SERVICE=driver ENV=dev      # 3. duty change + location removal
# 4. push to `dev` — Amplify auto-deploys back-office
```

⚠ **`fleet` BEFORE the console.** The console reads vehicles; deploying it first gives an operator a
screen whose every call 404s. 056 recorded the same ordering for the same reason.

⚠ **`driver` LAST.** It removes a route. Deploying it before the others is harmless but pointless, and
it is the only step that takes something away — do it when the rest is known good.

---

## §5 The walk — a person, with eyes, on a screen

⚠ **039 shipped four live defects with a fully green suite**, because layout, contrast and hierarchy are
not properties a DOM assertion can see. **Nothing below is proven by any test above.**

| # | Walk | Proves |
|---|---|---|
| W1 | Add a vehicle of each body type; set one chilled, one frozen, one neither | US1, FR-001…004 |
| W2 | Add a driver-owned vehicle → confirm it behaves **identically** to an Effy-owned one | FR-005 |
| W3 | Set a registration expiry in the past → the register shows it non-compliant **and names registration** | FR-009 |
| W4 | Issue a vehicle with an opening odometer → the holder shows on **both** vehicle and driver | FR-010, FR-016/17 |
| W5 | Try to issue the same vehicle to a second driver → refused, **naming the current holder** | FR-014 |
| W6 | Try to give a second vehicle to the same driver → refused, **naming their vehicle** | FR-014 |
| W7 | Return it with a closing odometer → both free; the period appears in history with both readings | FR-011, FR-016 |
| W8 | Enter a closing odometer **below** the opening → refused, on the field | FR-018 |
| W9 | Retire a vehicle → gone from assignable, record and history still readable, assignment refused | FR-008, FR-015 |
| W10 | Set a driver's licence class and an expiry in the past → readiness names the licence | FR-021, FR-027 |
| W11 | Create a driver blocked for **several** reasons → **all** are listed | FR-026 |
| W12 | ⚠ A driver who **can** work does **not** appear in the readiness view at all | FR-028 |
| W13 | Clear an optional driver field, reload → **it stays cleared** | FR-022 |
| W14 | Change an emergency contact → history says the field changed, **not its value** | FR-024 |
| W15 | Record a shop address; leave one shop without → the gap is **visible**, not blank | FR-029/030 |
| W16 | Go on duty **with** an expected finish → back-office shows it | FR-032/034 |
| W17 | ⚠ Go on duty **without** one → back-office shows **"unknown"**, never a time | FR-033 |
| W18 | ⚠ **Stand down a driver holding a vehicle** → warned, told which vehicle, explicit decision | FR-019 |
| W19 | Sign in as a **csa** → can read everything, **no mutating control is visible** (absent, not disabled) | assumptions |
| W20 | Light **and** dark, on a real console window | Principle V |

**W18 is the most important walk.** 056's equivalent finding — standing a driver down could strand
physical goods permanently and invisibly — was in no register because nobody knew. The vehicle is the
same shape: it is in a carpark somewhere, and the platform must not quietly forget who has it.

---

## §6 Negative proofs — executed by breaking the thing

Each must be **performed**, not reasoned about. 057 records a guard that did not catch its own negative
proof, and 056 records one where the break was **not** caught and the guard had to be fixed.

| # | Break it | Expect |
|---|---|---|
| NP1 | Remove `vehicle_holding_open_vehicle_uq` → run C1 | C1 fails |
| NP2 | Remove `vehicle_holding_open_driver_uq` → run C2 | C2 fails |
| NP3 | Drop the odometer CHECK → run C3 | C3 fails |
| NP4 | Make the plate index non-partial → run C4 | C4 fails |
| NP5 | Make the plate index case-sensitive → run C5 | C5 fails |
| NP6 | Return only the first blocked reason → run C8 | C8 fails |
| NP7 | Add a `/fleet/v1/*` route with no authorizer | the contract test fails **naming it** |
| NP8 | Re-add a `location` path to `edge-driver` | the negative route guard fails |
| NP9 | Put `addressLine1` on a customer-facing payload | the hidden-fulfilment guard fails |
| NP10 | Add `latitude` to `shop` or `vehicle` | the no-coordinates guard fails |
| NP11 | Default `expectedEndAt` to a shift length when null | the "unknown" test fails |
| NP12 | Drop a `DriverBlockedReason` key from the console's label map | the enum-completeness test fails |

⚠ **NP11 and NP12 are the two that leave a green suite and a feature that looks like it works** — the
shape 059 flagged for its own NP7/NP8. NP11 silently invents a fact; NP12 renders a blocked driver with a
blank reason, which reads as "not blocked".

---

## §7 Sign-off

Not done until: §1 green · §2 green **with Docker up** · §5 walked by a person · §6 all twelve executed ·
`tokens:check` **unchanged** · the unchanged-suite proof holds · parity register
[docs/audiences/driver-capabilities.md](../../docs/audiences/driver-capabilities.md) updated with §061.
