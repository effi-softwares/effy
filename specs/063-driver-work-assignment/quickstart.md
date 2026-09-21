# Quickstart — Driver Work Assignment & Wave Planning (063)

How to prove this slice works. §1–§2 are machine-checkable; §3 onward need a person.

---

## §1 Machine verification — no cloud, no database

```bash
pnpm -r typecheck                                   # expect 20/20
pnpm --filter @effy/edge-fleet   test
pnpm --filter @effy/edge-driver  test
pnpm --filter @effy/edge-shared  test
pnpm --filter @effy/back-office  test
cd apis/core-api && go test ./internal/platform/delivery/...   # the cutoff side of the contract test
```

⚠ **`pnpm -r test` can be green while `typecheck` fails** — vitest does not run `tsc`. 029 recorded it,
059 hit it again. Run both, and check the package count.

---

## §2 Proofs that need real PostgreSQL

```bash
docker info >/dev/null 2>&1 || open -a Docker      # ⚠ must actually be up
CONTAINER_TESTS=1 pnpm --filter @effy/edge-fleet test
```

| # | Proof | Guards |
|---|---|---|
| C1 | Two planning passes in a row assign nothing twice | FR-005, SC-004 |
| C2 | Two *concurrent* passes — the partial unique index refuses the second | R6 |
| C3 | A package `picked_up` can be re-assigned in a later wave (the index is partial) | R6 |
| C4 | A driver cleared for every zone (`zone_id IS NULL`) is eligible in a zone created afterwards | FR-009 |
| C5 | Each hard gate excludes independently, and each writes its own reason | FR-009, FR-015 |
| C6 | A locked round survives a planning pass byte-for-byte | FR-032, SC-006 |
| C7 | Reassign to an ineligible driver is refused, naming the condition | FR-034, SC-005 |
| C8 | Capacity: a round is not assigned beyond `payload_kg` | FR-012 |
| C9 | Refrigerated goods reach only a capable vehicle | FR-011 |
| C10 | Load balancing picks the driver with fewest packages today; ties resolve stably | FR-014, SC-007a |
| C11 | A late-ready package joins an in-flight round when the stop is outstanding | FR-004a, SC-013 |
| C12 | …and waits when the stop is done, or when it would breach capacity or deadline | FR-004a/c |
| C13 | Hub check-in records arrival; a short count shows the discrepancy | FR-022, FR-026 |
| C14 | A standard package is checked in and appears in **no** delivery round | FR-024, SC-010 |
| C15 | Going off duty returns planned work but leaves collected work attributed | FR-035 |
| C16 | `updated_at` optimistic locking survives microsecond precision | 056's defect |
| C17 | A driver's route refuses another driver's round identically to a non-existent one | FR-038 |

### ⚠ C18 — the DST contract test, run in both languages

```bash
cd apis/core-api && go test ./internal/platform/delivery/ -run Contract
pnpm --filter @effy/edge-shared test -- deadline-contract
```

Both sides consume **byte-identical fixtures** including the day DST ends (02:30 occurs twice) and the
day it starts (02:30 does not exist). 058 found **two real calendar bugs** that only DST tests caught,
one of which silently skipped an entire trading hour. Research R2.

---

## §3 Database and deploy — operator, in this order

```bash
make db-status ENV=dev
make db-up ENV=dev                                  # one forward-only migration, additive
make edge-deploy SERVICE=fleet  ENV=dev             # ⚠ planner + dispatcher FIRST
make edge-deploy SERVICE=driver ENV=dev             # then the reader
git push origin <branch>:dev                        # Amplify rebuilds back-office
```

⚠ **`fleet` before `driver`.** `driver` serves work that `fleet` creates; deploying the reader first
gives a driver a route that answers an empty day, which is indistinguishable from "no work today".

⚠ The migration is **purely additive** — no column is dropped, nothing existing is rewritten. Unlike
061 and 062 it is safe to apply before the code deploy.

---

## §4 The walk — a person, with eyes, on a screen

⚠ **039 shipped four live defects with a fully green suite.** Nothing below is proven by any test above.

| # | Walk | Proves |
|---|---|---|
| W1 | Shop marks packages ready → wait for the wave → a cleared on-duty driver is given a round | US1, SC-001 |
| W2 | Open the driver app: what to do next is at the top, nothing was chosen | FR-017, SC-002 |
| W3 | Two shops in one zone appear in **one** round, same-shop packages adjacent | FR-019 |
| W4 | Stand a driver's licence down → they get no work, and the **reason is named** | FR-009, FR-015 |
| W5 | Make a zone nobody is cleared for have ready packages → it appears as unassigned **with a reason** | FR-028, SC-003 |
| W6 | Collect a shop's packages, check them in at the hub | US2, FR-022 |
| W7 | Check-in shows the same-day/standard split and asks the driver **nothing** | FR-023, SC-010 |
| W8 | A standard package's driver work **ends** at check-in — it is in no delivery round | FR-024 |
| W9 | Same-day packages at the hub become a delivery round, grouped by zone | US3, SC-009 |
| W10 | Dispatcher reassigns a round → new driver sees it, old driver does not | FR-029, FR-037 |
| W11 | ⚠ Dispatcher **locks** a round, waits for the next wave → it is untouched | FR-032, SC-006 |
| W12 | Dispatcher reorders stops → the driver sees the dispatcher's order | FR-031 |
| W13 | Dispatcher tries to assign to an ineligible driver → refused, **naming which condition** | FR-034, SC-005 |
| W14 | Dispatcher unassigns → the work is planned again next wave, not lost | FR-030 |
| W15 | A driver goes off duty mid-round → planned work returns, collected work stays theirs | FR-035 |
| W16 | ⚠ **A shop marks one more package ready while the van is en route** → it joins the round, and the driver is **told it was added** | FR-004a/b, SC-013 |
| W17 | Two eligible drivers, unequal loads → the lighter one gets the next round | FR-014, SC-007a |
| W18 | Dispatcher opens the day: what needs attention is findable without reading healthy work | FR-027, SC-008 |
| W19 | Light **and** dark, on a real console window | Principle V |

**⚠ W16 is the walk that proves the operator's decision.** Joining a round already under way is the
behaviour chosen over the simpler "wait for the next wave", and it is the one that can go wrong
invisibly — a round that grows silently under a working driver is worse than one that never grows.

**⚠ W5 is the most important walk overall.** SC-003 says no package is *ever* silently unhandled, and
that is the promise this whole slice rests on: the engine is allowed to fail to assign, and is not
allowed to fail quietly. 056's finding was a table written for a reader that never existed.

---

## §5 Negative proofs — executed by breaking the thing

Each is proven by making the break, watching the named guard fail, and reverting.

| # | Break | Must be caught by |
|---|---|---|
| NP1 | Drop the partial unique index | C2 |
| NP2 | Make the index total instead of partial | C3 |
| NP3 | Treat an eligibility condition as a weight rather than a filter | C5, C7 |
| NP4 | Let the planner overwrite a locked round | C6 |
| NP5 | Shift the TS deadline by one hour | C18 (Go side disagrees) |
| NP6 | Compute the deadline in UTC | C18 DST fixtures |
| NP7 | Count *outstanding* rather than *assigned today* for load | C10 |
| NP8 | Order stops in the driver service instead of the shared rule | a guard asserting one implementation (R5) |
| NP9 | Let a standard package into a delivery round | C14 |
| NP10 | Truncate `updated_at` to milliseconds | C16 |
| NP11 | Return another driver's round from a driver route | C17 |
| NP12 | Swallow an exclusion instead of recording it | C5, W5 |

⚠ **NP7 and NP12 are the two that leave a green suite and a feature that looks like it works.** A
mis-counted load still assigns work; a swallowed exclusion still produces a plan. Both need a test that
asserts the *reason*, not just the outcome.
