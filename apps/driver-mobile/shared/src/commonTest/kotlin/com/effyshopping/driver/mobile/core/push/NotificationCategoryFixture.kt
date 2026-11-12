package com.effyshopping.driver.mobile.core.push

/**
 * A copy of `packages/shared-types/src/notification-categories.fixtures.json`, embedded because `commonTest` cannot read
 * a file outside the app. Do not edit by hand: `packages/shared-types/src/notification-categories.test.ts` reads this
 * file and fails if it differs. Change the source first, then copy it here.
 */
internal const val NOTIFICATION_CATEGORY_FIXTURE = """
{
  "_comment": "111 - each audience's notification categories: whether a person may turn one off, whether it is marketing (needs a yes first), its default per channel, which channels a customer may change, the Android channel it is filed in, and its words. Shared by packages/shared-types (NOTIFICATION_CATEGORY_POLICY), edge-shared notify(), and the customer and driver apps (NotificationCategoryPolicy.kt). Copies are embedded in each app's commonTest; notification-categories.test.ts fails a copy that differs.",
  "policies": [
    { "audience": "customer", "category": "orders", "label": "Order updates", "description": "When your order is confirmed, packed, on its way and delivered.", "reason": null, "required": false, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": ["push", "email"], "androidChannel": "orders" },
    { "audience": "customer", "category": "points", "label": "Points", "description": "When you get Effy points, and before they expire.", "reason": null, "required": false, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": ["push", "email"], "androidChannel": "points" },
    { "audience": "customer", "category": "offers", "label": "Offers", "description": "Deals and discounts from Effy.", "reason": null, "required": false, "marketing": true, "defaults": { "push": true, "email": false }, "changeable": ["push", "email"], "androidChannel": "offers_news" },
    { "audience": "customer", "category": "news", "label": "News", "description": "New products and seasonal picks from Effy.", "reason": null, "required": false, "marketing": true, "defaults": { "push": true, "email": false }, "changeable": ["push", "email"], "androidChannel": "offers_news" },
    { "audience": "customer", "category": "important", "label": "Important", "description": "Things you need to know, like a change to your delivery.", "reason": "These can't be turned off.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": "important" },
    { "audience": "customer", "category": "support", "label": "Support", "description": "Replies from our team about your account or orders.", "reason": "These can't be turned off.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": "important" },
    { "audience": "driver", "category": "work", "label": "Work", "description": "Runs assigned to you, and changes to them.", "reason": "Work messages can't be turned off - they're part of your job.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": "work" },
    { "audience": "driver", "category": "announcements", "label": "Announcements", "description": "Messages from Effy to every driver.", "reason": "These can't be turned off.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": "announcements" },
    { "audience": "driver", "category": "important", "label": "Important", "description": "Things you need to know now, like a change to today's work.", "reason": "These can't be turned off.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": "important" },
    { "audience": "shop", "category": "orders", "label": "Orders", "description": "New orders to pick, orders waiting and refunds to approve.", "reason": "These reach everyone at your shop, so nobody misses one.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": null },
    { "audience": "shop", "category": "stock", "label": "Stock", "description": "Products running low or out of stock.", "reason": "These reach everyone at your shop, so nobody misses one.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": null },
    { "audience": "shop", "category": "products", "label": "Products", "description": "Effy's decisions about your products.", "reason": "These reach everyone at your shop, so nobody misses one.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": null },
    { "audience": "shop", "category": "announcements", "label": "Announcements", "description": "Messages from Effy to every shop.", "reason": "These reach everyone at your shop, so nobody misses one.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": null },
    { "audience": "shop", "category": "important", "label": "Important", "description": "Things you need to know now.", "reason": "These reach everyone at your shop, so nobody misses one.", "required": true, "marketing": false, "defaults": { "push": true, "email": true }, "changeable": [], "androidChannel": null }
  ],
  "androidChannels": {
    "customer": [
      { "id": "orders", "name": "Order updates", "importance": "high" },
      { "id": "points", "name": "Points", "importance": "default" },
      { "id": "offers_news", "name": "Offers & news", "importance": "default" },
      { "id": "important", "name": "Important", "importance": "high" }
    ],
    "driver": [
      { "id": "work", "name": "Work", "importance": "high" },
      { "id": "announcements", "name": "Announcements", "importance": "default" },
      { "id": "important", "name": "Important", "importance": "high" }
    ]
  }
}
"""
