import { describe, expect, it } from "vitest"

import { takeNotification, withNotification } from "../notificationLink"

describe("109 - a tapped notification's id on the console address", () => {
  it("is added to the path, and nothing is added without an id", () => {
    expect(withNotification("/orders/f-1", "n-1", "shop_new_order")).toBe("/orders/f-1?notification=n-1&notification_type=shop_new_order")
    expect(withNotification("/orders?tab=ready", "n-1", undefined)).toBe("/orders?tab=ready&notification=n-1")
    expect(withNotification("/catalog", undefined, "shop_low_stock")).toBe("/catalog")
  })

  it("is taken back off, leaving the rest of the address", () => {
    expect(takeNotification("?tab=ready&notification=n-1&notification_type=shop_new_order")).toEqual({
      notificationId: "n-1", type: "shop_new_order", rest: "?tab=ready",
    })
    expect(takeNotification("?notification=n-1")).toEqual({ notificationId: "n-1", type: "unknown", rest: "" })
    expect(takeNotification("?tab=ready")).toBeNull()
    expect(takeNotification("")).toBeNull()
  })
})
