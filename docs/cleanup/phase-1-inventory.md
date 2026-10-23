# Cleanup — Phase 1 inventory (2026-10-23)

Survey approved 2026-10-23 ("do what is best"). **Phase 2 status** is noted per section; see
"Phase 2 — done" at the end.

**Method.** All 92 migrations applied to a local throwaway Postgres to get the real final schema
(130 tables, 1,194 columns, 28 functions, 11 triggers, 1 view, 0 enums). Every static SQL statement
in the backend (1,046 of 1,132) was `PREPARE`d against it. Every route in every `serverless*.yml`
(372) was matched against the comment-stripped source of the five active clients
(`apps/shop-mobile` is stopped and counts as no caller).

**Starting point.** Dev holds no data and no app is installed anywhere, so everything that exists
only for *old orders* or *old app builds* is now dead weight.

---

## A. Bugs found (fix regardless of cleanup)

| # | Where | What |
|---|---|---|
| A1 | `apis/edge-api/shop/src/attention/repository.ts:136` (`recipientsForShop`) | Query names columns that do not exist (`ssr.shop_staff_id`, `ssr.shop_role_id`, `sr.id`, `sr.name`; the real ones are `staff_id`, `role_key`, `key`). It fails every run, so the `attentionEvaluate` worker never notifies shop staff. Fix: join `shop_staff_role ON staff_id = ss.id`, `bool_or(ssr.role_key = 'shop_manager')`, drop the `shop_role` join. |

The other 1,045 static statements prepare cleanly. The 86 statements assembled at runtime were not checked.

## B. Routes to remove (no active caller)

| Route | Was for |
|---|---|
| `GET /admin/v1/ping` | 005 identity proving route |
| `GET /shop/v1/ping` | 007 identity proving route |
| `GET /shop/v1/manager-ping` | 007 manager proving route (only `scripts/verify-manager-gate.sh` calls it) |
| `POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue` | 063; the app now sends outcomes inside `/collect` |
| `POST /driver/v1/activity/read` | driver activity "mark read"; not called by the app |
| `PATCH /shop/v1/fulfillments/{id}/items/{orderItemId}` | 020 per-item picking; only shop-mobile used it |
| `GET /storefront/v1/serviceability` | 047 postcode check; checkout uses the quote |
| `GET /storefront/v1/localities` | address typeahead; no client calls it |
| `GET /admin/v1/delivery/go-live` | 083 go-live page; refuses everything since the removal |
| `PUT /admin/v1/delivery/go-live/switch` | same |

Kept on purpose: every `healthz` / `readyz` (`scripts/edge-health.sh`, `dns-verify.sh`) and
`POST /commerce/v1/stripe/webhook` (called by Stripe).

Not yet checked: a path that is called, but not with every method it is defined for. That gets checked route by route in Phase 2.

## C. Background functions to remove

| Function | Why |
|---|---|
| `admin` `deliveryModelSwitchSweep` (schedule) | 083 switch sweep; the switch is permanently on |
| `media` `renditionBackfill` | 086 one-off: queue copies for pictures that predate 086; none exist now |

## D. Legacy and compatibility code to remove (no old data, no installed apps)

| Area | What goes |
|---|---|
| Delivery model v1 / go-live | `public.delivery_model_v2_at` (always `true`), `delivery_settings.delivery_model_v2_from` + `legacy_model_removed_at`, `admin/src/delivery/go-live.*`, `GoLiveError`, `readiness.ts` callers that exist only for go-live, `shared/src/delivery/legacy.ts` (`LEGACY_OPEN_ORDER_SQL`), the orders list `stillOpen` filter, `retire.container.test.ts`, `windows.guard.test.ts`'s go-live rules, `docs/archive/delivery-model-v1.md` references |
| Orders before delivery types | `package_delivered_by`'s fallback for a NULL `delivery_type` (it becomes a plain column read); `order.delivery_type` and `order.delivery_promise` become `NOT NULL`; "NULL before 085 reads as `window`" handling |
| Orders before 094 | `order.promo_code` fallbacks in `commerce/src/orders/service.ts:272-277` and `notifications/src/receipts/sender.ts:238` (discount lines come from `order_promotion` only) |
| Wire compatibility fields (23 `@deprecated`) | driver `kind: "same_day_delivery"`, `sameDayCount`, `standardCount`; shop `deliveryMethod` (×7 DTOs); shop `promotion` (always null); `bag 1's 089 label data` (096 compat); storefront `home.banners` (094 compat); `ActiveStatus` alias in `delivery-admin.ts`; `blockedBy` alias; `Problem.errors` alias; plus the matching Kotlin DTO fields |
| Guard scripts for retired things | `scripts/check-no-legacy-delivery.sh` (nothing left to guard once the code is gone) |

## E. Database objects to remove

| Object | Why |
|---|---|
| fn `public.delivery_model_v2_at` | see D |
| fn `public.delivery_plan_is_complete` | used only inside migration 077 |
| cols `delivery_settings.delivery_model_v2_from`, `legacy_model_removed_at` | see D |
| tbl `public.event_outbox` | written, never drained (the known 070 gap). **Decided: drop** (Phase 5); add back when the event backbone is built |

~~`cart_change_log`~~ stays: its unique key is how the cart rejects a repeated request (an insert that
writes no row means "already applied").

Columns with no reader in any SQL statement that names their table (excluding `created_at`/`id`/lookup keys the
database fills or foreign keys use):

`cart.currency`, `assignment_exclusion.wave_id`, `assignment_exclusion.updated_at`,
`dispatch_wave.started_at`, `vehicle.ownership`, `media_rendition.format`, `label_read.corrects_read_id`,
`package_parcel.voided_by_sub`, `feedback_reply.delivery_ok`, `shop_fulfillment.promised_ready_at`,
`delivery_collection_run.updated_at`. Each gets confirmed (written-only audit value vs leftover) during the Phase 5 squash.

Kept on purpose: `admin.role` and `public.shop_role` (lookup tables enforced by foreign keys), the 11
`shop_ops_*` triggers (they feed shop insights), `newsletter_subscriber` and `product_gst_change`
(written for export/audit).

## F. SQL files

| File | Verdict |
|---|---|
| `db/migrations/*` (92) | Replace with one baseline in Phase 5 |
| `db/reset/098_purge_catalogue_dev.sql` | **Delete**: a one-off purge before 098; the wipe superseded it |
| `specs/077-delivery-fee-engine-v2/preflight.sql` | **Delete**: a one-off check before 077 |
| `specs/016-shop-product-catalog/perf-seed.sql` | **Delete**: a throwaway perf seed |
| `db/seeds/047, 061, 062, 074, 084, 098` | **Keep**: all apply cleanly to today's schema (098 needs a shop first). Fold their headers down in Phase 4 |
| `specs/094-promotions-rebuild/stage-c/` | Already gone; the migration was applied as `20261021090000_remove_promo_code.sql` |

## G. Stale docs found

- `FEATURE-HISTORY.md` (094) and memory say Stage C is open; it was applied.
- CLAUDE.md "Delivery model" / "Coverage" sections describe go-live, legacy orders and compatibility
  fields that section D removes; they get rewritten with the code.

---

## Phase 2 — done (2026-10-23)

**Routes removed (16; 356 remain):** the 10 in B, plus four found while removing them —
`GET /shop/v1/status` and `GET /shop/v2/status` (demo routes), `GET /fleet/v1/custody`,
`PUT /inventory/v1/admin/shops/{shopId}/variants/{variantId}/stock/threshold`, and `GET /driver/v1/activity`
next to its `read`. Background functions removed: `deliveryModelSwitchSweep`, `renditionBackfill`.

**Kept on purpose:** `POST /orders/v1/orders/{orderId}/cancel` (055 staff cancel + refund). No back-office
screen calls it — **a UI gap, not dead code.**

**Also removed with them:** the back-office Go-live tab, the orders list "Placed before delivery types"
filter, `shared/src/delivery/{legacy,readiness,locality}.ts`, the shop `status/` slice, ~40 dead exported
functions/constants (found by an export-usage scan), the matching wire types (+ regenerated Kotlin
contracts for customer, driver and shop), the media worker's SQS send permission and dependency,
`scripts/verify-manager-gate.sh` (+ `make shop-verify-gate`), and the go-live alarms in Terraform.

**Bug fixed:** A1 (`recipientsForShop`), and its container test, which had the same wrong columns.

**Operator steps** (after committing): deploy `admin`, `driver`, `fleet`, `inventory-staff`, `media`,
`shop`, `storefront`, `orders`; `make plan ENV=dev` then `make apply ENV=dev` (removes the go-live alarms,
one alarm entry and the `rendition_queue_url` parameter); redeploy back-office.

**Container tests (run 2026-10-23, Docker):** ~300 files. Run one at a time, all pass but one:
`orders/src/orders/repository.container.test.ts` builds a hand-written mini schema that lacks
`round_opens_at`. That is fixture drift, not a product bug; Phase 5 moves such tests onto the single
baseline migration. Running files in parallel causes setup timeouts and shared-key collisions in
driver/fleet/commerce — run them with `--no-file-parallelism`.

## Phase 3 — in progress (2026-10-23)

Done so far, all suites green (JS typecheck + tests, customer and driver app host tests, guard scripts):
- **Unused code guarded:** 65 unused imports/locals removed; `noUnusedLocals` + `noUnusedParameters` on in all
  25 tsconfigs. Found on the way: the wallet button ignored `disabled` during a card payment (fixed), and the
  "busy state clears on every outcome" payment test never pressed Pay (now does, and was proven to fail
  without the fix).
- **shop-mobile deleted** (app, Kotlin contract + generator, Compose theme, brand assets, `sm-*` targets,
  Cognito app client + authorizer audience in Terraform). Untracked local files remain in `apps/shop-mobile/`
  (build output, `secrets.properties`) for the operator to delete.
- **Compatibility removed:** every `@deprecated` field (shop `deliveryMethod`/`label`/`promoCode`/`serviceLevel`,
  driver `method`/`sameDayCount`/`standardCount`/`same_day_delivery`, storefront `home.banners`, `Problem.fields`,
  `RingStatus`, `canBeOffered`) and every "optional for an older server" field in the driver contract.
- **Old-order paths removed:** `deliveredBySql` and `package_delivered_by(` callers → `o.delivery_type`; no
  "placed before 077/079/085/094" branches in commerce, orders, notifications, override, customer-web,
  back-office or the customer app; `deliverySummary` (+ Kotlin twin + shared fixture) always has a heading.
- Also fixed: 5 promotion-skin icons that were never declared in the design-system asset source.

Open findings for the operator:
- The customer app never calls its Kotlin `deliverySummary` — its screens word deliveries themselves, so the
  "one wording" rule is enforced only by a test of an unused function.
- Back-office cancel-order route has no button (kept).
- Container-test fixtures still create orders with no `delivery_type`: fixed together with Phase 5's NOT NULL.
- Effy planner/dispatch code still handles "a package with no window" (orders before 069); every Effy order
  now has one — verify and remove with Phase 5.
