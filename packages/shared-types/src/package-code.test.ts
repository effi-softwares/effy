import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { PACKAGE_CODE_ALPHABET, isPackageCode, isVariantCode, packageToken, parsePackageToken } from "./package-code"

const FIXTURES = JSON.parse(readFileSync(resolve(__dirname, "../package-code.fixtures.json"), "utf8")) as {
  reads: Array<{ read: string; code: string | null }>
}

describe("package codes (089)", () => {
  /** 090 — the driver app's Kotlin parser is held to the same rows. */
  it("agrees with every row of the shared fixture", () => {
    for (const { read, code } of FIXTURES.reads) expect(parsePackageToken(read), JSON.stringify(read)).toBe(code)
  })

  it("the token is EFY1: and the code", () => {
    expect(packageToken("7K3Q9M")).toBe("EFY1:7K3Q9M")
    expect(() => packageToken("7K3Q9O")).toThrow()
  })

  it("reads an Effy label and nothing else", () => {
    expect(parsePackageToken("EFY1:7K3Q9M")).toBe("7K3Q9M")
    expect(parsePackageToken("  EFY1:7K3Q9M\n")).toBe("7K3Q9M")
    expect(parsePackageToken("9300633603345")).toBeNull() // a product's EAN-13
    expect(parsePackageToken("EFY1:7k3q9m")).toBeNull()
    expect(parsePackageToken("EFY1:7K3Q9")).toBeNull()
    expect(parsePackageToken("EFY2:7K3Q9M")).toBeNull()
  })

  it("has no look-alike characters", () => {
    for (const c of "01OILU") expect(PACKAGE_CODE_ALPHABET).not.toContain(c)
    expect(new Set(PACKAGE_CODE_ALPHABET).size).toBe(PACKAGE_CODE_ALPHABET.length)
    expect(isPackageCode("2345AB")).toBe(true)
  })

  /** 090 — the driver app embeds a copy of the fixture (commonTest cannot read outside the app). */
  it("the driver app's embedded fixture is this JSON", () => {
    const kt = readFileSync(
      resolve(__dirname, "../../../apps/driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile/core/scan/PackageCodeFixture.kt"),
      "utf8",
    )
    const embedded = kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')).trim()
    expect(JSON.parse(embedded)).toEqual(FIXTURES)
  })

  /** ⚠ The database generates codes from its own copy of the alphabet; they must be the same string. */
  it("matches the alphabet the database generates from", () => {
    const sql = readFileSync(resolve(__dirname, "../../../db/migrations/20261016150000_package_code.sql"), "utf8")
    expect(sql).toContain(`alphabet constant text := '${PACKAGE_CODE_ALPHABET}'`)
    const cls = /package_code ~ '\^\[([^\]]+)\]\{6\}\$'/.exec(sql)![1]!
    const chars = [...PACKAGE_CODE_ALPHABET].filter((c) => new RegExp(`[${cls}]`).test(c))
    expect(chars.join("")).toBe(PACKAGE_CODE_ALPHABET)
    for (const c of "01OILU") expect(new RegExp(`[${cls}]`).test(c)).toBe(false)
  })
})

describe("variant codes (098)", () => {
  const migration = readFileSync(resolve(__dirname, "../../../db/migrations/20261027090000_variant_code.sql"), "utf8")

  it("the database generates them from the same alphabet, with the V", () => {
    expect(migration).toContain(`alphabet constant text := '${PACKAGE_CODE_ALPHABET}'`)
    expect(migration).toContain("candidate := 'V';")
  })

  it("is V + six, and can never be mistaken for a package or bag code", () => {
    expect(isVariantCode("V7K3Q9M")).toBe(true)
    expect(isVariantCode("7K3Q9M")).toBe(false)
    expect(isPackageCode("V7K3Q9M")).toBe(false)
    expect(isVariantCode("V7K3Q9O")).toBe(false) // O is a look-alike
    expect(isVariantCode("v7k3q9m")).toBe(false)
  })
})
