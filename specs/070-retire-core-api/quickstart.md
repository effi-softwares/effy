# Quickstart: cut-over, teardown and verification

Claude authors everything below; **every step marked OPERATOR is run by the operator**. All AWS
commands use `AWS_PROFILE=ef`. Exact commands are written into `tasks.md` and the sign-off as each
step is built; this file fixes the order and what "worked" looks like.

## Baseline (T001 — measured 2026-10-05, before any change)

| Suite | Result |
|---|---|
| `go test -short ./...` in `apis/core-api` | 585 passed (incl. subtests), 0 failed, 156 skipped (`-short` skips the real-database tests) |
| edge `shared` | 150 passed, 9 skipped |
| edge `admin` | 193 passed, 5 skipped |
| edge `auth` | 151 passed |
| edge `catalog` | 14 passed, 29 skipped |
| edge `customer` | 178 passed, 39 skipped |
| edge `driver` | 48 passed, 89 skipped |
| edge `fleet` | 138 passed, 98 skipped |
| edge `inventory` | 59 passed, 3 skipped |
| edge `notifications` | 63 passed |
| edge `orders` | 28 passed, 50 skipped |
| edge `shop` | 382 passed, 83 skipped |
| `@effy/shared-types` | 57 passed; `contract:check`, `shop-contract:check`, `driver-contract:check`, `commerce-contract:check` all clean |
| `@effy/web-kit` | 73 passed |
| `@effy/api-client` | 6 passed |
| customer-web | 593 passed |
| shop-web | 456 passed |
| back-office | 278 passed |
| customer-mobile `:shared:testAndroidHostTest` | 380 passed |

⚠ **Two real-database tests in `edge shop` were ALREADY failing before 070 touched anything** — found
on 2026-10-05 once Docker was started, and confirmed with 070's migration removed:
`src/attention/repository.container.test.ts` ("resolves recipients and their manager flag" —
`column "id" does not exist`) and `src/orders/repository.container.test.ts` ("pages with a total
order and a stable total" — wrong page order). They are not caused by 070 and are not fixed by it;
with them excluded, every edge suite passes with the real database (see SIGNOFF.md).

⚠ **Docker was not running when this was measured**, so every edge "skipped" figure is the
real-database suite (`CONTAINER_TESTS=1`) not having run. Those counts are the size of the
existing real-database proof, not failures. The "After" column (T098) must be taken with Docker up.

## Before any of this

- The constitution is at 3.0.0 (R14) and the documents in FR-002 are corrected.
- `make edge-test` passes, including the real-database suites (`CONTAINER_TESTS=1`).
- `pnpm --filter @effy/shared-types test` and the mobile wire-contract tests pass.

## Stage 1 — additive infrastructure and data (core-api still serving)

**Run early — at the end of the foundational phase (tasks T020), not at cut-over.** The new services
cannot be packaged or deployed until these parameters exist. Until Stage 3 is recorded, the working
tree contains **no teardown change**, so every `make apply` here and in Stage 2 is additive.

1. **OPERATOR** — `make db-up ENV=dev` → migration A. Expect: role `effy_shopper` exists,
   cannot log in.
2. **OPERATOR** — `make db-shopper-role ENV=dev`. Expect: a secret holding the role's credentials
   exists; the role can log in; `SELECT rolconnlimit FROM pg_roles WHERE rolname='effy_shopper'`
   returns 40.
3. **OPERATOR** — `make plan ENV=dev` then `make apply ENV=dev`. Expect an **additive** plan only:
   storefront origins added to the gateway and media-bucket origin list; parameters publishing the
   shopper credentials and the payment secret addresses. No resource belonging to core-api changes.

**Early proof (task T033), straight after the browsing story is built**: deploy `storefront` alone,
compare its answers with core-api's, and measure SC-004 and SC-007. If either target is missed,
stop here — nothing irreversible has happened yet.

## Stage 2 — deploy the single backend alongside

4. **OPERATOR** — `make plan ENV=dev` / `make apply ENV=dev` for the new alarms only (additive).
   Set one alarm to ALARM with `aws cloudwatch set-alarm-state` and confirm the notification
   reaches the operational mailbox.
4a. **OPERATOR** — deploy in this order:
   `make edge-deploy SERVICE=storefront ENV=dev` → `commerce` → `orders` → `shop`.
5. Smoke, no credential needed:
   - `GET /storefront/healthz`, `/commerce/healthz` → 200
   - `GET /storefront/v1/home` → banners and rails
   - `GET /storefront/v1/products?q=<term>` and the same request against core-api → same ids, same
     order, same total
   - `POST /commerce/v1/cart/preview` with two lines → priced cart
   - `POST /commerce/v1/stripe/webhook` with no signature → 400
   - a shop-pool token presented to `GET /commerce/v1/cart` → 401 (a credential for one audience is
     not accepted by another)

## Stage 3 — switch

6. **OPERATOR** — at the payment provider (test mode), **add** a webhook endpoint for
   `https://edge-api.dev.effyshopping.com/commerce/v1/stripe/webhook` with the same five event
   types. Put its signing secret into the existing webhook secret. Leave the old endpoint enabled.
7. **OPERATOR** — release the four consumers built from this branch: push to the branch Amplify
   deploys (customer-web, shop-web, back-office) and rebuild customer-mobile.
8. One paid test order end to end on web. Expect: order paid, shop portion created, receipt queued,
   stock reduced, cart empty — and the provider's dashboard shows the **new** endpoint answering 200.
9. **OPERATOR** — disable the old webhook endpoint at the provider.

## Stage 4 — teardown

The teardown change is **authored only now** (tasks T091–T093), after Stage 3 is recorded.

10. **OPERATOR** — empty the image registry (it refuses deletion while it holds images).
11. **OPERATOR** — `make plan ENV=dev`; confirm the plan destroys **only** the resources in
    [migration-inventory.md §7 "Destroy"](migration-inventory.md) and touches none in "Keep";
    then `make apply ENV=dev`.
12. **OPERATOR** — `make db-up ENV=dev` → migration B (`drop_shop_ops_poke`). It may be applied any
    time after the consoles are released in Stage 3 — it does not depend on the teardown. Applied
    before that, a console still open on the old build stops being told to refresh and falls back to
    a two-minute re-read: harmless, avoidable.
13. Check:
    - `core-api.dev.effyshopping.com` no longer resolves
    - the environment lists no container service, load balancer or image registry
    - `./stop-db.sh` then `./start-db.sh` stop and start the database without error

## Stage 5 — verification walk (fix forward until it passes)

Each line is walked on every surface named; a failure is recorded, fixed on the single backend,
and re-walked.

| # | Journey | Surfaces | Spec |
|---|---|---|---|
| 1 | Home, category, search with filters and each sort, paging to the end, product, promotion, postcode check | web, mobile | US1 |
| 2 | Save, lists (create, rename, delete, limits), move list to cart, second device shows the same | web, mobile | US2 |
| 3 | Cart: add (double-tap), change, remove, set aside, restore, reorder, sign-in merge, minimum-spend block | web, mobile | US2 |
| 4 | Promo: apply valid, remove, apply invalid / expired / exhausted; discount equals amount charged | web, mobile | US2, SC-011 |
| 5 | Checkout same-day: quote, pick window, pay new card, confirmation, receipt, shop sees it | web, mobile | US3 |
| 6 | Checkout standard: pick day, pay saved card | web, mobile | US3 |
| 7 | Abandon payment and restart → one order, one charge | web | US3 |
| 8 | Fill a window's last place from two sessions → one succeeds, one is told why | web | US3 |
| 9 | Saved cards: list, remove | web, mobile | US3 |
| 10 | Orders list and detail: stage, cancellable, refunded total | web, mobile | US4 |
| 11 | Customer cancel (allowed and refused), refund request (first and duplicate) | web, mobile | US4 |
| 12 | Back-office: item refund, goodwill refund, over-ceiling refused, decline request, cancel order | back-office | US4 |
| 13 | Shop manager refund own lines; non-manager refused; other shop's order refused | shop-web | US4 |
| 14 | Shop Today open → pay an order elsewhere → appears within 30 s, no error or "live" indicator; deactivate the operator's staff record → the next refresh is refused | shop-web | US5 |
| 15 | `make create-first-admin`, `make delete-admin` (last-admin refusal), `make load-localities` | operator | US6 |

**Measured during the walk** (provider test mode, scripted where volume is needed):

| Check | Target |
|---|---|
| Search and filter, warm | 95% < 1 s, 99% < 2 s (SC-004) |
| 200-item saved list | < 2 s (SC-005) |
| Start payment, including first request after idle | 95% < 6 s (SC-006) |
| First page after idle | < 4 s (SC-007) |
| 200 scripted checkouts with repeats and interruptions | 0 double charges, 0 incomplete paid orders, 0 unflagged oversold windows (SC-008) |
| 100 webhook deliveries with injected faults, duplicates, reordering | 100% handled (SC-009) |
| Simultaneous refunds on one order; a deliberately stalled refund | never over ceiling; resolved < 15 min (SC-010) |
| Shopper traffic at overload while staff requests run | 100% of the staff requests succeed (SC-013) |

The scripted rows (SC-008, SC-009, SC-010, SC-013, and SC-006 as a by-product) are the harness in
[`scripts/verify-070/README.md`](../../scripts/verify-070/README.md).

If SC-004, SC-006 or SC-007 cannot be met, stop and return to the operator (spec Assumptions).

## Stage 6 — close

14. Delete `apis/core-api/` (and with it the local env file holding test payment keys — rotate
    them if that file was ever shared), the container module, and the remaining references.
15. The one sweep command (also used by task T101):
    `grep -rIil "core-api\|core_api\|CORE_API\|hot path\|hot-path" . --exclude-dir={node_modules,.git,build,.next,.serverless}`
    Every file it lists must be on this allow-list: `FEATURE-HISTORY.md`; applied files in
    `db/migrations/`; anything under `specs/`; `CLAUDE.md` (only the `040` and `070` lines of the
    feature index); `.specify/memory/constitution.md` (only its Sync Impact Report); and the dated
    research records, which are history and are not rewritten — `docs/archive/` (the reference record of the retired service), `docs/research/`, `docs/prd/`,
    `docs/insights-architecture.md` and the per-feature notes in
    `docs/audiences/customer-capabilities.md` (each carries a dated note saying what 070 superseded;
    their current-state tables are corrected) (SC-015).
16. Write the `FEATURE-HISTORY.md` entry and `SIGNOFF.md`, recording the two deferred gaps
    (undelivered order-placed record; unswept abandoned orders) and the withdrawn 10-second promise.
