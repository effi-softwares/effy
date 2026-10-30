import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { toDTO } from "./model"
import type { CustomerRow } from "./model"

/** The serialised `CustomerDTO` must match what the generated Kotlin declares; a rename compiles on both sides. */

const row: CustomerRow = {
  id: "c-1",
  cognito_sub: "sub-1",
  email: "shopper@example.com",
  given_name: "Janith",
  family_name: "Madarasinghe",
  phone: "0400 000 000",
  status: "active",
  closure_state: "open",
  has_password: true,
  email_delivery: null,
  password_updated_at: new Date("2026-08-01T00:00:00Z"),
  created_at: new Date("2026-07-14T00:00:00Z"),
  updated_at: new Date("2026-07-14T00:00:00Z"),
}

describe("CustomerDTO wire contract", () => {
  /** The key set is written from the contract, not the implementation. */
  it("emits exactly the agreed keys, in the agreed spelling", () => {
    expect(Object.keys(toDTO(row)).sort()).toEqual(
      [
        "closureState",
        "createdAt",
        "email",
        "emailDelivery",
        "familyName",
        "givenName",
        "hasPassword",
        "id",
        "passwordUpdatedAt",
        "phone",
        "status",
      ].sort(),
    )
  })

  /** `cognito_sub` never reaches the wire. */
  it("never leaks the identity-provider subject", () => {
    const json = JSON.stringify(toDTO(row))
    expect(json).not.toContain("cognito")
    expect(json).not.toContain("sub-1")
  })

  /** The generated Kotlin must declare the same property names. */
  it("matches the generated Kotlin contract, field for field", () => {
    const dtoKt = readFileSync(
      join(__dirname, "../../../../../packages/shared-types/contract/Dto.kt"),
      "utf8",
    )

    const block = /data class CustomerDTO \(([\s\S]*?)\n\)/.exec(dtoKt)
    expect(block, "CustomerDTO not found in the generated Kotlin - did the aggregator drop it?")
      .not.toBeNull()

    const body = block![1]!
    for (const key of Object.keys(toDTO(row))) {
      expect(body, `Kotlin CustomerDTO is missing "${key}"`).toContain(`val ${key}`)
    }
  })

  /** Dates are ISO-8601 strings. */
  it("serialises timestamps as ISO-8601 strings", () => {
    const dto = toDTO(row)
    expect(dto.createdAt).toBe("2026-07-14T00:00:00.000Z")
    expect(dto.passwordUpdatedAt).toBe("2026-08-01T00:00:00.000Z")
  })

  /** `null` is a complete value for each of these. */
  it("keeps null as null rather than inventing a value", () => {
    const dto = toDTO({
      ...row,
      given_name: null,
      family_name: null,
      phone: null,
      password_updated_at: null,
    })
    expect(dto.givenName).toBeNull()
    expect(dto.familyName).toBeNull()
    expect(dto.phone).toBeNull()
    expect(dto.passwordUpdatedAt).toBeNull()
  })
})
