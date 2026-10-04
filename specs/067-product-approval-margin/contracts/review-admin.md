# Contract: Product Review (back-office)

Service `apis/edge-api/catalog`, shared gateway, existing back-office authorizer.
DTOs in `packages/shared-types/src/product-review.ts`.

**Authz** (from `admin.staff`, fail-closed): read = any active staff, including `csa`;
decide and set margin = active AND role in {`admin`, `manager`}.

| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog/v1/review` | The queue |
| GET | `/catalog/v1/review/margin-not-set` | Live products with no margin |
| GET | `/catalog/v1/review/items/{productId}` | One item, with before/after |
| POST | `/catalog/v1/review/items/{productId}/approve` | Approve (new product or change) |
| POST | `/catalog/v1/review/items/{productId}/send-back` | Send back with a reason |
| POST | `/catalog/v1/products/{productId}/margin` | Set or change a live product's margin |

## Shared types

```ts
export type ReviewKind = "new_product" | "change";
export type MarginInput = { kind: "percent" | "amount"; value: string }; // decimal string, >= 0

export interface ReviewQueueItem {
  productId: string;
  kind: ReviewKind;
  shopId: string;
  shopName: string;
  productName: string;      // the PROPOSED name for a new product; the LIVE name for a change
  submittedAt: string;      // ISO
  waitingHours: WireInt;
}
```

## GET queue

Query: `shopId?`, `kind?`, `q?` (product name), `cursor?`, `limit?` (default 25). Ordered by
`submittedAt` ascending. Response `{ items: ReviewQueueItem[]; nextCursor: string | null }`.

## GET item

```ts
export interface ReviewItemDetail {
  productId: string;
  kind: ReviewKind;
  version: string;                  // echo on a decision
  shop: { id: string; name: string; status: string };
  submittedAt: string;
  product: ReviewProductView;       // new product: what was submitted. change: the LIVE product
  changes: ReviewFieldChange[];     // empty for a new product
  media: { current: ReviewImage[]; proposed: ReviewImage[] | null }; // proposed null = unchanged
  margin: { current: MarginInput | null; customerPriceAmount: string };
  shopPriceAmount: string;          // the shop price the decision would make live
  shopCompareAtAmount: string | null;
}

export interface ReviewFieldChange {
  field: string;                    // a closed set of field keys, plus `attribute:<key>`
  label: string;
  before: string | null;
  after: string | null;
}
```

Image URLs are short-lived presigned reads. `404` when the product has nothing awaiting review.

## POST approve

```ts
{ version: string; margin: MarginInput }
```

- New product: `margin` required.
- Change: `margin` required when the change alters the shop price or the product has no margin;
  otherwise optional (omitted = keep the current margin).
- `409` when `version` is stale or the item was already decided.
- `400` when the margin is missing, negative, or not a number; when a proposed category or product
  type is retired.
- Effect, one transaction: apply (if a change) → set margin and `price_amount` → `approved_at` (if
  new, and `status = 'active'`) → clear review state / delete change → audit row → notification
  rows.

Response: `{ productId; customerPriceAmount; marginKind; marginValue }`.

## POST send-back

`{ version: string; reason: string }` — reason 1 to 500 characters after trimming. `409` as above.
Leaves the live product untouched.

## POST margin

`{ margin: MarginInput; expectedCurrent: MarginInput | null }` — `409` if the current margin is not
`expectedCurrent`. Only for a product with `approved_at`. Updates `price_amount` (and
`compare_at_amount`) at once; writes an audit row. Sends no shop notification.

## Never

- No response on any shop route carries a margin (see `shop-products.md`).
- No route here edits what the shop entered.

## As built

The routes are served by the new `edge-catalog` service under its own path prefix, `/catalog/v1/…`
(the platform's `/<service>/v1/…` scheme), behind the existing back-office authorizer. The first
draft of this file put them under `/admin/v1/…`; `edge-admin` has no room for them (research R5).
Validation refusals are HTTP 400, the status every other service uses.
