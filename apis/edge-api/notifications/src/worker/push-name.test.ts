import { describe, expect, it } from "vitest"

import { normaliseFirstName } from "@effy/shared-types"

import { messageFor, type ClaimedDelivery } from "./drain"

const delivery = (body: string): ClaimedDelivery => ({
  id: "d1", notificationId: "n1", channel: "push", recipientEmail: null, attempts: 0, recipientSub: "sub-sam",
  audience: "customer", type: "customer_message", title: "Berries are back", body, entityId: "", destination: { kind: "sale" },
  expiresAt: null, tag: "t", group: "g",
})

describe("no name on a lock screen (115 FR-023, SC-006)", () => {
  it("fills the stored placeholder with the fallback, never the recipient's name", () => {
    const stored = normaliseFirstName("Hi {first name}, berries are back at Effy", "friend")
    const push = messageFor(delivery(stored), "tok", "android")
    expect(push.body).toBe("Hi friend, berries are back at Effy")
    expect(push.body).not.toContain("{")
  })

  it("a body with no placeholder is untouched", () => {
    expect(messageFor(delivery("Order delivered"), "tok", "ios").body).toBe("Order delivered")
  })
})
