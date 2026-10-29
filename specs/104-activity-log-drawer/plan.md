# Implementation Plan: Every Activity Log in One Drawer

**Branch**: `104-activity-log-drawer` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

## Summary

One wire shape for every log (`ActivityEntryDTO` in a 103 keyset `ListPage`), one server helper that pages,
searches, filters and exports any log (`@effy/edge-shared` `lib/activity.ts`), and one drawer
(`@effy/web-kit/activity-log`) built on 103's `DataTable`. Each log becomes an **activity source** — a raw-SQL
`SELECT` scoped to one record that yields `(id, at, kind, action, actor, search_text, facts)` — plus a function
that turns a row into words. Twelve logs move; the inline UIs are deleted.

## Technical context

- **Constitution**: Principle III (one serverless backend — every route in `apis/edge-api`, no new runtime),
  VI (raw SQL, repository → service → handler; no ORM), VII (typed PostHog taxonomy, no PII), 103's rule
  "every console list is `DataTable` + `parseListQuery`; the URL is a list's state".
- **Gateways**: staff 203/300 → **+5** read routes (orders, fleet, catalog, admin ×1, orders points settings) =
  208 (69%). Shared 165/300 → **+1** (inventory, a product's stock activity) = 166. Neither near 75%.
- **No migration.** Every log reads tables that exist; indexes: `audit_log_target_idx (target_type, target_id,
  created_at DESC)` serves every audit source; the others are scoped by a record id that is already indexed.

## Design

### Wire (`@effy/shared-types` `activity-log.ts`)

```ts
interface ActivityEntryDTO {
  id: string; at: string; kind: string;      // kind: one of the log's ACTIVITY_LOGS[log].kinds
  title: string; detail: string | null;      // words, composed on the server (search + CSV say the same)
  subject: string | null;                    // what it was on: "Package 2 · bag 1", "1 kg"
  actor: string | null;                      // a name or "Effy" / "Effy driver" / "Customer" / "System"
  tone: "default" | "primary" | "done" | "problem";
}
type ActivityPage = ListPage<ActivityEntryDTO>;          // 103 keyset envelope
interface ActivityExportDTO { csv: string; rows: number } // ?export=csv on the same route
ACTIVITY_LOGS: Record<ActivityLogId, { kinds: Record<string, string>; subjects?: string }>
```

Query (same route as the page): `q`, `sort=at`, `dir`, `pageSize`, `cursor`, `kind`, `from`, `to` (days,
Melbourne), `sub` (a log-specific subject id — a stock log's size), `export=csv`.

### Server (`@effy/edge-shared` `lib/activity.ts`)

- `ACTIVITY_ORDER` — keyset on `e.at`, tie-break `e.id` (text: sources union several tables, so ids are
  prefixed `fe:`, `ph:` …).
- `parseActivityQuery(qs, log)` — `parseListQuery` with `kind` ∈ the log's kinds, `from`/`to`, `sub`.
- `readActivity(source, req)` wraps the source: `SELECT … FROM (<source>) e WHERE kind/day-range/search
  [keyset] ORDER BY e.at, e.id LIMIT n+1` plus a capped count. **Search** = `e.search_text ILIKE` (the raw facts:
  names, numbers, notes, reasons) **or** `e.actor ILIKE` **or** `e.action = ANY(actions whose words contain q)`
  — so the words composed in TypeScript are searchable without storing them.
- `exportActivity(source, req, log)` — same filters, no paging, `LIMIT cap+1`; past the cap a
  `ListQueryError("too_deep", ACTIVITY_EXPORT_TOO_MANY)` (422 via `activityProblem`). CSV: When (Melbourne,
  `YYYY-MM-DD HH:mm`), Type, What, Detail, On, Who; formula-leading cells are quoted with `'` (CSV injection).
- `activityResponse(event, scope, log, source)` — the handler's whole body: parse, page or export, map errors.
- `actorNameSql(sub)` — the one name lookup (admin staff → shop staff → driver), so no log shows a `sub`.

### Client (`@effy/web-kit/activity-log`)

- `activityLogSearch` — a `defineListSearch` prefixed `log.` (keyset, `at` desc, filters kind/from/to/sub) and an
  open flag `log=1`; `withActivityLog(raw)` is merged into the hosting route's `validateSearch`.
- `useActivityLog()` → `{ open, show(), close() }` (push on open, so Back closes it; close clears `log.*`).
- `<ActivityLogDrawer log title description queryKey fetchPage fetchExport subjects? app>` — vaul Drawer from the
  right, `w-[calc(100%-1rem)] md:w-1/2 md:min-w-[40rem]`, bottom sheet on a phone. Toolbar: Type facet,
  `DateRangeFacet`, Size/On facet when `subjects`, search, Export. Body: `DataTable` — When (sortable: newest /
  oldest) · What (tone mark, title, detail) · On · Who.
- `ActivityButton` / `useActivityAction()` — the two ways a page opens it (menu item where the page has a More
  menu, else an outline button). `useActivityLog().show({ sub })` opens it already narrowed (a size's row).
- Telemetry: `activity_log_opened`, `activity_log_exported {rows}`, `activity_log_export_refused`, through the
  existing 103 list sink (`ListEvent`), with `log` only. `list_viewed` / `list_filtered` follow from
  `useListState` with list id `activity:<log>`.

### Per log

| Log id | Service · route | Source |
|---|---|---|
| `bo-order` | orders · **new** `GET /orders/v1/orders/{orderId}/activity` | fulfillment_event, carrier_handoff, package_arrival, package_handover (per bag), order_delivery_type_change, order_courier_collection_change, delivery_override, courier_consignment_event, refund |
| `bo-shop` | admin · `GET /admin/v1/shops/{shopId}/audit` (now this shape) | audit_log shop + its shop_staff |
| `bo-driver` | fleet · `GET /fleet/v1/drivers/{driverId}/audit` (now this shape) | audit_log driver |
| `bo-vehicle` | fleet · **new** `GET /fleet/v1/vehicles/{vehicleId}/activity` | audit_log vehicle (holdings named via vehicle_holding/driver) |
| `bo-product` | catalog · **new** `GET /catalog/v1/products/{productId}/activity` | audit_log product + the shop's creation |
| `bo-promotion` | admin-promotions · `GET /admin/v1/promotions/{id}/audit` (now this shape) | audit_log promotion |
| `bo-points` | orders · `GET /orders/v1/customers/{customerId}/points/history` (now this shape) | points_entry |
| `bo-points-settings` | orders · **new** `GET /orders/v1/points/settings/activity` | points_settings_change |
| `bo-email` | admin · **new** `GET /admin/v1/deliverability/{address}/activity` | email_delivery_event |
| `shop-team` | shop · `GET /shop/v1/team-activity` (now this shape, no 14-day window) | fulfillment_event, stock_movement, refund |
| `shop-order` | shop · `GET /shop/v1/orders/{id}/activity` (now this shape) | fulfillment_event, refund, package_arrival |
| `shop-stock` | inventory · **new** `GET /inventory/v1/products/{productId}/stock/activity` | stock_movement |

Embedded copies the pages no longer read are removed from their DTOs (no compatibility fields, 2026-10-23).

## Guards

- `activity.guard.test.ts` (edge-shared): every activity route's handler calls `activityResponse`, and every route
  that does is named.
- `activity-logs.guard.test.ts` (each console): no feature screen renders `Timeline` except the named
  conversations (feedback thread, order notes); no `*History*` / `AuditTrail` / `*ActivitySheet` component.
- `activity.test.ts`: parsing, search-word matching, CSV escaping and formula quoting, Melbourne time, export cap.
- `ActivityLogDrawer.test.tsx` (web-kit): closed reads nothing; opens through the address; a shared link restores
  search and Type; export sends the filters and says how many; a too-big export is refused in words; close forgets.
- Container tests that read a log use `activityEntries` (`@effy/edge-shared/testing`).

## Not changed (follow-up)

- The per-size stock reads (`GET /inventory/v1/variants/{id}/stock` and back-office's admin twin) still embed
  their first page of movements and answer `?movements=page`. Nothing reads either now; removing them touches every
  stock write's answer, so it is left for its own change.

## Operator steps

Deploy `orders fleet catalog admin admin-promotions shop inventory`, then both consoles. No migration.
