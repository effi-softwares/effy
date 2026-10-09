# Implementation Plan: Cutover to the New Delivery Model

**Branch**: `dev` (feature directory `083-delivery-model-cutover`) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

The last build epic of the delivery model v2 programme (E9), in **two stages released separately**.

**Stage 1 — the switch.** A go-live checklist (one definition), an admin-only setter for the existing
switch (`delivery_settings.delivery_model_v2_from`) that refuses while the platform is not ready, a
5-minute sweep that blocks a scheduled moment whose readiness has broken, and a count of old-kind orders
still open. Nothing about the new model itself changes — 076–082 built it.

**Stage 2 — removal**, only once no old-kind order is open: the old checkout path, old-only settings
and columns go; a marker makes the model permanently on; the docs describe one model.

Decisions ([research.md](research.md)):

1. **Readiness is one shared TypeScript function** (R2), used by the page, the setter and the sweep.
2. **No new table**: the switch is the existing column; who/when/why is the audit log (R3).
3. **A sweep, not a smarter reader**, enforces "not ready ⇒ does not switch" (R4).
4. **Old-kind = no recorded delivery type; open = paid, not all arrived, not fully refunded** — one SQL
   fragment (R5).
5. **Stage 2's migration refuses while an old order is open** and leaves a marker (R7).
6. **Kept on purpose**: the method columns (they are the customer's word for an Effy order), the table
   names, and the compatibility fields installed driver and supplier apps read (R7). No app-update
   mechanism is built; the customer app release is a runbook step before the switch (R6).

## Technical Context

**Language/Version**: SQL (PostgreSQL 16, Goose); TypeScript / Node 22 Lambdas; React 19 (back-office,
customer-web); Kotlin 2.4 / CMP (customer app); Terraform (alarms).
**Primary Dependencies**: none added.
**Storage**: two migrations, one per stage ([data-model.md](data-model.md)).
**Testing**: container tests (shared, admin, commerce, orders, fleet, driver, shop), goose container test
for migration 2, guards and scripts, back-office and customer-web component tests, customer-mobile host
tests ([quickstart.md](quickstart.md) P1–P15).
**Target Platform**: stage 1 — `admin` (staff gateway), `orders`, back-office. Stage 2 — `shared` (every
service bundles it), `commerce`, `storefront`, `orders`, `admin`, back-office, customer-web,
customer-mobile.
**Performance Goals**: the quote's path is unchanged in stage 1 and one query shorter in stage 2.
**Constraints**: old orders unchanged to completion; never charge what was not shown; installed driver
and supplier apps keep working; customers keep "Same-day"/"Standard"; no polling; no cards.
**Scale/Scope**: staff gateway 156 → 158 of 300. Stage 2 touches ~75 source files, mostly deletions.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec carries no technology; one correction from planning (no app-update notice) recorded. |
| II. Shared contracts | ✅ | Go-live DTOs in `@effy/shared-types`; stage 2 removes fields from the quote/intent/settings types and regenerates the customer contract. |
| III. One backend; gateways | ✅ | No new service; +2 routes and a scheduled function on `admin` (staff). |
| III. One implementation | ✅ | Readiness once; the switch has one reader and now one writer; old-kind/open once. |
| IV. Auth isolation | ✅ | Setter = admin from the staff record; read = any active staff. |
| V. Design | ✅ | Go-live is a checklist table and detail rows — no cards, no metric tiles. |
| VI. Layering | ✅ | Readiness and legacy SQL in shared; thin handlers. |
| VII. Observability | ✅ | `DeliveryModelSwitchReady`, `…Blocked`, `LegacyOrdersOpen`, `…PastDue`; two alarms + the sweep's failure alarm. |
| Live updates | ✅ | The setter announces ops `delivery`; no screen polls. |
| Operator runs live changes | ✅ | Both migrations, deploys, `make apply`, and SETTING THE SWITCH are the operator's. |

Post-design re-check: no violation. No constitution amendment needed (no principle names the old model —
re-verified as a task).

## Project Structure

```text
# Stage 1
db/migrations/<ts>_delivery_model_cutover.sql
packages/shared-types/src/delivery-admin.ts                      # GoLiveDTO, switch request
apis/edge-api/shared/src/delivery/{readiness,legacy}.ts (+ tests, guard)
apis/edge-api/admin/src/delivery/go-live.{service,repository}.ts + functions (get, switch put, sweep)
apis/edge-api/admin/serverless.yml
apis/edge-api/orders/src/orders/repository.ts                    # delivery=legacy&open=true
infra/envs/dev/delivery-model-alarms.tf (+ variables)
apps/back-office/src/features/delivery/golive/*                  # Go-live tab
docs/runbooks/delivery-model-v2-cutover.md

# Stage 2
db/migrations/<ts>_retire_delivery_model_v1.sql
apis/edge-api/shared/src/delivery/{quote,zone,slots,windows,model,index}.ts ; delete sameday.ts, standard-days.ts (keep nonDeliveryDates)
apis/edge-api/commerce/src/checkout/{service,delivery-choice,quote,store}.ts ; functions/checkout-intent-v1-post.ts
apis/edge-api/orders/src/orders/promise.ts
apis/edge-api/admin/src/delivery/{service,repository,coverage.*}.ts ; apis/edge-api/fleet/src/{capabilities,deliverydays,slots}/*
packages/shared-types/src/{delivery,delivery-admin,checkout*,driver,shop-order*}.ts ; contract regenerated
apps/back-office/src/features/delivery/* ; apps/customer-web/app/checkout/* ; apps/customer-mobile/.../features/checkout/*
scripts/check-no-legacy-delivery.sh
db/seeds/047_delivery_dev.sql
CLAUDE.md ; docs/archive/delivery-model-v1.md ; docs/*guide*.md ; specs/047*, specs/069* headers
```

## Build order

**Stage 1**: 1. Migration 1 + types. 2. `readiness.ts` (P1), `legacy.ts` (P8). 3. Setter + audit (P2, P3),
guard (P5). 4. Sweep + metrics + alarms (P4). 5. Go-live read. 6. Orders `open=true`. 7. Back-office
Go-live tab (P9). 8. Across-the-moment and old-order proofs (P6, P7). 9. Runbook. → **deploy, walk V1–V6.**

**Stage 2** (after the old-order count is zero): 10. Migration 2 + goose proof (P10). 11. Shared: marker
read, delete the 069 quote path (P11). 12. Commerce intent/choice. 13. Orders promise. 14. Admin/fleet
settings and capabilities (one row per clearance). 15. Types + contract. 16. Customer web + mobile
checkout (P15). 17. Back-office delivery screens. 18. Guard script (P14), old-order reads (P12),
compatibility fields (P13). 19. Seeds. 20. Docs: CLAUDE.md, archive page, guides, superseded headers,
FEATURE-HISTORY. → **deploy, walk V7–V10.**

## Risks

| Risk | Limit |
|---|---|
| Switching on a platform that cannot price or deliver | Required readiness at set time AND until the moment (sweep) |
| A customer charged for what they were not shown across the moment | The intent's existing refusals; P6 |
| An old order stranded | Nothing in stage 1 changes its path; P7; the count and its alert |
| Stage 2 applied too early | The migration refuses; P10 |
| A customer on a pre-078 app cannot check out after the switch | Runbook step before the switch; recorded as the operator's check |
| An installed driver/supplier app breaks in stage 2 | Compatibility fields kept; P13 |
| A dropped column still read somewhere | Reader audit per column + existing guards + full container suites before migration 2 is handed over |
| Turning back after new-model orders exist | Those orders are typed and handled by 079–082 regardless of the switch; P3 |

## Complexity Tracking

| Trade-off | Why | Rejected |
|---|---|---|
| Two migrations and two deploys | Removal cannot be true until old orders close | One release: either strands old orders or leaves the old path forever |
| A sweep to block a scheduled switch | Keeps the checkout's reader a one-line function | Readiness inside `delivery_model_v2_at`: the fee engine in every quote |
| Compatibility fields kept on two wires | No app-update mechanism exists | Building a version gate across six apps inside the cutover |
| Method columns and table names kept | They are still read and correct | A rename/drop for tidiness that touches every reader |
