# Tasks: Back-Office Courier Override & Compensation

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included — proofs P1–P14 are the definition of done; each named one is broken once and restored.

Abbreviations: `EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features`,
`CW` = `apps/customer-web`, `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`,
`M1` = `db/migrations/<ts>_courier_override.sql`.

⚠ Claude writes code, SQL and Terraform; the operator runs `make db-up`, deploys and `make apply`.
⚠ **Only orders with a recorded delivery type move** (research R1) — every test fixture builds a typed order.
⚠ **Deploy order**: migrate → `notifications` → `orders` → `fleet` → `commerce`.
⚠ Known red before this feature: `EA/shop/src/attention/repository.container.test.ts` (079/080 SIGNOFF).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Scaffold M1 with `make db-new name=courier_override`.
- [X] T002 [P] In `ST/order-admin.ts` add `DeliveryCompensationKind`, `AdminDeliveryMoveDTO`, `DeliveryMovePreviewDTO`, `DeliveryMoveRequest` (both directions), `DeliveryMoveResponse`, the refusal codes union; `AdminOrderDetailDTO.deliveryMoves` (contracts § order detail).
- [X] T003 [P] In `ST/delivery-type.ts` add `OrderDeliveryDTO.moved` (contracts § customer) and `compensationLine(c, centsPerPoint?)` + `movedLine(to)` words; add cases to `ST/delivery-type.fixtures.json` (points, refund, none, to Effy).
- [X] T004 Regenerate contracts (`make cm-contract-gen`); compile customer-mobile (080's quicktype rename lesson); `pnpm -r typecheck`; record baseline container-suite counts in a scratch note for SIGNOFF.

---

## Phase 2: Foundational (blocks every story)

- [X] T005 Write M1 Up per [data-model.md](data-model.md): `public.delivery_override` with its CHECKs and FKs, index `(order_id, created_at)`, REVOKE UPDATE, DELETE FROM `effy_shopper`; widen `refund.kind` CHECK with `delivery` and `refund.reason` CHECK with `courier_override` (find the current constraint names first — later migrations may have replaced 055's); COMMENTs naming the one writer. Down refuses if any `delivery_override` row or `delivery` refund exists.
- [X] T006 Move `removeAssignment` and the `PASS_LOCK` statement from `EA/fleet/src/assignments/service.ts` to `EA/shared/src/delivery/driver-work.ts` (export from `delivery/index.ts`); fleet imports them. Move `announceDispatch` from `EA/fleet/src/lib/live.ts` to `EA/shared/src/live/` and re-export from fleet's file. **P14**: run the fleet suite green.
- [X] T007 [P] `EA/shared/src/points/ledger.ts`: `CreditInput.quiet?: boolean` skips `enqueueCredited`; test in `ledger.container.test.ts` (quiet credit writes the entry and no message).
- [X] T008 [P] `EA/shared/src/payments/refunds/`: `state.ts` adds `KIND_DELIVERY`, `REASON_COURIER_OVERRIDE` (NOT in `OPERATOR_REASONS`); `repository.ts` `recordIn(tx, input)` — the body of `record` without opening its own transaction (`record` now calls it), accepts an explicit `idempotencyKey`; `service.ts` `submitRecorded(refundId)` — submit an already-recorded `submitting` row through the existing `submit`/`markSubmitted`/points-return path and announcements. Tests in `refunds.container.test.ts` (record in a rolled-back tx leaves nothing; submitRecorded twice = one provider call).
- [X] T009 [P] `EA/shared/src/delivery/consignment.ts` `setCourierRouting(tx, orderId, {serviceId, collection} | null, actorSub)`: sets the order's `courier_service_id` / `courier_collection` (writing an `order_courier_collection_change` row only when a mode existed before), or clears both and cancels every `booked` consignment (event `cancelled`, note "moved to Effy delivery"); refuses `handed_over`+ with `ConsignmentRefusal("collection_locked")`. Cases in `consignment.container.test.ts`; `consignment.guard.test.ts` stays green.
- [X] T010 [P] Notification type: `EA/shared/src/lib/notification-types.ts` (+ any customer type list) `order_delivery_changed`; `EA/notifications/src/worker/copy.ts` push copy (to courier / to Effy); `EA/notifications/src/worker/email-sender.ts` reads `delivery_override` + order (+ service, window) and renders `order-delivery-changed`; `packages/email-kit/src/{catalog.ts,templates/order-delivery-changed.mjml,text/…,fixtures/…}` using `compensationLine`/`movedLine`. Tests beside each (email-kit snapshot, worker unit).

---

## Phase 3: User Story 1 — Move to courier with the default compensation (P1) 🎯 MVP

**Independent test**: a paid, typed Effy order not collected: move with `points_difference` → window released, no delivery work, customer credited quietly + notified, history row.

- [X] T011 [US1] `EA/shared/src/delivery/override.ts` pure `overrideAmounts({paidCents, courierCents, centsPerPoint, refundableCents})` → difference (≥ 0) and each choice's amount / points (`ceil`) / card cap; **P1** in `override.test.ts` (break once: drop the clamp).
- [X] T012 [US1] `override.ts` `loadMoveFacts(tx, orderId)`: order (paid, type, `updated_at`, `delivery_fee_amount`, breakdown inputs, postcode, customer), packages with handoff / arrival / consignment state / round status (collection & delivery, `assigned`/`picked_up`), booking, active courier plan + default service, points settings, refundable card cents (055 ceiling). One read used by preview and move.
- [X] T013 [US1] `override.ts` `guardMove(facts, "courier")` → refusal codes per research R3; `previewMove(q, orderId, "courier")` → `DeliveryMovePreviewDTO` (allowed/refusal, amounts, choices with default, courier block with collection `hub` if any `picked_up` else the platform default).
- [X] T014 [US1] `override.ts` `moveToCourier(tx, {orderId, actorSub, reason, compensation, note, expectedUpdatedAt, expectedAmountCents, now})`: `PASS_LOCK` → facts (order `FOR UPDATE`) → guards → `changed` / `compensation_changed` → package rewrite (R5) → delivery `round_package` removal via `removeAssignment` (planned delivery rounds); collection `assigned` removal only when collection is `supplier` → release booking (R6) → `setCourierRouting` → `recordDeliveryType(tx, {actor staff, change: {to:"courier", reason:"staff_change", courierEstimate: service.estimate_text, note: reason}})` → insert `delivery_override` → compensation (points `credit(..., quiet:true, dedupeKey:"courier_override:<id>")` or `recordIn` refund kind `delivery`, key `courier_override:<id>`) and set `points_entry_id` / `refund_id` → `notification_request` push + email rows. Returns `{override, driverIds, refundId?}`. Export from `delivery/index.ts`.
- [X] T015 [US1] **P2, P3, P5, P10** in `EA/shared/src/delivery/override.container.test.ts`: full effect in one tx; slot load drops by one; hub keeps collection, supplier drops it; failure injected after the credit rolls back everything (break P3 once: credit outside the tx); courier dearer → 0 and `grand_total` unchanged; notification rows once.
- [X] T016 [US1] Orders service: `EA/orders/src/delivery-move/{service,repository}.ts` — `preview(orderId, to)` and `move(orderId, body, sub)` (validation per contracts; `withTransaction(moveToCourier)`; after commit `announceOrder`, `announceDispatch(driverIds)`, `announceSlots`, `refundService.submitRecorded` when a refund was recorded, metrics `DeliveryOverrides {to}` / `DeliveryCompensation {kind}`); `deliveryMoveError(err, scope)` mapping refusals to 409 problem codes.
- [X] T017 [US1] Functions `EA/orders/src/functions/order-delivery-move-v1-get.ts` (`requireReader`) and `order-delivery-move-v1-post.ts` (`requireWriter`); register both in `EA/orders/serverless.yml` (staff gateway); `gateway-capacity.contract.test.ts` stays under 300; `change-map.guard.test.ts` passes for the POST.
- [X] T018 [US1] **P6, P7** in `EA/orders/src/delivery-move/delivery-move.container.test.ts`: each refusal (handed over, delivered, out for delivery, no type, unpaid, courier not ready); stale `expectedAmount` → 409 with the new preview; a second POST → `already_courier` and one credit (break P7 once: drop the expected-amount check).
- [X] T019 [US1] `BO/orders/components/SendByCourierDialog.tsx` (+ test): reason (required, ≤ 500), the preview's amounts as detail rows, a radio list of choices with "points for the difference" preselected and "refund the difference" marked last resort, note field for `none`, confirm; shows refusal line when `allowed:false`; on `compensation_changed` shows the new amounts and asks again. `BO/orders/{repo,queries}.ts` preview query + move mutation (invalidate the order); `BO/orders/errorText.ts` the new codes; action in `BO/orders/OrderDetailScreen.tsx` offered to writers only (`access.ts`).

---

## Phase 4: User Story 2 — Other compensation choices (P1)

**Independent test**: one move per choice; each gives exactly the previewed amount by the named means.

- [X] T020 [US2] **P4** in `override.container.test.ts` + `delivery-move.container.test.ts`: `free_delivery_points` (points for the paid charge), `free_delivery_refund` and `refund_difference` (refund kind `delivery` recorded in the tx, submitted after commit through the fake gateway, capped at refundable), `none` (note required; nothing given); a points-paid order's refund follows the split. Break once: refund amount from the request instead of the recomputation.
- [X] T021 [US2] Back-office: refund choices show card amount / points returned from the preview; the refund status (`submitted`, `stalled`, `refused`) is shown after confirm in `SendByCourierDialog.tsx`; tests for each choice's rendering.

---

## Phase 5: User Story 3 — Move back to Effy (P2)

**Independent test**: move to courier, then back with an open window → place taken, booked consignment cancelled, customer told, no money.

- [X] T022 [US3] `override.ts` `guardMove(facts, "effy")` (not courier, handed over / delivered, `coverageForPostcode` ≠ `effy` → `not_in_area`) and `previewMove(…, "effy")` windows from `effyDays` / `openWindows` with the slot settings and load (the quote's calendar, never a second one).
- [X] T023 [US3] `override.ts` `moveToEffy(tx, …)`: `PASS_LOCK` → facts → guards → `lockSlot` + `judgeWindow` must be `open` else `window_unavailable` → upsert the booking (`confirmed`, new slot/date/window) → package rewrite to the window (`same_day` when today Melbourne, else `standard`) → `setCourierRouting(null)` → `recordDeliveryType(to:"effy", courierEstimate:null)` → `delivery_override` row (`compensation none`, amount 0, taken window) → notification rows.
- [X] T024 [US3] **P9** in `override.container.test.ts` and `delivery-move.container.test.ts`: full window refused; handed-over refused; not on Effy's list refused; booked consignment cancelled; no points/refund rows; earlier compensation untouched. Break once: skip `judgeWindow`.
- [X] T025 [US3] `BO/orders/components/DeliverByEffyDialog.tsx` (+ test): reason, window list from the preview (date + time, grouped by day), confirm; action on `OrderDetailScreen.tsx` for writers when the order is courier.

---

## Phase 6: User Story 4 — Visible and accountable (P2)

**Independent test**: move to courier and back; an agent sees both history rows and no actions; customer sees the moved line without the reason.

- [X] T026 [US4] Orders detail: `EA/orders/src/orders/{repository,service}.ts` read `delivery_override` ⨝ `order_delivery_type_change` ⨝ `admin.staff` (name) ⨝ service ⨝ refund status → `deliveryMoves`; **P8** in `delivery-move.container.test.ts` (CSA: GET shows history, POST 403).
- [X] T027 [P] [US4] `BO/orders/components/DeliveryHistory.tsx` (+ test): one row per move — when, who, from → to, reason, window released/taken, amounts, compensation and refund status; inside `DeliveryTypeSection.tsx`, visible to every role.
- [X] T028 [P] [US4] Commerce: `EA/commerce/src/orders/{repository,service}.ts` add `delivery.moved` (latest `delivery_override`: to, at, compensation kind points|refund, amount, points) — never reason/fee/difference; **P11** in the commerce orders container test (break once: leak `reason`).
- [X] T029 [P] [US4] Customer web: `CW/components/receipt/ArrivalPanel.tsx` shows `movedLine` + `compensationLine` from `@effy/shared-types` when `delivery.moved` is present; test beside it.
- [X] T030 [P] [US4] Customer mobile: `CM/features/checkout/presentation/DeliveryTypeWords.kt` gains `movedLine` / `compensationLine` (twins); `ReceiptScreen.kt` / `OrdersScreen.kt` show them; **P13** host test pinned to `delivery-type.fixtures.json`.
- [X] T031 [US4] Alarm: `infra/envs/dev/courier-alarms.tf` `DeliveryOverrides` (namespace `Effy/Orders`, sum over 86400 s) `> var.delivery_override_daily_alarm` (default 5, declared in `variables.tf`), missing data not breaching, to the alerts topic; extend `EA/orders/src/courier-alarms.contract.test.ts`; `terraform fmt` + `validate`.

---

## Phase 7: Polish & cross-cutting

- [X] T032 **P12** guard `EA/shared/src/delivery/override.guard.test.ts`: no UPDATE/DELETE of `delivery_override` anywhere; INSERT only in `override.ts`; `REASON_COURIER_OVERRIDE` absent from `OPERATOR_REASONS`; `removeAssignment` defined once. Break once (a second INSERT site).
- [X] T033 Run every affected suite (shared, orders, fleet, commerce, notifications, back-office, customer-web, shared-types, email-kit, customer-mobile host tests), `pnpm -r typecheck`, design-system guards, `scripts/check-no-refresh-timers.sh`, `scripts/check-shop-delivery-words.sh`; compare with the T004 baseline.
- [X] T034 [P] Docs: `docs/order-console-guide.md` (Send by courier… / Deliver by Effy… / history), `docs/runbooks/courier-override.md` (NEW: when to use it, choosing compensation, a stalled refund, moving back).
- [X] T035 `specs/081-courier-override-compensation/SIGNOFF.md`, `FEATURE-HISTORY.md` 081 entry (with the deploy order and the walk prerequisites), CLAUDE.md "Features recorded" line + one bullet under the driver-logistics section, backlog E7 status.

---

## Dependencies

- Setup (T001–T004) → Foundational (T005–T010) → US1 (T011–T019).
- US2 (T020–T021) needs US1's `moveToCourier` and route.
- US3 (T022–T025) needs T012 (facts), T009 (routing), T016–T017 (routes); independent of US2.
- US4: T026–T027 need T005 only (read model) but are verified after US1; T028–T030 need T003; T031 independent.
- Polish last.

## Parallel examples

- Foundational: T007, T008, T009, T010 together after T005/T006.
- US4: T027, T028, T029, T030, T031 together.

## Implementation strategy

MVP = Phases 1–3 (move to courier with the default points compensation, back-office dialog). Then US2
(choices), US3 (move back), US4 (history, customer line, alarm), polish. Each phase ends with its proofs
green and the named one broken once.
