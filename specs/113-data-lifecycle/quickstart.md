# Quickstart: Data Lifecycle (113)

## Before the walk (operator)

1. `make apply ENV=dev`: the fingerprint-key secret and its SSM ARN, plus alarms `unpaid-orders`, `account-erasure`,
   `HousekeepingStale` and `UnplacedPaymentRefunded`.
   Then seed the fingerprint key once (Terraform makes the secret without a value, so the key never sits in state):
   `aws secretsmanager put-secret-value --profile ef --region ap-southeast-2 --secret-id effy-dev-erasure-fingerprint-key --secret-string "{\"key\":\"$(openssl rand -hex 32)\"}"`
2. `make db-up ENV=dev`: `20261112090000_data_lifecycle.sql` (additive).
3. `make edge-deploy ENV=dev SERVICE=commerce`: the clean-up, the webhook's new decline and late-payment rules, and the
   customer order list.
4. `make edge-deploy ENV=dev SERVICE=customer`: erasure, closure without the unpaid-order block, and restore refused after
   the date.
5. `make edge-deploy ENV=dev SERVICE=notifications`: the phone-registration prune and the run purge.
6. `make edge-deploy ENV=dev SERVICE=orders`, then `make edge-deploy-all ENV=dev` (the placed-order readers in the shared
   library).
7. back-office, shop-web and customer-web through their pipelines. Then the customer app.

```sh
psql "$(AWS_PROFILE=ef bash infra/scripts/db-dsn.sh dev)"
```

Accounts: one admin, one manager and one CSA in back-office, and two test customers (A and B) with a test card.

## Local checks (Claude, before hand-off)

- Container suites on the local Postgres recipe:
  - `shared/src/payments/*abandon*.container.test.ts`: every `abandonOrder` result, the holds released, the guard, and
    `refundUnplaced`;
  - `commerce/src/webhook`: a decline leaves the order unpaid, a retry that succeeds places it, and a success on an
    abandoned order refunds it;
  - `commerce/src/housekeeping`: the abandon time (including `updated_at` refreshed by a second intent), batching, and the
    early stop;
  - `customer/src/erasure/erasure.container.test.ts`: the full-database scan (SC-002), the forfeit, restore before the date,
    restore refused after it, a retry after a failed external step, a fingerprint only when barred, and re-registration
    with the same email;
  - `customer/src/closure`: an unpaid order no longer blocks; `payment-in-progress`; device tokens deleted at closure;
  - `notifications/src/purge`: registrations older than 270 days, and the run purge;
  - `orders`: the clean-ups routes, roles, version, and the activity source.
- Guards:
  - `placed-order.guard` (new);
  - `housekeeping.guard` (new: `housekeeping_run` writes only in `recordRun`, job keys equal to the CHECK);
  - `payments`: `status='abandoned'` only in `finalize.ts`;
  - `background-alarms.guard`, `activity.guard`, the change map, `live.contract`, gateway capacity (staff 234/300);
  - `deletion-copy.test.ts`.
- `pnpm --filter @effy/shared-types test` and the contract regeneration.
- back-office: vitest (tours 57, settings index, skeletons) and the build. customer-web: vitest, build and depcruise.
  shop-web: vitest and build.
- Customer app: host tests (the closure refusals, no awaiting-payment blocker) and the Android and iOS compiles. Driver
  app: the re-register-on-start test.
- Goose up / down / up on the local Postgres.

## The walk (dev)

### Unpaid orders (US2)

1. As customer A, add items, apply points and a promotion code, and stop at the card step.
   - In psql, `update "order" set updated_at = now() - interval '25 hours' where id = '<id>'`.
   - After the next run (15 minutes at most), the order has gone from A's orders on the website and the app.
   - The points balance is back, and the code works again.
   - The cart still has the items.
2. Start checkout again and decline with the test card `4000 0000 0000 0002`. Then pay with `4242 4242 4242 4242` on the
   same screen. The order is placed (FR-006a).
3. Settings › Business › **Clean-ups**: the tour HK starts. Unpaid orders shows the last run, with "Closed 1".
   - As the manager, the abandon time is read-only.
   - As the admin, set it to 12 hours. The activity drawer shows the change and who made it.
   - Set it back to 24 hours.

### Closing with an unpaid order (US3)

4. As customer B, leave an unpaid checkout, then delete the account. The screen lists no blocker. Confirm with the code.
   - B is signed out.
   - The unpaid order is `abandoned` in psql.
   - `device_token` has no rows for B.

### Erasure (US1)

5. In psql, `update customer_closure_request set erase_after = now() - interval '1 minute' where customer_id = '<B>'`.
   - Signing in as B now says the account was deleted and can't be restored.
   - Within an hour, Clean-ups shows "Erased 1 account".
6. Back-office:
   - searching B's name, email or phone finds nothing;
   - B's paid orders show "Deleted customer", the items and amounts, and the suburb and postcode only;
   - any tax invoice still opens as issued.
7. Register again with B's email. It is a new, empty account.
8. Before erasing B, a CSA opens B's page during the 30 days and sees "Being deleted: erased on {date}. Signing in before
   then restores the account."

### Phone registrations (US4)

9. In psql, age one `device_token` to 271 days. After the next daily purge it is gone, and Clean-ups shows "Removed 1".

### Database spot checks

```sql
-- nothing waiting longer than the abandon time plus a day, except payments in flight
select count(*) from "order" where status = 'pending_payment' and updated_at < now() - interval '2 days';

-- every due closure erased
select count(*) from customer_closure_request
 where cancelled_at is null and erased_at is null and erase_after < now() - interval '1 day';   -- expect 0

-- the runs
select job, outcome, counts, started_at from housekeeping_run order by started_at desc limit 10;
```
