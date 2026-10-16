# Implementation Plan: Package Scanning — Foundations

**Branch**: `dev` (feature directory `090-scanning-foundation`) | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

Everything under the scanning screens, ahead of the redesign ([research.md](research.md)): one append-only
hand-over record (R1) fed by optional per-package methods on every hand-over (R2); the server's hub
instruction per package on the collection run (R3); a "load the van" route (R4); one scan rule and a
token twin in the app's common code (R5); and a camera reader on both platforms (R6).

## Technical Context

**Language/Version**: TypeScript / Node 22 Lambdas; Kotlin 2.4 / CMP 1.11 (driver app).
**Primary Dependencies**: `com.google.mlkit:barcode-scanning` (bundled model, Android only) — the one addition. iOS uses AVFoundation (system).
**Storage**: PostgreSQL 16 — one migration ([data-model.md](data-model.md)).
**Testing**: Vitest + container tests (driver), shared-types tests, driver-mobile host tests, Android/iOS builds ([quickstart.md](quickstart.md) P1–P7).
**Target Platform**: driver Lambda (shared gateway); Android + iOS driver app.
**Constraints**: works offline; installed driver builds unaffected (all fields optional); no screens.
**Scale/Scope**: a handful of packages per hand-over.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Screens explicitly out of scope. |
| II. Shared contracts | ✅ | `driver.ts` additions; Kotlin contract regenerated; one token fixture for TS and Kotlin. |
| III. One backend; gateways | ✅ | +1 route on `driver` (shared gateway). |
| III. One implementation | ✅ | One hand-over writer; one hub-sort function; one scan rule; one token parser per language, pinned to one fixture. |
| IV. Auth isolation | ✅ | Driver-scoped routes as today. |
| V. Design | ✅ | No UI shipped; the reader is a component. |
| VI. Layering | ✅ | Rule and debouncer pure in `commonMain`; platform reader behind `expect`. |
| VII. Observability | ✅ | `package_handover` is itself the measurement H12 reads. |
| Live updates / 072 | ✅ | Load announces; registered in `open.guard.test.ts` and the change map. |
| Operator runs live changes | ✅ | Migration and deploy handed over. |

## Project Structure

```text
db/migrations/20261016160000_package_handover.sql                         NEW
packages/shared-types/src/driver.ts ; package-code.fixtures.json (NEW) ; contract-driver regenerated
apis/edge-api/driver/src/work/{handover,hub-sort,load}.ts (+ tests)        NEW
apis/edge-api/driver/src/work/{complete,service}.ts ; proof/repository.ts ; work/return.ts
apis/edge-api/driver/src/functions/driver-delivery-load-v1-post.ts        NEW ; serverless.yml
apps/driver-mobile/shared/src/commonMain/.../core/scan/{PackageToken,ScanRule,ScanContexts,ReadDebouncer,PackageScanner}.kt   NEW
apps/driver-mobile/shared/src/{androidMain,iosMain}/.../core/scan/PackageScanner.*.kt                                         NEW
apps/driver-mobile/shared/src/commonMain/.../features/{collection,delivery}/{domain,data}  codes mapped into the domain
```

## Deploy order (operator)

Migration → `driver`. No app release is required until the redesign's screens use the reader.
