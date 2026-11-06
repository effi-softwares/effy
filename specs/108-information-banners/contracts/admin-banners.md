# Contract: admin routes for banners (staff gateway, stack `admin-promotions`)

## `POST /admin/v1/promotions` with `kind: "banner"`

```json
{
  "name": "Range - home hero",
  "kind": "banner",
  "headline": "Groceries to home appliances, from one place",
  "supportingLine": "Thousands of everyday things, delivered by Effy.",
  "label": "New on Effy",
  "link": { "kind": "category", "categoryId": "…" },
  "startsAt": null, "endsAt": null, "daysOfWeek": null, "timeFrom": null, "timeTo": null,
  "groupIds": ["…"],
  "publish": true
}
```

- `link.kind`: `search` | `sale` | `category` (`categoryId` required) | `product` (`productId` required).
- `headline` is required.
- Any of the following is 422 `validation_failed` with `field: "<name>", message: "not for an information banner"`:
  `trigger`, `valueType`, `percentOff`, `amountOff`, `maxDiscount`, `bxgy`, `appliesTo`, `targets`, `deliveryTypes`,
  `audience`, `minSubtotal`, `minQuantity`, `maxUses`, `maxUsesPerCustomer`, `budget`, `combinable`, `sharedCode`,
  `codeMode`.
- Tokens: the words may contain `{free_delivery_amount}` and `{order_minimum}`. Any other `{…}` is
  422 `unknown live value`.
- Tokens in an offer's words are 422 `live values are for information banners`.

## `PATCH /admin/v1/promotions/{id}`

- `kind` can't change: 409 `kind_fixed`, offer ↔ banner.
- The banner rules above apply to a partial body.

## `GET /admin/v1/promotions/{id}` (extended)

`AdminPromotionDTO` gains:

```json
"link": { "kind": "category", "category": { "id": "…", "name": "Home & Kitchen" }, "product": null, "broken": false }
```

`link` is null for an offer. For a banner, `trigger`, `valueType` and `appliesTo` are null, and `gives` is
"No offer".

## Offer-only routes for a banner

`POST …/{id}/codes`, `GET …/{id}/codes`, `GET …/{id}/codes/export`, `GET|POST|DELETE …/{id}/customers…` and
`GET …/{id}/performance` answer 409 `not_an_offer` for a banner.

## `GET /admin/v1/promotions/live-values` (new)

```json
{ "values": [
  { "key": "free_delivery_amount", "name": "Free-delivery amount", "token": "{free_delivery_amount}", "reads": "$150", "why": null },
  { "key": "order_minimum", "name": "Order minimum", "token": "{order_minimum}", "reads": null, "why": "There is no order minimum." }
] }
```

Every back-office role may read it.

## `GET /admin/v1/promotions?kind=banner`

The list filter accepts `banner`. `gives` is "No offer", `who` is "Everyone" and `codeSummary` is null.

## `GET /admin/v1/promotion-groups/{id}/preview`

`hidden[].why` may be `live_value_missing`.
