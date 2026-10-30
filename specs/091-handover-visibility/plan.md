# Implementation Plan: Scan Versus Manual Visibility

**Branch**: `dev` (feature directory `091-handover-visibility`) | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

Three read-only, additive reads of 090's `package_handover`, each in the service that already owns the
screen - no new route, no migration:

| Screen | Service / read | Field |
|---|---|---|
| Order (back-office) | `orders` - order detail packages | `AdminOrderPackageDTO.handovers[]` `{ step, method, at, driverName }` |
| Round (dispatch) | `fleet` - `readRound` stops | `handovers?: { scan, typed, manual }` per stop (records on THIS round) |
| Shop (back-office) | `admin` - shop detail | `ShopDetailDTO.labelScanning?: { scanned, notScanned, sinceDays: 30 }` |

## Technical Context

TypeScript Lambdas (orders, fleet, admin); React 19 back-office. No new dependency. Testing: container tests
per service, back-office component tests.

## Constitution Check

| Principle | Verdict |
|---|---|
| II. Shared contracts | ✅ additive fields in `@effy/shared-types` |
| III. One backend; gateways | ✅ no route added (staff gateway unchanged) |
| IV. Auth isolation | ✅ staff reads only; no customer/shop/driver contract gains a field (FR-005) |
| V. Design | ✅ lines and inline counts in existing tables - no cards |
| VI. Layering | ✅ SQL in repositories |

## Project Structure

```text
packages/shared-types/src/{order-admin,dispatch,shop}.ts
apis/edge-api/orders/src/orders/{repository,service}.ts
apis/edge-api/fleet/src/dispatch/{sql,service}.ts
apis/edge-api/admin/src/shops/{repository,handler-support}.ts
apps/back-office/src/features/{orders/components/PackageRows,dispatch/RoundDetailScreen,shops/ShopDetailScreen}.tsx
```

Deploy: `orders`, `fleet`, `admin`, then back-office.
