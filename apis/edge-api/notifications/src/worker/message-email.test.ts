import { describe, expect, it } from "vitest"

import { normaliseFirstName } from "@effy/shared-types"

import { messageEmailVars, type MessageEmail } from "@effy/edge-shared/notifications"

const urls = { site: "https://dev.effyshopping.com", edge: "https://edge-api.dev.effyshopping.com" }
const email = (over: Partial<MessageEmail> = {}): MessageEmail => ({
  to: "sam@example.test", recipientSub: "sub-sam", messageId: "m-1", category: "offers",
  title: "Berries are back", body: normaliseFirstName("Hi {first name}, 10% off berries from Effy.\nUntil Sunday.", "there"),
  destination: { kind: "sale" }, imageUrl: null, ...over,
})

describe("a message by email (115)", () => {
  it("a marketing email carries the unsubscribe link and the one-click headers, and greets by name", () => {
    const built = messageEmailVars(email(), { givenName: "Sam", token: "T".repeat(43) }, urls)!
    expect(built.vars.paragraphs.map((p) => p.text)).toEqual(["Hi Sam, 10% off berries from Effy.", "Until Sunday."])
    expect(built.vars.preheader).toBe("Hi there, 10% off berries from Effy.")
    expect(built.vars.marketing).toBe(true)
    expect(built.vars.unsubscribeUrl).toBe(`https://dev.effyshopping.com/email/unsubscribe?t=${"T".repeat(43)}&m=m-1`)
    expect(built.headers).toEqual([
      { name: "List-Unsubscribe", value: `<https://edge-api.dev.effyshopping.com/customer/v1/email-unsubscribe?t=${"T".repeat(43)}&m=m-1>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ])
    expect(built.vars.buttonUrl.startsWith("https://dev.effyshopping.com/")).toBe(true)
  })

  it("a service email (important) has no unsubscribe and no headers", () => {
    const built = messageEmailVars(email({ category: "important" }), { givenName: null, token: null }, urls)!
    expect(built.vars.marketing).toBe(false)
    expect(built.vars.unsubscribeUrl).toBe("")
    expect(built.headers).toEqual([])
    expect(built.vars.paragraphs[0]!.text).toBe("Hi there, 10% off berries from Effy.")
  })

  it("refuses a marketing email with no token rather than send one without a way out", () => {
    expect(messageEmailVars(email(), { givenName: "Sam", token: null }, urls)).toBeNull()
  })
})
