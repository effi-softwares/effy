import { describe, expect, it } from "vitest"

import { digest, fingerprintsOf, normaliseEmail, normalisePhone } from "./fingerprint"

describe("113 - erased-account fingerprints", () => {
  it("normalises before digesting", () => {
    expect(normaliseEmail("  Jane@Example.TEST ")).toBe("jane@example.test")
    expect(normalisePhone("+61 412-345 678")).toBe("61412345678")
    expect(digest("email", "Jane@Example.test", "k")).toEqual(digest("email", "jane@example.test", "k"))
  })

  it("depends on the key, and on the kind", () => {
    expect(digest("email", "a@b.test", "k1")).not.toEqual(digest("email", "a@b.test", "k2"))
    expect(digest("email", "0412", "k")).not.toEqual(digest("phone", "0412", "k"))
  })

  it("never contains the value", () => {
    const d = digest("email", "jane@example.test", "k")
    expect(d.toString("utf8")).not.toContain("jane")
    expect(d).toHaveLength(32)
  })

  it("leaves out what is missing", () => {
    expect(fingerprintsOf("a@b.test", null, "k")).toEqual({ email: expect.any(Buffer), phone: null })
    expect(fingerprintsOf(null, "  ", "k")).toEqual({ email: null, phone: null })
  })
})
