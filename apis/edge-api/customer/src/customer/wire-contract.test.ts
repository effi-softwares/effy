import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { toDTO } from "./model"
import type { CustomerRow } from "./model"

/**
 * THE CROSS-LANGUAGE WIRE CONTRACT for `CustomerDTO` (034 T033).
 *
 * ⚠ WHY A BYTE COMPARISON AND NOT A TYPE CHECK.
 *
 * TypeScript and Kotlin agree at compile time only about types they each derive from the same
 * source — and `Dto.kt` is GENERATED, so a rename in `customer.ts` regenerates the Kotlin happily and
 * both sides still compile. What breaks is the SERIALISED NAME on the wire, silently, at runtime, in
 * production only. Feature 027 lost days to exactly this class: Kotlin serialised a quantity as
 * `1.0`, Go refused it into an `int`, and every unit test on both sides passed because the fakes
 * spoke the same language at both ends and never crossed the wire.
 *
 * Feature 028 built the first such test (`wire_contract_test.go` + `BannerWireContractTest.kt`) and
 * proved it by breaking it two ways. This is the same shape for the customer record, which 034 has
 * just widened with two new fields.
 */

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
  /**
   * ⚠ THE KEY SET IS PINNED EXPLICITLY, and written from the CONTRACT rather than from the struct.
   *
   * Feature 033 recorded the failure mode this avoids: a key-set test passed because its expectation
   * had been written by reading the implementation, so it asserted only that the code agreed with
   * itself. This list is the wire shape the clients are entitled to.
   */
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

  /** ⚠ `cognito_sub` is an internal join key and must never reach the wire. */
  it("never leaks the identity-provider subject", () => {
    const json = JSON.stringify(toDTO(row))
    expect(json).not.toContain("cognito")
    expect(json).not.toContain("sub-1")
  })

  /**
   * ⚠ The generated Kotlin must declare the same property names. A silent rename in `customer.ts`
   * regenerates `Dto.kt` and both sides compile — this is what notices.
   */
  it("matches the generated Kotlin contract, field for field", () => {
    const dtoKt = readFileSync(
      join(__dirname, "../../../../../packages/shared-types/contract/Dto.kt"),
      "utf8",
    )

    // The `data class CustomerDTO ( … )` block.
    const block = /data class CustomerDTO \(([\s\S]*?)\n\)/.exec(dtoKt)
    expect(block, "CustomerDTO not found in the generated Kotlin — did the aggregator drop it?")
      .not.toBeNull()

    const body = block![1]!
    for (const key of Object.keys(toDTO(row))) {
      expect(body, `Kotlin CustomerDTO is missing "${key}"`).toContain(`val ${key}`)
    }
  })

  /** Dates cross the wire as ISO-8601 strings, never as epoch numbers or Date objects. */
  it("serialises timestamps as ISO-8601 strings", () => {
    const dto = toDTO(row)
    expect(dto.createdAt).toBe("2026-07-14T00:00:00.000Z")
    expect(dto.passwordUpdatedAt).toBe("2026-08-01T00:00:00.000Z")
  })

  /** `null` is a legitimate, complete value for each of these — not a gap to be defaulted away. */
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
