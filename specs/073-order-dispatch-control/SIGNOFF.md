# Sign-off: 073 — Simple Order Status & Driver Assignment in Orders

**Status (2026-10-07)**: **deployed to dev** at `348e7658` — migration applied (both columns present),
`fleet`, `orders`, `shop`, `driver` deployed, back-office and shop-web built from that commit; the lock
routes are gone and the assign route exists. 32/33 tasks; **the walks (T033) remain.**

## What changed

- **One status, nine words, everywhere** — Preparing · Ready · With driver · At hub · Out for delivery ·
  With carrier · Delivered · Problem · Cancelled — derived from what actually happened, shown the same
  on back-office and the shop console (the shop never sees a driver's name). Fixes the reported
  defect: collected now says **With driver**, and hub check-in moves it to **At hub** everywhere.
- **Live**: hub check-in, a drop starting or failing, and a not-collected package now tell each shop
  involved, as well as back-office.
- **Orders tabs**: Orders · Assignments · Handover. Driver column, "Needs a driver" filter, and Collect /
  Deliver lines on each package with a one-line "how".
- **Assign to… / Unassign**, with Fine / Concern / Can't take it, and a one-line toast for every result.
- **Removed**: round lock, planning-passes list, Dispatch nav item (old links redirect).

## Verified by machine

| Check | Result |
|---|---|
| `pnpm -r typecheck` | clean |
| edge-shared (with containers) | 586 passed |
| edge-fleet (with containers) | 288 passed |
| edge-driver (with containers) | 177 passed |
| edge-orders (with containers) | 88 / 89 — the 1 is pre-existing, intermittent |
| edge-shop (with containers) | 472 / 474 — both pre-existing (fail without 073's changes) |
| back-office | 294 passed |
| shop-web | 450 passed |
| shared-types | 71 passed (incl. the one-word-map guard) |
| `check-no-refresh-timers.sh` | OK |

Negative proofs, each broken once and caught: collected ≠ at hub, hub check-in tells shops, shop sees
no driver name, planner writes its note, off-duty refused, collected cannot move, stale token refused,
unassign returns the package, the one-word-map guard.

## Not verified

- Nobody has looked at a screen.
- Nothing deployed.

## Pre-existing failures (not 073)

- orders `recordArrival` "survives two operators…" — intermittent; passes on re-run.
- shop "pages with a total order and a stable total" — fails at HEAD without 073.
- shop attention "resolves recipients…" — `column "id" does not exist`; fails without 073's migration.

## Operator steps

```sh
make db-up ENV=dev                         # additive (two nullable columns); commit first
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=shop ENV=dev
make edge-deploy SERVICE=driver ENV=dev
# back-office and shop-web via their pipelines
```

Any order is safe: every change is additive except the removed lock routes, which only the old
back-office called.

Then walks V1–V8 in [quickstart.md](quickstart.md) — **V1 first** (one same-day and one standard order
from Ready to Delivered with shop console, back-office and driver app open).
