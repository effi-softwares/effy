import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 036 T058 / R1 — the undocumented Amplify behaviour this whole design rests on.
 *
 * ⚠ WHY THIS TEST EXISTS. The customer sign-in step form keeps all its steps on ONE route rather than
 * giving each a URL, and that decision is justified by a fact found by reading Amplify's source, not
 * its docs: the in-flight sign-in challenge (`username`, `challengeName`, `signInSession`) is
 * persisted to `window.sessionStorage` under `CognitoSignInState.*`, with a **three-minute** expiry —
 * shorter than the five-minute code TTL, and absent entirely in a new tab.
 *
 * Two consequences ride on it. The step machine must be **re-entrant** (arriving at the code step
 * without live state degrades to step 1), and `SignInException` must be mapped to "your sign-in timed
 * out" rather than a generic fault.
 *
 * ⚠ IT IS AN `@internal` MODULE WHOSE OWN TODO SAYS "replace all of this implementation with state
 * machines". If an `aws-amplify` upgrade changes the mechanism, nothing else in this repo would
 * notice: types still compile, unit tests still pass, and the symptom is a shopper losing a live code
 * on a page refresh — in production, intermittently, with no error anyone can reproduce.
 *
 * ⚠ A SOURCE SCAN RATHER THAN A BEHAVIOURAL TEST, deliberately. Exercising it would mean a real
 * `signIn()` against Cognito, which this repo does not fake ("mocking Cognito and calling that proof
 * would be exactly the dishonest green this slice has been careful to avoid"). What is asserted here
 * is the *mechanism's continued existence*, which is precisely the thing an upgrade would remove.
 *
 * If this test fails after a dependency bump: **do not delete it.** Re-read
 * `specs/036-auth-step-flow/research.md` R1 and check whether the step machine's assumptions still
 * hold, then update this file to match what the new version actually does.
 */

const require = createRequire(import.meta.url)

/** The `@internal` module that persists the in-flight challenge. */
function signInStoreSource(): string {
  // ⚠ Resolve from `package.json`, not from the module entry: `require.resolve` hands back the CJS
  // build, and the file we need lives under `dist/esm`.
  const root = dirname(require.resolve("@aws-amplify/auth/package.json"))
  return readFileSync(
    join(root, "dist", "esm", "client", "utils", "store", "signInStore.mjs"),
    "utf8",
  )
}

describe("Amplify's sign-in challenge store (036 R1)", () => {
  const source = signInStoreSource()

  it("⚠ still PERSISTS the challenge rather than holding it only in memory", () => {
    // If this goes, a soft navigation between steps still works but a reload loses the challenge with
    // no warning — and the "degrade to step 1" path becomes the common case instead of the edge one.
    expect(source).toMatch(/sessionStorage/i)
  })

  it("⚠ still uses the four `CognitoSignInState.*` keys", () => {
    // Named individually: losing `signInSession` alone is enough to break `confirmSignIn`, and it is
    // the one a refactor is most likely to rename.
    expect(source).toContain("CognitoSignInState")
    for (const key of ["username", "challengeName", "signInSession", "expiry"]) {
      expect(source, `the ${key} key disappeared from Amplify's sign-in store`).toContain(key)
    }
  })

  it("⚠ still expires the stored challenge in THREE minutes", () => {
    // The number matters: it is STRICTER than the platform's own five-minute code TTL, which is why
    // there is a two-minute window where the code is still valid and the client has already given up.
    // A change here changes what the shopper sees, and the copy would need to change with it.
    expect(source).toMatch(/3\s*\*\s*60\s*\*\s*1000/)
  })

  it("pins the version this behaviour was verified against", () => {
    // ⚠ Not a lockfile substitute — a breadcrumb. The behaviour above was read out of THIS version's
    // source; a major bump is a prompt to re-read it rather than to trust these greps.
    const pkg = require("@aws-amplify/auth/package.json") as { version: string }
    expect(pkg.version.startsWith("6."), `verified against 6.x, found ${pkg.version}`).toBe(true)
  })
})
