import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The profile PATCH must mirror the name onto Cognito, or the storefront's greeting (read from the ID
 * token) stays wrong forever. A source scan, because the Cognito write is best-effort and swallowed.
 */

const SOURCE = readFileSync(join(__dirname, "customer-me-v1-patch.ts"), "utf8")

/** Comments may discuss this; the code must do it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const CODE = code(SOURCE)

/** The handler body only: the helper's own definition must not satisfy the search. */
const HANDLER = CODE.slice(
  CODE.indexOf("export const handler"),
  CODE.indexOf("async function syncNameToCognito"),
)

describe("PATCH /customer/v1/me - the Cognito name mirror (036 R5)", () => {
  it("⚠ the HANDLER actually calls the mirror", () => {
    expect(HANDLER).toMatch(/syncNameToCognito\s*\(/)
  })

  it("imports and calls updateName", () => {
    expect(CODE).toContain("updateName")
    expect(CODE).toMatch(/updateName\s*\(/)
  })

  it("⚠ writes the database BEFORE Cognito", () => {
    // The record first: otherwise the claim could name something the platform never stored.
    const dbAt = HANDLER.indexOf("updateCustomerProfile")
    const cognitoAt = HANDLER.indexOf("syncNameToCognito")
    expect(dbAt).toBeGreaterThan(-1)
    expect(cognitoAt).toBeGreaterThan(-1)
    expect(dbAt).toBeLessThan(cognitoAt)
  })

  it("⚠ never fails the request on a Cognito error", () => {
    // The record is already committed; surfacing the failure would say the save failed.
    const fn = CODE.slice(CODE.indexOf("async function syncNameToCognito"))
    expect(fn).toMatch(/catch\s*\(/)
    const body = fn.slice(0, fn.indexOf("\n}\n") + 3)
    expect(body).not.toMatch(/\bthrow\b/)
  })

  it("⚠ tolerates a missing access token instead of rejecting the request", () => {
    // Optional: making the access token mandatory would 401 a client that does not send it.
    expect(CODE).toContain("ACCESS_TOKEN_HEADER")
    expect(CODE).toMatch(/if\s*\(!accessToken\)/)
    // `requireCaller` throws on a missing token, so it must not be used here.
    expect(CODE).not.toContain("requireCaller")
  })

  it("⚠ NEVER sends the phone to Cognito (034 FR-060a)", () => {
    // `phone_number` would make an unverified phone an identity attribute.
    const call = CODE.slice(CODE.indexOf("updateName("))
    const args = call.slice(0, call.indexOf(")") + 1)
    expect(args).not.toContain("phone")
  })
})
