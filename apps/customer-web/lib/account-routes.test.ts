import { describe, expect, it } from "vitest"

import { chromePrefetch, needsAccount } from "./account-routes"

describe("needsAccount", () => {
  it.each(["/account", "/account/points", "/orders", "/orders/abc", "/saved", "/addresses", "/checkout", "/saved?tab=lists"])(
    "%s needs an account",
    (href) => expect(needsAccount(href)).toBe(true),
  )
  it.each(["/", "/search", "/help", "/sign-in", "/accounts", "/ordersx", "/cart", "/product/1"])("%s does not", (href) =>
    expect(needsAccount(href)).toBe(false),
  )
})

describe("chromePrefetch", () => {
  it("never prefetches a page a guest would be redirected from; leaves the rest to Next", () => {
    expect(chromePrefetch("/orders")).toBe(false)
    expect(chromePrefetch("/search")).toBeUndefined()
  })
})
