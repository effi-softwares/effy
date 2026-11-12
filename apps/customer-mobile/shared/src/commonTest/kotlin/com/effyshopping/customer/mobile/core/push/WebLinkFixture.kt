package com.effyshopping.customer.mobile.core.push

/**
 * A copy of `packages/shared-types/src/web-links.fixtures.json`, embedded because `commonTest` cannot read a file outside
 * the app. Do not edit by hand: `packages/shared-types/src/web-links.test.ts` reads this file and fails if it differs.
 */
internal const val WEB_LINK_FIXTURE = """
{
  "comment": "116 - Effy links: a path (and query) and the customer destination it opens; null = not a page the app claims (it stays on the website). Pinned by web-links.test.ts and the customer app's WebLinkFixtureTest.kt.",
  "links": [
    { "path": "/", "destination": { "kind": "home" }, "messageId": null },
    { "path": "/?utm_source=email&utm_campaign=x", "destination": { "kind": "home" }, "messageId": null },
    { "path": "/orders", "destination": { "kind": "orders" }, "messageId": null },
    { "path": "/orders/", "destination": { "kind": "orders" }, "messageId": null },
    { "path": "/orders/7d6c1a52-0d1b-4c43-9b7e-1f2a3b4c5d6e", "destination": { "kind": "order", "orderId": "7d6c1a52-0d1b-4c43-9b7e-1f2a3b4c5d6e" }, "messageId": null },
    { "path": "/orders/EFY%2F001?m=11111111-1111-4111-8111-111111111111", "destination": { "kind": "order", "orderId": "EFY/001" }, "messageId": "11111111-1111-4111-8111-111111111111" },
    { "path": "/orders/abc/receipt", "destination": null, "messageId": null },
    { "path": "/account/points", "destination": { "kind": "points" }, "messageId": null },
    { "path": "/product/22222222-2222-4222-8222-222222222222", "destination": { "kind": "product", "productId": "22222222-2222-4222-8222-222222222222" }, "messageId": null },
    { "path": "/product/", "destination": null, "messageId": null },
    { "path": "/search", "destination": { "kind": "search" }, "messageId": null },
    { "path": "/search?q=fresh+milk", "destination": { "kind": "search", "query": "fresh milk" }, "messageId": null },
    { "path": "/search?q=salt%20%26%20pepper", "destination": { "kind": "search", "query": "salt & pepper" }, "messageId": null },
    { "path": "/search?category=dairy-eggs", "destination": { "kind": "aisle", "aisleKey": "dairy-eggs" }, "messageId": null },
    { "path": "/search?category=dairy-eggs&q=milk", "destination": { "kind": "aisle", "aisleKey": "dairy-eggs" }, "messageId": null },
    { "path": "/offers?m=33333333-3333-4333-8333-333333333333&utm_medium=email", "destination": { "kind": "sale" }, "messageId": "33333333-3333-4333-8333-333333333333" },
    { "path": "/email/unsubscribe?t=abc&m=x", "destination": null, "messageId": "x" },
    { "path": "/help", "destination": null, "messageId": null },
    { "path": "/legal/privacy", "destination": null, "messageId": null },
    { "path": "/account", "destination": null, "messageId": null },
    { "path": "/account?tab=points", "destination": null, "messageId": null },
    { "path": "/cart", "destination": null, "messageId": null },
    { "path": "/checkout", "destination": null, "messageId": null },
    { "path": "/delete-account", "destination": null, "messageId": null }
  ],
  "roundTrip": [
    { "kind": "home" },
    { "kind": "orders" },
    { "kind": "order", "orderId": "7d6c1a52-0d1b-4c43-9b7e-1f2a3b4c5d6e" },
    { "kind": "points" },
    { "kind": "product", "productId": "22222222-2222-4222-8222-222222222222" },
    { "kind": "aisle", "aisleKey": "fruit-veg" },
    { "kind": "search" },
    { "kind": "search", "query": "milk & honey 2L" },
    { "kind": "sale" }
  ]
}
"""
