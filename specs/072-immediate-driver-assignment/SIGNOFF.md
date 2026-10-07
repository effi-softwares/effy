# Sign-off: 072 — Immediate Driver Work Assignment

**Status (2026-10-07)**: **deployed to dev** (migration, driver, driver app, fleet, alarms). 47/48 tasks;
the walks (T048) remain. First live pass after the fleet deploy: released 2 packages, assigned 2;
`dispatch-unassigned-past-opening` is OK and the two retired alarms are gone.

## What changed

- Every 5-minute pass assigns every package a driver can take — collection and same-day delivery —
  however far off its run or window. Eligibility and the fewest-packages-today rule are unchanged.
- First come, first served: assigned work never moves on its own.
- A round **opens** at its run time (or window start) less `planning_lead_min` (45). Before that it is
  readable in full; every route that progresses it answers **409 `round_not_open`** and writes nothing.
- One not-yet-begun round per driver per run/window; packages accumulate in it.
- Off-duty / stood-down drivers lose uncollected, unlocked work on the next pass (063 FR-035, which was
  never built).
- Back-office shows "Opens …" per round, and hub-side packages nobody can deliver.

## Verified by machine

| Check | Result |
|---|---|
| `pnpm -r typecheck` | clean |
| edge-shared | 503 passed |
| edge-fleet (with containers) | 276 passed |
| edge-driver (with containers) | 174 passed |
| back-office | 294 passed |
| driver-mobile `:shared:testAndroidHostTest` | 71 passed; iOS main + test compile clean |
| `scripts/check-no-refresh-timers.sh` | OK |
| `terraform validate` / `fmt` (dev) | clean |
| `driver-contract:gen` | regenerated, idempotent |

**Negative proofs** — each behaviour was broken once and its test failed: C1, C2, C3, C4, C4b, C5, C6,
C7 (collection), C7 (delivery), C8, C9, C10, C10c, C11, C12, C13, C14, C15, C16, the
already-delivered gather fix, and the gate guard test.

## Not verified

- **Nobody has looked at any screen** — driver app or console.
- Nothing deployed; no real round has been assigned early in dev.
- The opening-time label and "Also yours" list have not been seen on a device.

## Operator steps, in this order

```sh
make db-up ENV=dev                         # additive; the old fleet keeps working against it
make edge-deploy SERVICE=driver ENV=dev    # ⚠ FIRST — the lock must exist before early assignment
# build and install the driver app
make edge-deploy SERVICE=fleet ENV=dev     # the engine starts assigning early
make apply ENV=dev                         # alarm swap (dispatch.tf)
# back-office deploys through its pipeline
```

⚠ `make db-up` refuses uncommitted migrations — commit first (or `FORCE=1` for private iteration).

Then walks W1–W9 in [quickstart.md](quickstart.md). **W7 first** (a driver going off duty before
their round opens) — it is the behaviour that did not exist before.

## Known limits

- At 45 min lead and 12 min/stop a collection round fits three shops. Raise `planning_lead_min`
  (database value, no screen) if rounds need more — it no longer delays visibility.
- Work readied overnight waits for the first driver to clock on, who gets all of it.
