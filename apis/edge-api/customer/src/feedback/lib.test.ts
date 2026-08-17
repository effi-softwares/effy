import { describe, expect, it } from "vitest"

import { generateReferenceCode, ipSource, sourceKey, subSource } from "./lib"

describe("generateReferenceCode", () => {
  it("has the FB- prefix and 6 unambiguous base32 chars", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferenceCode()
      expect(code).toMatch(/^FB-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/)
      // No ambiguous glyphs.
      expect(code.slice(3)).not.toMatch(/[ILOU]/)
    }
  })

  it("is effectively unique across many draws (not sequential)", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(generateReferenceCode())
    expect(seen.size).toBeGreaterThan(995)
  })
})

describe("sourceKey", () => {
  it("hashes the source — never returns the raw value (PII avoidance)", () => {
    const key = sourceKey(ipSource("203.0.113.7"), "salt")
    expect(key).not.toContain("203.0.113.7")
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is stable for the same source+salt and differs across sources", () => {
    expect(sourceKey(ipSource("1.1.1.1"), "s")).toBe(sourceKey(ipSource("1.1.1.1"), "s"))
    expect(sourceKey(ipSource("1.1.1.1"), "s")).not.toBe(sourceKey(ipSource("2.2.2.2"), "s"))
  })

  it("namespaces sub vs ip so they can never collide", () => {
    expect(subSource("abc")).toBe("sub:abc")
    expect(ipSource("1.2.3.4")).toBe("ip:1.2.3.4")
    expect(sourceKey(subSource("1.2.3.4"), "")).not.toBe(sourceKey(ipSource("1.2.3.4"), ""))
  })
})
