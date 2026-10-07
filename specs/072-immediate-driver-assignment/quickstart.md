# Quickstart: Immediate Driver Work Assignment (072)

How to prove the feature works. Contracts: [contracts/routes.md](contracts/routes.md). Data:
[data-model.md](data-model.md).

## Machine checks (Claude runs these)

```sh
pnpm -r typecheck
pnpm --filter @effy/edge-shared test          # eligibility startAt, nextRunInstant + DST fixtures
pnpm --filter @effy/edge-fleet test           # planner units + container tests on the real migrations
pnpm --filter @effy/edge-driver test          # the gate, the guard, the multi-round today read
pnpm --filter @effy/shared-types driver-contract:check
pnpm --filter back-office test
scripts/check-no-refresh-timers.sh
(cd apps/driver-mobile && ./gradlew :shared:testAndroidHostTest)   # plus an iOS simulator test compile
terraform -chdir=infra/envs/dev validate
```

Container tests that must exist and pass, each proven by breaking the code it covers:

| # | Proves | Spec |
|---|---|---|
| C1 | A package ready hours before its run is assigned on the next pass | SC-001 |
| C2 | A hub-side package hours before its window is assigned on the next pass | SC-002 |
| C3 | Three passes for one run leave one round, with all packages | SC-005 |
| C4 | Capacity and stop count are judged over the whole accumulated round | FR-017 |
| C5 | A driver coming on duty later takes nothing from the first driver | SC-006 |
| C6 | A package after the last run gets tomorrow's run instant as its deadline | SC-009 |
| C7 | Every progressing route answers 409 `round_not_open` before opening and writes nothing | SC-004 |
| C8 | The same routes succeed once the opening time has passed | FR-023 |
| C9 | Changing `planning_lead_min` moves the opening time of an existing round | FR-014 |
| C10 | A driver off duty loses a planned round; collected packages stay theirs | FR-034 |
| C11 | A locked round is neither added to, released nor cancelled | FR-019 |
| C12 | Deleting a run cancels its unbegun rounds and the packages move to the next run | FR-014 |
| C13 | Ten passes over an unassignable package leave one set of reasons and no wave rows | SC-007 |
| C14 | Reassigning a chilled round to a van that cannot carry chilled is refused | SC-008 |
| C15 | `today` shows the open round first when a not-yet-open one also exists | FR-027 |
| C16 | Two passes started together: one does nothing; no package in two rounds | FR-033 |

## Operator steps, in this order (research R13)

```sh
make db-up ENV=dev                         # additive; safe before any deploy
make edge-deploy SERVICE=driver ENV=dev    # the gate + the multi-round read — FIRST
# build and install the driver app
make edge-deploy SERVICE=fleet ENV=dev     # the engine starts assigning early — AFTER the gate
make apply ENV=dev                         # the alarm change
# back-office deploys by its own pipeline
```

⚠ `driver` before `fleet`. The reverse lets a driver act on work hours early.

## Walks (a person, in dev)

Set-up: one active collection run a few hours ahead; one cleared driver on duty holding a vehicle;
a same-day slot later in the day.

| # | Do | Expect |
|---|---|---|
| W1 | Mark an order ready in the shop console. Wait one pass (≤ 5 min). | The round appears in the driver app without touching it. Back-office dispatch shows it against the driver with "Opens h:mm". |
| W2 | Open the round and a stop in the driver app. | Everything is readable. Collect / issue controls are disabled and say when the round opens. |
| W3 | Mark a second order ready at another shop. | The **same** round gains a stop. No second round. |
| W4 | Wait for the opening time with the app open. | Controls enable by themselves, within half a minute. |
| W5 | Collect, check in at the hub. One pass later: | The same-day package is on a delivery round, shown with its window, locked until window start minus the lead. |
| W6 | With a second driver, clock on after W1. | They have nothing from W1's work. New ready orders go to whichever has fewer packages today. |
| W7 | Clock the first driver off before opening. One pass later: | Their unbegun round is gone; the work is with the second driver or listed unassigned with a reason. |
| W8 | Mark an order ready after the last run of the day. | Assigned at once, labelled with tomorrow's run. |
| W9 | Leave a package nobody is cleared for. Check back-office after 30 minutes. | Listed once, with its reason. |

W7 is the most important: it is the behaviour that did not exist before this feature.
