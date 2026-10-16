# Research: Package Scanning — Foundations (090)

## Decisions

### R1 — One append-only hand-over record, written by each hand-over

**Decision**: `public.package_handover` — `shop_fulfillment_id`, `step` (`collect` | `checkin` | `load` |
`deliver` | `return`), `method` (`scan` | `typed` | `manual`), `driver_id`, `round_id`, `change_id`,
`recorded_at`; UNIQUE (`change_id`, `shop_fulfillment_id`) so a retried hand-over records once. Written
by one function in the driver service (`work/handover.ts`) inside each hand-over's own transaction.
Only packages that belong to that hand-over are recorded; anything else in the list is ignored; an
unknown method is ignored (a newer app).
**Rationale**: H12 reads one table; append-only keeps the history (a package is collected, checked in,
loaded, delivered — four rows). A column per step on `round_package` would not cover load or return.

### R2 — Methods ride the existing requests, optional

`CollectRequest.packages[].method?`, and `packages?: { packageId, method }[]` on `HubCheckinRequest`,
`ProofRequest`, `ParcelReturnRequest` and the new `LoadRequest`. Absent = today's behaviour (FR-008).

### R3 — The hub instruction is the server's, per package, on the collection run

**Decision**: `DriverCollectionRunDTO.hubSort?: { packageCode, kind: "load_now" | "shelve" | "courier_bay", label }[]`,
computed by `hubSortOf()` in `driver/src/work/hub-sort.ts` from who delivers and the window — the same
inputs and the same day/window words (`formatArrival`, `anyTimeDayLabel`) as 082's hub check-in groups.
`label` is the full line ("LOAD NOW · Today 4–6 pm", "SHELVE · Thu 15 Oct", "COURIER BAY").
**Rationale**: the hub scan must show it with no signal, so it is on the phone before the hub; the
app never formats a day (082's rule).

### R4 — "Load the van" is one route that starts every staged drop

**Decision**: `POST /driver/v1/delivery/runs/{runId}/load` `{ changeId, packages? }` → `{ loaded }`. In one
transaction: scoped to the caller's round, gated by `assertRoundOpen` (072; `open.guard.test.ts`
registry), every `pending` customer drop → `out_for_delivery`, round → `in_progress`; drops further along
are untouched. Idempotent by state. Announces like a started drop (`announceStop` per drop's shops +
dispatch). Shared gateway +1.

### R5 — One scan rule in the app's common code

**Decision**: `core/scan/ScanRule.kt` — pure: `judge(read, context): ScanOutcome` where the context is the
expected codes (with labels), the codes elsewhere on the driver's work (with where they belong) and the
codes already accepted. Outcomes: `Accepted`, `AlreadyScanned`, `BelongsElsewhere(where)`, `NotOnYourWork`,
`NotALabel`. Builders per step (`ScanContexts.shopStop`, `.hub`, `.load`, `.drop`, `.returnToHub`) from
the domain models, which gain the codes 089 put on the wire (and `ParcelsToReturn.packageCodes`).
`PackageToken.kt` is the Kotlin twin of `package-code.ts`; both are tested against
`packages/shared-types/package-code.fixtures.json`.

### R6 — The camera reader: CameraX + ML Kit (bundled) on Android, AVFoundation on iOS

**Decision**:
- Android: CameraX `ImageAnalysis` (already a dependency) feeding `com.google.mlkit:barcode-scanning`
  — the **bundled** model (works offline on first launch, ~2.4 MB), formats restricted to QR and
  Code 128. Torch via `CameraControl.enableTorch`.
- iOS: `AVCaptureSession` + `AVCaptureMetadataOutput` (types QR and Code 128) with an
  `AVCaptureVideoPreviewLayer` in a `UIKitView`, written in Kotlin/Native directly — no Swift bridge is
  needed for AVFoundation. Torch via `AVCaptureDevice.torchMode`. Works on every supported iPhone
  (VisionKit's scanner needs iOS 16 + A12 and is not the only path).
- Common: `@Composable expect fun PackageScanner(modifier, torch, onRead, onUnavailable)`; reads pass
  `parsePackageToken`, then `ReadDebouncer` (2 s per code) in common code, tested.
- Camera permission stays with the existing permission screen; the reader reports `Refused` /
  `NoCamera` so the screen can fall back.
