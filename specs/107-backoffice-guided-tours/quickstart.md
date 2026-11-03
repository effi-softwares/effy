# Quickstart: validating back-office tours (107)

## Local checks (Claude runs these)

```bash
pnpm --filter @effy/web-kit test           # engine with roles; provider tests; tour/testing helpers
pnpm --filter @effy/shop-web test          # 106's tests, now through the shared helpers (roles migrated)
pnpm --filter @effy/back-office test       # tours.test (words + role marks), tours.guard (every route), tours.roles (csa)
pnpm --filter @effy/back-office typecheck
pnpm --filter @effy/edge-shared test       # gateway capacity: staff 210/300; change-map exemption
pnpm --filter @effy/edge-admin test        # handler tests for /admin/v1/me/tours
pnpm --filter @effy/back-office build
```

## Operator steps (the user runs these)

1. 106 first, if not done yet: its migration, then `SERVICE=shop`, then shop-web.
2. Commit.
3. `AWS_PROFILE=ef make edge-deploy SERVICE=admin` (two routes; staff gateway 210/300). No migration.
4. Deploy back-office.

Out of order is safe: before step 3 the read fails, so nothing starts by itself, and Help still runs every tour.

## The walk (against dev)

Use three back-office accounts with no tour history: **Administrator**, **Manager**, **Customer support**.

| # | Do | Expect |
|---|---|---|
| 1 | Sign in as Customer support | Welcome starts by itself (7 steps); Done → the Overview tour follows |
| 2 | Open Exceptions as Customer support | No "Dealing with one" or "Vehicle checks" step; the "Read-only for support" step is shown |
| 3 | Open Exceptions as Manager | Both action steps shown; no "Read-only for support" step |
| 4 | Help → All tours as Manager | Tax and Admin and access are not listed; Hub station and Imports are |
| 5 | Delivery → each tab | Each tab's own tour starts by itself the first time; switching tabs mid-tour ends it |
| 6 | All tours → "A driver" from Overview | Opens a driver, then its tour starts |
| 7 | Scan a bag label during a tour | The order opens and the tour ends; it is recorded as shown |
| 8 | Press `?` | Keyboard shortcuts open, not Help |
| 9 | Dispatch tour while a package is assigned elsewhere | "Needs a driver" moves on when the section empties |
| 10 | Sign in to shop-web with a person who also has back-office | Their shop tours are not marked seen by back-office |
| 11 | PostHog | `tour_*` events from back-office carry `role`; none carry a record id |
