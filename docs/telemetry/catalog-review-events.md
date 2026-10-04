# Product review events (067)

Product analytics for the review of shop products by Effy (constitution Principle VII). Declared in
each surface's typed taxonomy; a name used here and not declared there does not compile.

**What these events never carry**: a price, a margin value, a product name, a shop name or the
send-back reason. The first two are a shop's money and Effy's; the reason is free text a reviewer
wrote about a shop's product. `productId` is an opaque id. Every other property is a closed
vocabulary, so the events stay low-cardinality.

## Shop (`apps/shop-web/src/lib/telemetry.ts`)

| Event | Props | Emitted when |
|---|---|---|
| `product_submitted_for_review` | `{ productId }` | A shop submits a never-approved product — from the product page, or as the last step of the create wizard |
| `product_review_withdrawn` | `{ productId }` | A shop withdraws a submission, or discards a pending change |

`apps/shop-mobile` performs the same two actions and emits nothing yet: mobile telemetry for the
catalogue is not wired on that surface (the 013/014 deferral). It adopts these exact names when it is.

## Back-office (`apps/back-office/src/lib/telemetry.ts`)

| Event | Props | Emitted when |
|---|---|---|
| `product_review_decided` | `{ productId, kind: "new_product" \| "change", decision: "approved" \| "sent_back", marginSet: boolean }` | A reviewer's decision is accepted by the server. `marginSet` says only THAT a margin was confirmed with the approval, never what it was |
| `product_margin_set` | `{ productId }` | A margin is set from the "Margin not set" list, outside a review |

A refused decision (the item changed, or a colleague decided it first) emits nothing: nothing was
decided.

## Operational signal (not analytics)

`ProductReviewOldestWaitingHours` (CloudWatch, namespace `Effy/Catalog`) — the age of the oldest item
waiting for review, emitted every 15 minutes by `edge-catalog`. Alarm:
`<prefix>-product-review-stale` (`infra/envs/dev/catalog-review.tf`).
