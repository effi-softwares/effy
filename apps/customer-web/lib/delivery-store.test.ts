import { beforeEach, describe, expect, it } from "vitest"

import {
  applyAnswer,
  clearDeliveryContext,
  normalizePostcode,
  recordServiceability,
  seedFromAccount,
  setDeliveryPostcode,
  type DeliveryContext,
} from "./delivery-store"

describe("normalizePostcode", () => {
  it("accepts a four-digit postcode", () => {
    expect(normalizePostcode("3000")).toBe("3000")
  })

  it("strips the separators a person actually types", () => {
    expect(normalizePostcode(" 3000 ")).toBe("3000")
    expect(normalizePostcode("30 00")).toBe("3000")
    expect(normalizePostcode("30-00")).toBe("3000")
  })

  it("rejects anything that is not a postcode", () => {
    for (const raw of ["", "  ", "abc", "300", "30000", "3o00", "-1000"]) {
      expect(normalizePostcode(raw), raw).toBeNull()
    }
  })

  /**
   * The client and the hot path must agree on what a postcode is. If the client accepted something the
   * server rejects, the shopper gets a 400 they cannot act on; if the client were stricter, a valid
   * location would be refused before it was ever asked about.
   */
  it("matches the server's rule: exactly four digits after stripping separators", () => {
    expect(normalizePostcode("0800")).toBe("0800") // leading zero is significant
    expect(normalizePostcode("3000.")).toBeNull() // a stray character is not stripped
  })
})

describe("applyAnswer", () => {
  const base: DeliveryContext = { postcode: "3000", serviced: null, checkedAt: 0, source: "guest" }

  it("records the answer for the postcode currently stored", () => {
    const next = applyAnswer(base, "3000", true, 1234)
    expect(next).toEqual({ postcode: "3000", serviced: true, checkedAt: 1234, source: "guest" })
  })

  /**
   * The race this exists to lose safely: type "3000", the request goes out, correct it to "3001", and
   * the slow 3000 response lands. Without this guard the shopper is told whether Effy delivers to a
   * postcode they already corrected away from — and shown it against the new one.
   */
  it("discards an answer for a postcode the shopper has moved away from", () => {
    const corrected: DeliveryContext = { ...base, postcode: "3001" }
    const next = applyAnswer(corrected, "3000", true, 1234)
    expect(next).toEqual(corrected)
    expect(next?.serviced).toBeNull()
  })

  it("does nothing when there is no context at all", () => {
    expect(applyAnswer(null, "3000", true, 1234)).toBeNull()
  })
})

describe("the delivery store", () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearDeliveryContext()
  })

  it("stores a normalised postcode with no answer yet", () => {
    expect(setDeliveryPostcode("  3000 ")).toBe("3000")
    const stored = JSON.parse(window.localStorage.getItem("effy:delivery")!)
    expect(stored.postcode).toBe("3000")
    // `null`, NOT false — "we have not asked" and "we do not deliver there" are different states, and
    // rendering the first as the second tells a prospective customer to leave.
    expect(stored.serviced).toBeNull()
  })

  it("refuses input that is not a postcode without touching what is stored", () => {
    setDeliveryPostcode("3000")
    expect(setDeliveryPostcode("nonsense")).toBeNull()
    expect(JSON.parse(window.localStorage.getItem("effy:delivery")!).postcode).toBe("3000")
  })

  it("records a serviceability answer against its own postcode", () => {
    setDeliveryPostcode("3000")
    recordServiceability("3000", true)
    expect(JSON.parse(window.localStorage.getItem("effy:delivery")!).serviced).toBe(true)
  })

  it("ignores an answer that arrives for a superseded postcode", () => {
    setDeliveryPostcode("3000")
    setDeliveryPostcode("3001") // the shopper corrects themselves
    recordServiceability("3000", true) // the slow first response lands
    const stored = JSON.parse(window.localStorage.getItem("effy:delivery")!)
    expect(stored.postcode).toBe("3001")
    expect(stored.serviced).toBeNull()
  })

  it("clears the context entirely", () => {
    setDeliveryPostcode("3000")
    clearDeliveryContext()
    expect(window.localStorage.getItem("effy:delivery")).toBe("null")
  })

  describe("seeding from the account", () => {
    it("seeds when the device has no location", () => {
      seedFromAccount("3000")
      const stored = JSON.parse(window.localStorage.getItem("effy:delivery")!)
      expect(stored.postcode).toBe("3000")
      expect(stored.source).toBe("account")
    })

    /** An explicit choice on this device outranks a saved default. */
    it("does NOT overwrite a location the shopper set themselves", () => {
      setDeliveryPostcode("3001")
      seedFromAccount("3000")
      const stored = JSON.parse(window.localStorage.getItem("effy:delivery")!)
      expect(stored.postcode).toBe("3001")
      expect(stored.source).toBe("guest")
    })
  })
})
