# Contract: shopper group reads (unchanged routes)

`GET /storefront/v1/promotion-groups?keys=` and `GET /commerce/v1/promotion-groups?keys=`.

A banner in a group, as `ShopperPromotionDTO`:

```json
{
  "id": "55555555-0000-0000-0000-000000000003",
  "kind": "banner",
  "headline": "Free delivery on orders over $150",
  "supportingLine": "Every order from $150 is delivered free by Effy.",
  "label": null,
  "code": null,
  "terms": null,
  "endsIn": null,
  "target": { "kind": "sale" },
  "skin": { "…": "as today" }
}
```

- `target` is `BannerTarget | null`. It is null only for a banner whose aisle or product has gone. Clients draw that
  tile non-tappable.
- A banner whose live value is empty is absent.
- `GET /storefront/v1/promotions/{id}` answers 404 for a banner: it has no page of its own.
- Cart and checkout responses never name a banner.
