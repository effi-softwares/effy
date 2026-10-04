# Contract: Shop Product Routes (changed)

Service `apis/edge-api/shop`, shop authorizer, every query scoped to the actor's shop.
DTOs in `packages/shared-types`; Kotlin regenerated (`shop-contract:gen`).

## DTO additions

```ts
export type ShopReviewState =
  | "draft" | "in_review" | "sent_back"
  | "live" | "live_change_pending" | "live_change_sent_back";

// on the shop's product list item AND product detail
reviewState: ShopReviewState;
reviewReason: string | null;        // the latest send-back reason, else null
shopPriceAmount: string;            // what the shop is paid
customerPriceAmount: string;        // what customers pay
shopCompareAtAmount: string | null;

// on product detail only
pendingChange: {
  state: "in_review" | "sent_back";
  reason: string | null;
  submittedAt: string;
  proposed: Record<string, unknown>;      // proposed values, keyed as the edit form is
  media: ShopProductImage[] | null;       // proposed image set, null = images unchanged
} | null;
```

⚠ **No field named or derived from the margin's kind or value appears in any shop DTO.** Guarded.

The existing `priceAmount` on shop DTOs is kept, equal to `shopPriceAmount`, so an installed
shop-mobile build keeps showing the price the shop entered.

## Changed behaviour

| Route | Never-approved product | Approved product |
|---|---|---|
| `PATCH /shop/v1/products/{id}` | edits the draft | creates/updates the pending change; returns detail with `pendingChange` |
| media register / patch / delete | edits the draft's images | edits the pending change's image set |
| `POST /shop/v1/products/{id}/status` → `active` | **409** "submit this product for review" | allowed |
| … → `unavailable` / `archived` | allowed | allowed, immediate |

## New routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/shop/v1/products/{id}/submit` | Submit a draft for review. Runs the publish checks; `400` with field issues if they fail |
| POST | `/shop/v1/products/{id}/withdraw` | Withdraw a submission (draft) or discard the pending change (approved) |

A pending change is submitted as it is created: an approved product has no separate "submit" step.
Editing a `sent_back` change returns it to `in_review`.

## List filter

`GET /shop/v1/products` gains `reviewState?` so a shop can list "sent back" or "in review".
