# `features/delivery` — the shop console's same-day declaration (032)

The shop console's **fifth** feature, after `auth`, `catalog`, `fulfillment` and `shop-identity`.

Spec: [specs/032-delivery-pricing](../../../../../specs/032-delivery-pricing/).

## What lives here

A shop operator states **whether the shop offers same-day delivery** and **which areas it will serve**.
That is operational knowledge only the shop has — it knows its own vans, staff and hours — and no
amount of distance arithmetic substitutes for it.

## ⚠ What deliberately does NOT live here

**Pricing.** There is no fee field, no rate screen, and no route to one. Delivery fees are the
platform's decision (FR-008), and the guarantee is **structural**: `apis/edge-api/shop` has no pricing
route at any verb, so a shop token cannot reach one even by hand. SC-004 is verified by calling the
admin pricing route with a shop token and getting `401` — *not* by observing that this console has no
button.

## ⚠ A declaration is a proposal, not a switch

Saving here changes **nothing** for any shopper (FR-017). An admin must approve it first, and until
they do, the previously approved version stays in force (FR-018). That is why this feature is safe to
ship on its own, and it is a design property rather than an accident of sequencing.

## ⚠ An area is a postcode

Serviceability is postcode-decided everywhere on this platform, so picking **"Alfredton"** commits the
shop to all **twenty** Ballarat localities. `PostcodeCoverageNotice` (shared, from
`@effy/web-kit/console`) says so **before** the shop confirms. Without it a shop believes it made a
narrow commitment when it made a broad one, and first learns otherwise from an order it cannot serve.
