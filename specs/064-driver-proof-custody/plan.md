# Implementation Plan: Driver Proof of Delivery & Custody

**Feature**: 064-driver-proof-custody · **Date**: 2026-09-21 · **Spec**: [spec.md](spec.md)
**Research**: [research.md](research.md) · **Status**: Draft

## Summary

Make a delivery evidenced, make a failed delivery recordable, and make custody continuous.

The slice is smaller than it first appears on the client and larger than it appears on the server.
Research found the mobile capabilities already built (R8) and found that **a same-day order cannot
currently reach `delivered` at all** (R2) — the driver who hands the package over has no way to say
so, and the only writer of that status is a back-office admin asserting a carrier delivery. So the
proof path is not an extra record attached to a completion; **it is the completion**, and it must do
everything the arrival path does, through the same shared rule (R3).

## Technical Context

| | |
|---|---|
| **Backend path** | **Cold path only** — `edge-api/driver` (driver pool) + `edge-api/fleet` (back-office pool). No hot-path change. R1. |
| **Language / runtime** | Node 22 + TypeScript, Serverless Framework, Lambda arm64 |
| **Database** | PostgreSQL 16, raw SQL via pgx-equivalent `pg`, Goose forward-only migration |
| **Mobile** | KMP + Compose, Clean Architecture + MVVM; existing `core/platform` capabilities |
| **Console** | React 19 + TanStack, shadcn/ui via `@effy/design-system` |
| **Storage** | Existing `effy-<env>-product-media` bucket, `proof/` prefix, presign via `@effy/edge-shared` |
| **Infrastructure** | Terraform — one S3 lifecycle configuration, one alarm |
| **New dependencies** | **None.** Every capability this slice needs already exists. |

### Unknowns

None outstanding. The two spec clarifications were settled before planning (90-day retention;
customer-facing proof out of scope), and research resolved the rest. Two spec assumptions were found
**wrong** and the spec was amended in place per Principle I rather than worked around:

1. The delivery code does not exist → **FR-003 deferred**, refusal made explicit and pinned (R4).
2. Camera and signature capture already exist → mobile scope is wiring, not building (R8).

## Constitution Check

| Principle | Gate | Verdict |
|---|---|---|
| **I — Spec-Driven** | Spec precedes plan; gaps go back to the spec | ✅ Two assumptions and FR-001/FR-003 amended in `spec.md` during planning rather than patched in code |
| **II — Shared Contracts** | Cross-cutting logic shared, never copied | ✅ Reuses `enqueueOrderDeliveredIfComplete`, `presignUpload`/`presignRead`, `orderRoundStops`, `OfflineQueue`. **Zero new copies.** R3, R5, R9 |
| **III — Dual-Path** | Plan states its path and why | ✅ Cold path both halves, justified in R1. **No exception required.** |
| **IV — Auth Isolation** | Per-pool validation, pinned issuer, no brokering | ✅ Driver routes behind the driver authorizer; exception routes behind the back-office authorizer, in a **separate service** (R1). No cross-pool call. |
| **V — Design System** | Tokens only; no card layouts unless justified | ✅ Console uses existing primitives; exceptions render as a **table**, not metric cards. Mobile screens already exist (060). No new token. |
| **VI — Layered Architecture** | Three-layer slice, raw SQL, no ORM, explicit wiring | ✅ handler → service → repository in both services; raw SQL; no DI framework |
| **VII — Observability** | Telemetry declared | ✅ Declared below |

**Gate result: PASS.** No Complexity Tracking entries — this slice introduces no deviation.

⚠ **One governance note (Principle I).** `FR-025`, `FR-026` and `SC-012` were **reversed during
planning on operator direction**: proof media is now archived indefinitely rather than deleted at 90
days. The spec was amended in place rather than the plan quietly diverging from it. The reversal
*removed* scope — a shared retention module, a derived-expiry answer on three read paths, and the
test that had to keep the derivation and the Terraform number in agreement all cease to exist (R6).

### Telemetry declared (Principle VII)

- `driver.proof_captured` — method, drop, outcome.
- `driver.proof_upload_failed` — the FR-006 case, counted so a systematic capture failure is visible.
- `driver.drop_failed` — reason, so the exception mix is reportable in aggregate.
- **EMF metric `ProofMediaMissingOnRead`** — ⚠ **since nothing deletes proof media, an absent object
  always means something is wrong** (R6): a failed upload recorded anyway, a key mismatch, or an
  object removed out of band. Its own record, never a dimension on an existing metric — a dimensioned
  metric is a different metric in CloudWatch and the alarm goes blind (059, 054, 063 all record it).
- **Alarm**: `DriverPackagesHeldOvernight` — FR-018's failure, which nothing else reports.

⚠ **No telemetry event carries a location, an address, a recipient name or a media URL.** FR-028 and
050's no-PII rule.

## Project Structure

### Documentation (this feature)

```
specs/064-driver-proof-custody/
├── spec.md          ├── plan.md        ├── research.md
├── data-model.md    ├── quickstart.md  ├── contracts/
└── checklists/requirements.md
```

### Source code

```
db/migrations/
  <ts>_driver_proof_custody.sql          NEW — delivery_proof, delivery_attempt_failure

apis/edge-api/shared/src/lib/
  media.ts                               reuse unchanged (presignUpload / presignRead)
  order-completion.ts                    reuse unchanged — finally gains its second caller (R3)

apis/edge-api/driver/src/proof/          NEW — presign · submit · fail
  sql.ts · repository.ts · service.ts · handler wiring
apis/edge-api/driver/src/work/
  complete.ts                            hub check-in completes the hub STOP (R11)
  service.ts                             todayView surfaces the hub stop; collectionRun excludes it

apis/edge-api/fleet/src/exceptions/      NEW — the reader 056 built and the teardown orphaned (R12)
apis/edge-api/fleet/src/planner/
  repository.ts                          commitWave appends the hub_checkin stop (R11)

packages/shared-types/src/driver.ts      TodayItemRef.kind gains "hub_checkin"; proof DTOs already exist

apps/driver-mobile/shared/src/commonMain/.../features/delivery/
  data/HttpDeliveryRepository.kt         wire the three routes
  presentation/ProofScreens.kt           wire to real state (screens already built)

apps/back-office/src/features/exceptions/  NEW — list + detail

infra/envs/dev/
  media.tf                               S3 lifecycle: proof/ prefix → GLACIER_IR at 90d, NO expiry (R5)
  monitoring.tf                          one alarm
```

## Phase plan

**Phase 0 — Migration & shared rule.** The migration; `proof-retention.ts`; contract additions and
Kotlin regeneration. Nothing reads yet.

**Phase 1 — US1, proof (P1).** Presign → submit. ⚠ **Submit writes `package_arrival` and calls
`enqueueOrderDeliveredIfComplete` in one transaction** (R3) — this is the phase that makes a same-day
order capable of finishing at all. Container tests against real PostgreSQL.

**Phase 2 — US2, failure (P1).** `delivery_attempt_failure`; the drop stays failed; the package stays
in custody.

**Phase 3 — US4, custody (P2).** Hub check-in as a stop; the custody query; FR-018's held-packages
warning. ⚠ Ships with the `collectionRun` exclusion (R11) or the run detail renders an identity-less
stop.

**Phase 4 — US3, back-office exceptions (P2).** `edge-api/fleet/exceptions` + the console screen.

**Phase 5 — US5, retrieval (P3).** History carries real proof; `presignRead`. ⚠ No expiry logic —
media is always retrievable, and an absent object is an **alarm**, not an empty state (R6).

**Phase 6 — Infrastructure & archival.** The lifecycle configuration and both alarms. ⚠ **SC-012 is
proven by reading an archived object back**, not by asserting the rule exists — an archive nobody has
read back is an assumption (R5).

**Phase 7 — Verification.** Negative proofs, the full sweep, the quickstart walk.

## Risks

| Risk | Mitigation |
|---|---|
| ⚠ **An unscoped lifecycle rule would push the live product catalogue into an archive tier** — every storefront read still works and silently bills retrieval fees per page view | `filter { prefix = "proof/" }`, asserted by a Terraform test before apply |
| ⚠ **A colder tier than GLACIER_IR would fork every read path** into "recent" and "archived" behaviour, for ~$0.11/month (R5) | GLACIER_IR only; a test asserts the storage class is never set to `GLACIER` or `DEEP_ARCHIVE` |
| **An object written outside the `proof/` prefix is never archived** and sits in STANDARD forever | The prefix comes from one constant used by the presign call; a test pins it |
| ⚠ **Proof that sets status but skips `package_arrival`** leaves the order permanently incomplete, silently (R3) | One transaction; container test asserts the arrival row and the notification intent together |
| ⚠ **A drop-scoped delivery announcement** reproduces 053's fixed defect on mixed orders | The shared rollup is the only path; a test pins a mixed order staying silent |
| Media bytes in the offline queue | Upload-then-queue ordering (R9), which also gives FR-006 |
| The hub stop leaking into `collectionRun` as an identity-less row | Explicit exclusion + a test |

## Complexity Tracking

**No entries.** This slice adds no new dependency, no new service, no new bucket, no Principle III
exception and no new design token. Every capability it needs was already built and is being wired.
