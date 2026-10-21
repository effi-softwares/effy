# Quickstart: validating Delivery Today, Postcode by Postcode (097)

## Machine checks (Claude runs)

```bash
pnpm --filter @effy/edge-shared test           # windows.test.ts (calendar), coverage guards
pnpm --filter @effy/edge-admin test            # coverage service / repository (container tests)
pnpm --filter @effy/edge-commerce test         # checkout container test: quote, ASAP, intent refusal
pnpm --filter @effy/edge-fleet test            # staff calendars still pass `true`
pnpm --filter @effy/back-office test           # Coverage panel: column, filters, bulk, add, checker
pnpm typecheck
```

What they must show:

| Scenario | Expected |
|---|---|
| `effyDays(…, todayOffered=false)` | no `isToday` day; `lookahead` later days, unchanged |
| Quote for a listed postcode, `today_offered = false`, a window open today | no `same_day` day in the DTO; later days and fees identical to the same quote with `true` minus today |
| Same, ASAP chosen | order lands on the first later day with the Any-time window open |
| Intent naming today's window after a switch-off | `date_unavailable`, nothing written |
| A place already held today, then switched off, then paid | order confirmed in today's window |
| `previewMove` / `changeEffyWindow` for such an address | today not listed; committing a today window → `window_unavailable` |
| Same address, `today_offered = true` | byte-identical to before 097 (SC-002) |
| Bulk PATCH with one unlisted postcode | 404, no row changed, no audit |
| Bulk PATCH | one `coverage.postcode.today` audit row listing only changed postcodes |
| `coverage.guard.test.ts` | green — no new reader of `delivery_zone_postcode` |

## Operator steps (the user runs)

1. Migrate dev: `make db-up ENV=dev` — additive; every listed postcode starts `today_offered = true`.
2. Deploy after step 1 (each reads the new function column), in any order:
   `make edge-deploy SERVICE=commerce ENV=dev` (checkout), `make edge-deploy SERVICE=orders ENV=dev`
   (move to Effy / re-time), `make edge-deploy SERVICE=admin ENV=dev` (Coverage routes),
   `make edge-deploy SERVICE=fleet ENV=dev` (calendar signature only — no behaviour change).
   Back-office deploys on push to `dev`. ⚠ A service deployed BEFORE the migration fails every
   coverage read (the column does not exist yet); one left undeployed keeps working as before 097,
   since the old function call still returns its first five columns — which also means an
   undeployed `commerce` or `orders` would still sell today everywhere. **Switch no postcode off
   until both are deployed.**
3. Walk (dev):
   1. Coverage → filter **Farther than 25 km** → select all → **Delivery today: Don't offer**.
      The column shows "Not offered"; a second open Coverage tab updates without reload.
   2. Checker: `3220` → "Delivered by Effy · Delivery today not offered".
   3. While a window today is open: checkout to a 3220 address (web and app) → no Same-day section,
      Standard delivery from the next delivery day. Checkout to 3121 → Same-day section as before.
   4. ASAP to the 3220 address → order's day is a later day.
   5. Back-office → an order to 3220 → change window → today is not listed.
   6. Switch 3220 back on → Same-day section returns for 3220.
   7. Audit log shows the two `coverage.postcode.today` entries with before/after.
