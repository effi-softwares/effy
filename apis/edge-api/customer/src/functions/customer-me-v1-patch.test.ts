import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 036 R5 / FR-035 — the profile PATCH must mirror the name onto the Cognito profile.
 *
 * ⚠ WHY THIS TEST EXISTS AT ALL. `updateName()` was written in 012, is correct, and had **no call
 * sites anywhere in the repository** until 036. Nothing failed. No type error, no test, no guard —
 * because "a function nobody calls" is not a shape any of those notice. The only symptom was a
 * storefront header that greeted the customer by their OLD first name forever, and a comment in
 * `app/(account)/account/actions.ts` confidently describing behaviour that did not exist.
 *
 * 036 makes it load-bearing: the name is now collected AFTER the account exists, so if this write is
 * ever removed again there is no earlier moment at which the claim was populated, and the greeting
 * would read "Account" permanently for every customer created from then on.
 *
 * ⚠ WHY A SOURCE SCAN RATHER THAN A MOCKED HANDLER CALL. The handler's Cognito write is deliberately
 * best-effort and swallowed (see `syncNameToCognito`) — so a behavioural test that stubbed Cognito
 * and asserted a 200 would pass **identically whether or not the call was ever made**. That is 029's
 * exact failure mode: a test whose fixture agrees with the code instead of with the world. The
 * property that actually matters here is structural, so it is asserted structurally.
 */

const SOURCE = readFileSync(join(__dirname, "customer-me-v1-patch.ts"), "utf8")

/** Comments legitimately discuss all of this — it is the CODE that must do it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const CODE = code(SOURCE)

/**
 * ⚠ THE HANDLER BODY ONLY — and this narrowing is the entire reason the test is worth anything.
 *
 * The first version of this file scanned the WHOLE source for `updateName(` and for the relative
 * order of `updateCustomerProfile` and `syncNameToCognito`. It passed **with the call site deleted**,
 * because the helper's own definition further down the file satisfied both searches. That is 029's
 * failure mode exactly — the fixture agreeing with the code instead of with the world — and it was
 * caught only by deliberately breaking the thing the test was supposed to protect.
 *
 * The call must be inside the handler, so the assertions look inside the handler.
 */
const HANDLER = CODE.slice(
  CODE.indexOf("export const handler"),
  CODE.indexOf("async function syncNameToCognito"),
)

describe("PATCH /customer/v1/me — the Cognito name mirror (036 R5)", () => {
  it("⚠ the HANDLER actually calls the mirror", () => {
    expect(HANDLER).toMatch(/syncNameToCognito\s*\(/)
  })

  it("imports and calls updateName", () => {
    expect(CODE).toContain("updateName")
    expect(CODE).toMatch(/updateName\s*\(/)
  })

  it("⚠ writes the database BEFORE Cognito", () => {
    // The record is authoritative. If Cognito were written first and the database write then failed,
    // the claim would describe a name the platform never stored.
    const dbAt = HANDLER.indexOf("updateCustomerProfile")
    const cognitoAt = HANDLER.indexOf("syncNameToCognito")
    expect(dbAt).toBeGreaterThan(-1)
    expect(cognitoAt).toBeGreaterThan(-1)
    expect(dbAt).toBeLessThan(cognitoAt)
  })

  it("⚠ never fails the request on a Cognito error", () => {
    // The record is already committed by then. Surfacing the failure would tell the customer their
    // save did not work when it did, and they would write the same thing again.
    const fn = CODE.slice(CODE.indexOf("async function syncNameToCognito"))
    expect(fn).toMatch(/catch\s*\(/)
    // A rethrow inside the mirror would defeat the whole point.
    const body = fn.slice(0, fn.indexOf("\n}\n") + 3)
    expect(body).not.toMatch(/\bthrow\b/)
  })

  it("⚠ tolerates a missing access token instead of rejecting the request", () => {
    // Both clients send `X-Effy-Access-Token` today, but making it mandatory would turn an in-flight
    // mobile build into a hard 401 on an ordinary profile save.
    expect(CODE).toContain("ACCESS_TOKEN_HEADER")
    expect(CODE).toMatch(/if\s*\(!accessToken\)/)
    // ⚠ `requireCaller` THROWS on a missing token. It must not be used here.
    expect(CODE).not.toContain("requireCaller")
  })

  it("⚠ NEVER sends the phone to Cognito (034 FR-060a)", () => {
    // Writing `phone_number` would make an unverified, self-asserted value an identity attribute —
    // an account-takeover primitive, and the exact thing `customer/phone-isolation.test.ts` scans for.
    const call = CODE.slice(CODE.indexOf("updateName("))
    const args = call.slice(0, call.indexOf(")") + 1)
    expect(args).not.toContain("phone")
  })
})
