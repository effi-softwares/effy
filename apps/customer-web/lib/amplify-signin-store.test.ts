import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Pins the undocumented Amplify behaviour the one-route sign-in flow rests on: the in-flight challenge
 * is kept in `sessionStorage` under `CognitoSignInState.*`, with a three-minute expiry (shorter than
 * the code's five) and absent in a new tab. So the step machine must be re-entrant (no live state at the
 * code step falls back to step 1) and `SignInException` must say "your sign-in timed out".
 *
 * A source scan, because exercising it needs a real Cognito sign-in. If it fails after an `aws-amplify`
 * upgrade, do not delete it: check the step machine's assumptions still hold, then update it.
 */

const require = createRequire(import.meta.url)

/** The `@internal` module that persists the in-flight challenge. */
function signInStoreSource(): string {
  // Resolve from `package.json`, not from the module entry: `require.resolve` hands back the CJS
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
    // no warning - and the "degrade to step 1" path becomes the common case instead of the edge one.
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
    // The number matters: it is stricter than the platform's own five-minute code TTL, which is why
    // there is a two-minute window where the code is still valid and the client has already given up.
    // A change here changes what the shopper sees, and the copy would need to change with it.
    expect(source).toMatch(/3\s*\*\s*60\s*\*\s*1000/)
  })

  it("pins the version this behaviour was verified against", () => {
    // Not a lockfile substitute - a breadcrumb. The behaviour above was read out of this version's
    // source; a major bump is a prompt to re-read it rather than to trust these greps.
    const pkg = require("@aws-amplify/auth/package.json") as { version: string }
    expect(pkg.version.startsWith("6."), `verified against 6.x, found ${pkg.version}`).toBe(true)
  })
})
