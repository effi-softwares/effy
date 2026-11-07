package com.effyshopping.customer.mobile.core.push

/**
 * A copy of `packages/shared-types/src/notification-destinations.fixtures.json`, embedded because `commonTest` cannot
 * read a file outside the app. Do not edit by hand: `packages/shared-types/src/notification-destinations.test.ts`
 * reads this file and fails if it differs. Change the source first, then copy it here.
 */
internal const val DESTINATION_FIXTURE = """
{
  "_comment": "109 - where a notification leads. Shared by packages/shared-types (TypeScript: parseDestination, shopPathFor) and the customer and driver apps (Kotlin: parseCustomerDestination, parseDriverDestination). `wire` is the push's data.destination string; `expect` is the parsed value, or null when this audience cannot open it (the app then opens its home screen). `path` is the shop console route. Copies of this file are embedded in each app's commonTest; notification-destinations.test.ts fails a copy that differs.",
  "cases": [
    { "name": "customer home", "audience": "customer", "wire": "{\"kind\":\"home\"}", "expect": { "kind": "home" } },
    { "name": "customer orders", "audience": "customer", "wire": "{\"kind\":\"orders\"}", "expect": { "kind": "orders" } },
    { "name": "customer order", "audience": "customer", "wire": "{\"kind\":\"order\",\"orderId\":\"7b1c\"}", "expect": { "kind": "order", "orderId": "7b1c" } },
    { "name": "customer order without its id", "audience": "customer", "wire": "{\"kind\":\"order\"}", "expect": null },
    { "name": "customer order with an empty id", "audience": "customer", "wire": "{\"kind\":\"order\",\"orderId\":\"\"}", "expect": null },
    { "name": "customer order with a number id", "audience": "customer", "wire": "{\"kind\":\"order\",\"orderId\":42}", "expect": null },
    { "name": "customer points", "audience": "customer", "wire": "{\"kind\":\"points\"}", "expect": { "kind": "points" } },
    { "name": "customer product", "audience": "customer", "wire": "{\"kind\":\"product\",\"productId\":\"p1\"}", "expect": { "kind": "product", "productId": "p1" } },
    { "name": "customer product with its aisle", "audience": "customer", "wire": "{\"kind\":\"product\",\"productId\":\"p1\",\"aisleKey\":\"dairy\"}", "expect": { "kind": "product", "productId": "p1", "aisleKey": "dairy" } },
    { "name": "customer product without its id", "audience": "customer", "wire": "{\"kind\":\"product\",\"aisleKey\":\"dairy\"}", "expect": null },
    { "name": "customer aisle", "audience": "customer", "wire": "{\"kind\":\"aisle\",\"aisleKey\":\"dairy\",\"title\":\"Dairy\"}", "expect": { "kind": "aisle", "aisleKey": "dairy", "title": "Dairy" } },
    { "name": "customer aisle without its key", "audience": "customer", "wire": "{\"kind\":\"aisle\",\"title\":\"Dairy\"}", "expect": null },
    { "name": "customer search with a query", "audience": "customer", "wire": "{\"kind\":\"search\",\"query\":\"milk\"}", "expect": { "kind": "search", "query": "milk" } },
    { "name": "customer search without a query", "audience": "customer", "wire": "{\"kind\":\"search\"}", "expect": { "kind": "search" } },
    { "name": "customer search drops an empty query", "audience": "customer", "wire": "{\"kind\":\"search\",\"query\":\"\"}", "expect": { "kind": "search" } },
    { "name": "customer sale", "audience": "customer", "wire": "{\"kind\":\"sale\"}", "expect": { "kind": "sale" } },
    { "name": "customer ignores unknown extra fields", "audience": "customer", "wire": "{\"kind\":\"order\",\"orderId\":\"7b1c\",\"colour\":\"red\"}", "expect": { "kind": "order", "orderId": "7b1c" } },
    { "name": "customer cannot open a driver's run", "audience": "customer", "wire": "{\"kind\":\"run\",\"runId\":\"r1\"}", "expect": null },
    { "name": "customer cannot open the shop catalogue", "audience": "customer", "wire": "{\"kind\":\"catalog\"}", "expect": null },
    { "name": "customer unknown kind", "audience": "customer", "wire": "{\"kind\":\"wallet\"}", "expect": null },
    { "name": "customer not JSON", "audience": "customer", "wire": "effy://order/7b1c", "expect": null },
    { "name": "customer empty string", "audience": "customer", "wire": "", "expect": null },
    { "name": "customer JSON that is not an object", "audience": "customer", "wire": "[\"order\"]", "expect": null },
    { "name": "customer object without a kind", "audience": "customer", "wire": "{\"orderId\":\"7b1c\"}", "expect": null },

    { "name": "driver today", "audience": "driver", "wire": "{\"kind\":\"today\"}", "expect": { "kind": "today" } },
    { "name": "driver run", "audience": "driver", "wire": "{\"kind\":\"run\",\"runId\":\"r1\"}", "expect": { "kind": "run", "runId": "r1" } },
    { "name": "driver run without its id", "audience": "driver", "wire": "{\"kind\":\"run\"}", "expect": null },
    { "name": "driver account", "audience": "driver", "wire": "{\"kind\":\"account\"}", "expect": { "kind": "account" } },
    { "name": "driver cannot open a customer's order", "audience": "driver", "wire": "{\"kind\":\"order\",\"orderId\":\"7b1c\"}", "expect": null },
    { "name": "driver unknown kind", "audience": "driver", "wire": "{\"kind\":\"hub\"}", "expect": null },
    { "name": "driver not JSON", "audience": "driver", "wire": "{kind:run}", "expect": null },

    { "name": "shop queue", "audience": "shop", "wire": "{\"kind\":\"queue\"}", "expect": { "kind": "queue" }, "path": "/orders" },
    { "name": "shop queue with an order", "audience": "shop", "wire": "{\"kind\":\"queue\",\"fulfillmentId\":\"f1\"}", "expect": { "kind": "queue", "fulfillmentId": "f1" }, "path": "/orders/f1" },
    { "name": "shop queue id is encoded", "audience": "shop", "wire": "{\"kind\":\"queue\",\"fulfillmentId\":\"f/1?x\"}", "expect": { "kind": "queue", "fulfillmentId": "f/1?x" }, "path": "/orders/f%2F1%3Fx" },
    { "name": "shop product", "audience": "shop", "wire": "{\"kind\":\"product\",\"productId\":\"p1\"}", "expect": { "kind": "product", "productId": "p1" }, "path": "/catalog/p1" },
    { "name": "shop product without its id", "audience": "shop", "wire": "{\"kind\":\"product\"}", "expect": null, "path": "/" },
    { "name": "shop catalogue", "audience": "shop", "wire": "{\"kind\":\"catalog\"}", "expect": { "kind": "catalog" }, "path": "/catalog" },
    { "name": "shop cannot open a customer's points", "audience": "shop", "wire": "{\"kind\":\"points\"}", "expect": null, "path": "/" },
    { "name": "shop unknown kind", "audience": "shop", "wire": "{\"kind\":\"insights\"}", "expect": null, "path": "/" },
    { "name": "shop empty string", "audience": "shop", "wire": "", "expect": null, "path": "/" }
  ]
}
"""
