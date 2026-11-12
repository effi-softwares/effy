# Contract: the three clean-ups (113)

Each one is route-less and wrapped in `recordRun(job, fn)`, which writes one `housekeeping_run` and announces ops
`housekeeping`. A throw is recorded as `failed` and rethrown, so the Lambda error alarm still fires.

## unpaid_orders (commerce `unpaidOrders`, every 15 minutes, timeout 120 s)

1. Read `housekeeping_settings.abandon_after_min`.
2. Select up to 50 orders that are `pending_payment` with `updated_at < now() - abandon`, oldest first, `FOR UPDATE SKIP
   LOCKED`. The claim is released before any provider call; `finalizeAbandoned`'s guard is what makes it safe.
3. For each order, `abandonOrder(gateway, id)` returns one of:

   | Result | Count |
   |---|---|
   | `abandoned` | `closed` |
   | `paid` (settled now) | `paidLate` |
   | `in_progress` | `stillPaying` |
   | `unreachable` | `unreachable` |

4. Stop early with 15 s left. The rest wait for the next run.
5. Announce, after each commit:
   - customer `orders` for each closed order (its list changes);
   - customer `points` when points were released;
   - ops `orders`.

Webhook side (commerce `webhook`): a `succeeded` event for an `abandoned` or `failed` order calls `refundUnplaced` and
counts `lateRefunds` on the next run (read from `refund` rows of kind `unplaced` created since the last run).

## account_erasure (customer `accountErasure`, hourly, timeout 300 s)

1. Claim up to 25 due closure requests (research R7, step 1).
2. For each, run steps 2 to 4 of R7. A step that fails adds to `retried` and records the problem, and the account is left
   `closing`.
3. Then `scrubFinishedOrders`: orders of erased customers that were on their way at erasure and have since finished get
   the scrub (research R7).
4. Counts: `erased`, `retried`, `pointsForfeited` (the sum), `ordersScrubbedLater`.
5. After the commit, delete each cleared courier label file from the media bucket. A failed delete is logged and retried
   from the list of keys nulled in this run.
6. Outcome: `ok` if nothing was retried, otherwise `partial`, or `failed` if the claim itself failed.
7. No announcement to the customer (they have no session). Ops `housekeeping` only.

## phone_registrations (notifications `purge`, daily)

1. Delete `device_token` rows with `last_seen_at < now() - 270 days`, 1,000 at a time, until none are left or 30 s have
   passed.
2. Count: `removed`.
3. The purge also deletes `housekeeping_run` rows older than 400 days (not counted).
