# Quickstart: validating 093

## Automated

```sh
pnpm --filter @effy/shared-types test && pnpm --filter @effy/shared-types driver-contract:check
cd apis/edge-api/driver && npx vitest run            # gates, collect remaining, load holds, vehicle check
cd apis/edge-api/fleet  && npx vitest run            # collector preference, held exclusion, overdue, waiver
cd apis/edge-api/shared && npx vitest run            # stage words, gateway capacity
pnpm --filter back-office test && pnpm --filter back-office typecheck
cd apps/driver-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug
scripts/driver-guard.sh
```

The container tests (`*.container.test.ts`) need Docker running.

## Operator steps (yours to run)

1. Migrate dev: `make db-up ENV=dev` (applies `20261017100000_driver_work_sequence.sql`).
2. Deploy: `SERVICE=driver`, `SERVICE=fleet` (`make edge-deploy ENV=dev SERVICE=…`), then back-office.
3. Build the driver app.

## Walk (dev)

1. **Gate: check-in.** On a collection run with 2 shops, collect one, then try to check in. You get
   "Collect from {shop} first". Collect the second, and check-in succeeds.
2. **US2.** Open a shop stop. In back-office, assign another package at that shop to the run, then collect
   in the app. You get "1 more package was added". The stop stays open.
3. **US3.** Check in parcels for today's window. Within 5 minutes Today shows the delivery run with you as
   the driver, and back-office's note says "collected it, continuing to delivery".
4. **Gate: load.** Before loading, open a drop. Its actions are disabled with "Load the van first". Load,
   declaring one package "damaged". The package is listed on Exceptions → Held. Choose "Found - plan
   again", and it appears on a later run.
5. **Cross-run gate.** With a failed parcel not returned, try to load a new run. You get "Return the
   parcels from your last run first". Waive it in back-office, and the load succeeds.
6. **Overdue.** Leave an open delivery run unloaded for 20 minutes. It appears on Exceptions → Overdue.
7. **Vehicle check.** Go on duty and answer brakes "unsafe". You get no work, and Exceptions shows the
   check. Clear it, and work arrives on the next pass.
