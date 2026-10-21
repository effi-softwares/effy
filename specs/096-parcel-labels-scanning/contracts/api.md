# API contracts — 096

DTOs live in `@effy/shared-types`. The Kotlin contracts (`contract-driver`, `contract`) are regenerated.
Every write takes a `changeId` (uuid) and is idempotent on it. Every error is `{ type, detail }` with a
sentence in `detail`.

## Shared types (new)

```ts
type ParcelZone = "ambient" | "chilled" | "frozen"
type ReadMethod = "scan" | "typed"
type HandoverMethod = "scan" | "typed" | "manual"           // 090, unchanged
type ReadOutcome = "accepted" | "already_counted" | "belongs_elsewhere" | "not_on_this_work" | "voided" | "not_a_label" | "not_found"
type ParcelMissingReason = "not_at_shop" | "not_in_van" | "not_at_hub" | "damaged" | "wrong_temperature" | "other"

interface ParcelRef { parcelId?: string; parcelCode?: string }          // one of the two
interface ParcelHandover extends ParcelRef { method: HandoverMethod }
interface ParcelMissing extends ParcelRef { reason: ParcelMissingReason; note?: string }   // note required for "other"
interface LabelReadDTO {
  clientReadId: string; raw: string; method: ReadMethod; outcome: ReadOutcome;
  deviceAt: string; deviceId?: string; appVersion?: string; parcelCode?: string
}
interface ParcelDTO { parcelId: string; code: string; seq: number; of: number; zone: ParcelZone }
```

## Shop (`shop`, shared gateway)

| Route | Body → Response | Errors |
|---|---|---|
| `PUT /shop/v1/fulfillments/{id}/parcels` | `{changeId, ambient, chilled, frozen}` → `ShopOrderDetailDTO` | 422 `zone_bag_required` (names the zone), 422 `parcel_count` (1–50), 409 `parcels_with_driver` |
| `POST /shop/v1/fulfillments/{id}/parcels/{parcelId}/void` | `{changeId}` → detail | 409 `parcels_with_driver` |
| `POST /shop/v1/fulfillments/parcels/prints` | `{changeId, layout: "a6"\|"a4x4"\|"roll62", path: "browser"\|"zpl", parcelIds[]}` → `{recorded}` | 404 for any parcel not this shop's (the whole call is refused) |
| `POST /shop/v1/fulfillments/{id}/parcels/pack-scans` | `{changeId, reads: LabelReadDTO[]}` → detail | none (each read records its own outcome) |
| `POST /shop/v1/fulfillments/{id}/status` (existing) | `to: "ready_for_pickup"` gains gates | 409 `labels_not_printed` (`{unprinted: n}`), 409 `bags_not_packed`, 409 `zone_bag_required` |
| `GET /shop/v1/fulfillments/{id}` (existing) | `label` → **`parcels: ShopParcelLabelDTO[]`** + `labelCommon` | |
| `GET /shop/v1/fulfillments?ids=…` (existing batch) | gains `parcels` for batch printing | |

```ts
interface ShopParcelLabelDTO extends ParcelDTO {
  voided: boolean
  printed: { count: number; firstAt: string | null; lastAt: string | null; lastBy: string | null }
  packScanned: { at: string; by: string } | null
  custody: "at_shop" | "packed" | "with_driver" | "with_courier" | "beyond"   // never a driver's name (073)
}
interface ShopLabelCommonDTO {
  service: "effy" | "courier"; orderNumber: string; packedOn: string | null
  recipientName: string; street: string; suburb: string; state: string; postcode: string
}
```

⚠ The common block never carries a window, day, estimate, price, phone or email (079, FR-011).
`shop-delivery-words` is extended to the label module.

## Driver (`driver`, shared gateway)

The reads (Today, run, stop, drop) gain **`parcels: ParcelDTO[]`** on every package. Each step's request body
changes as below. ⚠ There is no compatibility: the app ships with the service (R6).

| Route (existing) | Body changes |
|---|---|
| `POST …/collection/runs/{run}/stops/{stop}/collect` | `packages[]` keeps the per-package `outcome` (`picked_up` / `not_available`, 049). Adds `parcels: ParcelHandover[]`, `missingParcels: ParcelMissing[]`, `reads: LabelReadDTO[]` |
| `POST …/collection/runs/{run}/checkin` | `packages` / `missing` → `parcels`, `missingParcels`, `reads` |
| `POST …/delivery/runs/{run}/load` | `packages` / `notLoaded` → `parcels`, `missingParcels`, `reads` |
| `POST …/delivery/drops/{drop}/proof` | adds `parcels`, `missingParcels`, `reads` |
| `POST …/return` (088) | adds `parcels`, `missingParcels`, `reads` |
| **`POST /driver/v1/reads`** (new) | `{reads: LabelReadDTO[]}` → `{recorded}`: reads with no hand-over, such as a refused scan or a lookup. Idempotent on each `clientReadId`. |

New refusal on every step: 409 `parcels_unaccounted` → `{type, detail, parcels: [{code, seq, of}]}` ("2 bags not
scanned or marked missing"). Gate order: ownership → open → retry answer → sequence → **parcels** → write.

## Fleet (`fleet`, staff gateway; admin or manager)

| Route | Body → Response |
|---|---|
| `GET /fleet/v1/hub/expected` | → `{runs: [{runId, driverName, collectedAt, parcels: [{code, seq, of, zone, orderNumber, checkedIn}]}]}`, parcels collected and not yet checked in |
| `POST /fleet/v1/hub/checkins` | `{changeId, reads: LabelReadDTO[]}` → `{results: [{raw, outcome, detail, sort?: {kind, words}}], closedRuns: string[]}` |
| `GET /fleet/v1/reports/handovers?from&to` | → `{byMethod, byShop[], byDriver[], refusedByOutcome, missingParcels, exceptionsPer1000}` |
| exceptions read (existing) | held items gain `parcel: {code, seq, of, zone} \| null`. Found / Lost resolve parcel holds too |

## Orders (`orders`, staff gateway)

| Route | Body → Response |
|---|---|
| `GET /orders/v1/admin/lookup?q=` | `q` = an `EFY1:` token, a bare code or an order number → `{orderId, fulfillmentId?, parcelId?}`, or 404. Records a `lookup` read |
| `GET /orders/v1/admin/tax-settings` | → `{legalName, abn, feeTreatment, invoicesEnabled, unclassifiedProducts}` |
| `PUT /orders/v1/admin/tax-settings` | the same fields → the same response. 422 `abn_invalid`, 409 `tax_setup_incomplete` (lists what is missing) |
| order detail (existing) | each package gains `parcels: [{code, seq, of, zone, voided, printedCount, custody, handovers[]}]`; `handovers` moves from the package to the parcel (091) |

## Commerce (`commerce`, shared gateway, customer pool)

| Route | Response |
|---|---|
| `GET /commerce/v1/orders/{id}/delivery-note[?format=pdf]` | `DeliveryNoteDTO` or `application/pdf`. 409 `not_delivered` |
| `GET /commerce/v1/orders/{id}/tax-documents[?doc={number}&format=pdf]` | `{invoice: TaxDocumentDTO \| null, adjustments: TaxDocumentDTO[]}` or one PDF. 409 `invoices_unavailable`, 409 `buyer_identity_required` (≥ $1,000) |
| `PUT /commerce/v1/orders/{id}/business-identity` | `{businessName?, abn?}` (the buyer's own). 422 `abn_invalid` |

```ts
interface DeliveryNoteDTO {
  orderNumber: string; placedAt: string; contact: "hello@effyshopping.com"
  lines: Array<{ name: string; ordered: number; supplied: number; status: "supplied" | "part" | "unavailable" }>
}  // lines merged by product across packages, so no package or shop count (FR-071)
interface TaxDocumentDTO {
  kind: "invoice" | "adjustment"; number: string; issuedAt: string
  issuer: { legalName: string; abn: string }
  buyer: { name: string; businessName?: string; abn?: string } | null
  lines: Array<{ name: string; quantity: number; amount: string; taxable: boolean }>
  fees: Array<{ label: string; amount: string; taxable: boolean }>
  totals: { total: string; gst: string; taxableTotal: string; gstFreeTotal: string }
  payments: Array<{ label: string; amount: string }>        // card, points (074)
  refersTo?: string                                          // an adjustment's invoice number
}
```

## Catalog (`catalog`, staff gateway)

| Route | Body → Response |
|---|---|
| `GET /catalog/v1/admin/products/gst-missing` | → `{products: [{id, name, shopName, category}]}` |
| `POST /catalog/v1/admin/products/gst` | `{changeId, items: [{productId, status}]}` → `{updated}`, recorded `via: bulk` |
| review (existing) | the proposed `gst_status` appears in the diff as "GST" |

Shop product create and edit (existing `shop` routes) accept `gstStatus`. A live product's change is proposed
for review (067).

## Scan rule fixtures

`packages/shared-types/scan-rule.fixtures.json`: `[{context, raw, method, expect: {outcome, words}}]`. It is
read by `scan-rule.test.ts` and by the driver app's `ScanRuleTest`, through an embedded copy that the TS test
checks byte-for-byte.
