# Implementation Plan: Driver App Redesign

**Branch**: `dev` (feature directory `092-driver-mobile-redesign`) | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

Rebuild the driver app's screens from the canvas (`docs/reference-screens/Effy Driver Mobile v2/`) on the
existing ViewModels and offline machinery: the storefront identity (constitution v3.5.0), three tabs, two-tap
drops, the scanning screens on 090's parts, and two small additive server fields (customer phone, next courier
pickup). Decisions: [research.md](research.md) R1–R10.

## Technical Context

**Language/Version**: Kotlin 2.4 / Compose Multiplatform 1.11 (driver app); TypeScript (driver service, design-system generators).
**Primary Dependencies**: none new (Geist and Lucide are files; ML Kit arrived in 090).
**Storage**: none.
**Testing**: host tests, Android/iOS builds, token and guard scripts, driver container tests.
**Target Platform**: Android + iOS phones; tablet rail.
**Constraints**: every screen offline-capable; installed builds keep working (fields optional); ≥48 dp targets.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Two decisions recorded in the spec (identity, call). |
| II. Shared contracts | ✅ | Two optional DTO fields; Kotlin contract regenerated. |
| III. One backend | ✅ | No route added. |
| V. Design | ✅ | v3.5.0 moves the driver app to the storefront identity; one theme file (generated); kit app-local. |
| VI. Layering | ✅ | ViewModel → use case → repository unchanged. |
| VII. Observability | ✅ | Analytics events keep their names; removed screens' events retired. |

## Project Structure

```text
packages/design-system/scripts/{gen-compose-theme,gen-lucide-drawables}.mjs ; compose-driver/* (regenerated)
apps/driver-mobile/shared/src/commonMain/composeResources/{font,drawable}
apps/driver-mobile/shared/src/commonMain/kotlin/.../core/presentation/   (the driver kit - NEW files)
apps/driver-mobile/shared/src/commonMain/kotlin/.../core/scan/ScanPanel.kt (+ platform ScanFeedback)
apps/driver-mobile/shared/src/commonMain/kotlin/.../features/{today,collection,delivery,history,account,auth,onboarding}/presentation/*
apps/driver-mobile/shared/src/commonMain/kotlin/.../app/{DriverShell,App}.kt ; core/nav/DriverRoutes.kt
DELETED: features/map, features/activity, core/placeholder, */PlaceholderData.kt, EnRouteScreen, ArrivedScreen, ShiftClock + day stats
apis/edge-api/driver/src/work/{delivery,complete}.ts ; packages/shared-types/src/driver.ts
scripts/driver-guard.sh (NEW)
```

## Deploy order

`driver` service (two optional fields) → the driver app build.
