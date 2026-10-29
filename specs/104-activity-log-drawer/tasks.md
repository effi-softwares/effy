# Tasks: Every Activity Log in One Drawer (104)

All built 2026-10-29. Not deployed or walked.

## Foundation
- [x] T001 `@effy/shared-types` `activity-log.ts` — `ActivityEntryDTO`, `ActivityPage`, `ActivityExportDTO`, `ACTIVITY_LOGS` (each log's kinds and "On" header), export cap and its sentence, actor words
- [x] T002 `@effy/edge-shared` `lib/activity.ts` — `parseActivityQuery`, `readActivity`, `exportActivity`, `activityResponse`, `staffNameSql`, CSV (`csvCell` defuses formulas), `activity.test.ts`
- [x] T003 `@effy/edge-shared/testing` `activityEntries` for container tests
- [x] T004 `@effy/web-kit/activity-log` — `ActivityLogDrawer`, `ActivityButton`, `useActivityAction`, `useActivityLog`, `withActivityLog`; three telemetry events through the 103 list sink; `ActivityLogDrawer.test.tsx`

## Back-office logs
- [x] T010 Order — new `GET /orders/v1/orders/{orderId}/activity` (nine sources); History tab, package hand-overs, moves by back-office, delivery-type history, courier collection changes and consignment steps removed from the page and from `AdminOrderDetailDTO`
- [x] T011 Shop — `/admin/v1/shops/{shopId}/audit` answers through `activityResponse`; Activity tab removed
- [x] T012 Driver — `/fleet/v1/drivers/{driverId}/audit` (was capped at 100); Change history tab removed; `DriverAuditEntry` removed
- [x] T013 Vehicle — new `/fleet/v1/vehicles/{vehicleId}/activity` (changes, issues/returns named with driver and note, cleared checks); Handover history tab and `VehicleDetail.holdings` removed
- [x] T014 Product — new `/catalog/v1/products/{productId}/activity` (was capped at 200); History tab and `BackOfficeProductDTO.history` removed
- [x] T015 Promotion — `/admin/v1/promotions/{id}/audit` (was capped at 100); History tab removed
- [x] T016 Customer points — `/orders/v1/customers/{customerId}/points/history`; History tab removed; staff overload of the points `history` read and `StaffPointsHistory*` types removed
- [x] T017 Points rules — new `/orders/v1/points/settings/activity`; Changes panel and `PointsSettingsDTO.history` removed (was capped at 50)
- [x] T018 Email address — new `/admin/v1/deliverability/{address}/activity`; History panel and `events` removed (was capped at 50)

## Shop-web logs
- [x] T020 Team activity — `/shop/v1/team-activity` (was the newest 50 of 14 days); sheet removed
- [x] T021 Order activity — `/shop/v1/orders/{id}/activity`; sheet removed. Defect fixed: once an order had an arrival, its item, note and tag events vanished from the log (`NOT (NULL LIKE … AND …)`)
- [x] T022 Stock activity — new `/inventory/v1/products/{productId}/stock/activity` with a Size filter; the Activity sheet's change log and the Stock movements list removed; a size's History opens the drawer at that size

## Guards and words
- [x] T030 `activity.guard.test.ts` (edge-shared), `activity-logs.guard.test.ts` (both consoles); `list-query`, `delivery-type`, `list-screens` guards updated
- [x] T031 `REFUND_REASON_WORDS` (shared-types) — refunds said in words in both order logs
- [x] T032 Every source run against the real migrations on a local Postgres (seeded order, shop, stock, vehicle, driver, points, email rows; search, Type, dates, both orders, cursor, export)

## Operator
- [ ] T040 Deploy `orders fleet catalog admin admin-promotions shop inventory`, then both consoles (no migration)
- [ ] T041 Walk: each of the twelve drawers — open from the page, search, Type, dates, oldest first, next page, export; Back closes; a shared link reopens
