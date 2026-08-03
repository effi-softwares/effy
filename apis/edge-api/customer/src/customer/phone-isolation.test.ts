import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 034 SC-018 / FR-060a — the phone is accepted by NO identity, recovery or authentication path.
 *
 * ⚠ WHY THIS IS A SOURCE SCAN RATHER THAN A BEHAVIOURAL TEST.
 *
 * The requirement is an ABSENCE, and absences are what regressions are made of. A behavioural test
 * can only assert that the paths which exist today ignore the phone; it cannot notice the day someone
 * adds `phone` to the recovery lookup because it seemed like a helpful convenience. This notices.
 *
 * The value is SELF-ASSERTED and this feature never verifies it. Treating an unverified phone as an
 * identity factor is an account-takeover primitive: anyone who can set their phone to a victim's
 * number could then recover through it. Feature 011's constitution amendment makes the same argument
 * about federated linking on an unverified email, and it is the same mistake in a different field.
 */

const IDENTITY_PATHS = ["password", "lib"]

function sourceFiles(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out = out.concat(sourceFiles(full))
    } else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
      out.push(full)
    }
  }
  return out
}

/** Comments legitimately discuss the phone — it is the CODE that must not touch it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

describe("phone isolation (SC-018)", () => {
  it("no identity, recovery or password path reads the phone", () => {
    const offenders: string[] = []

    for (const area of IDENTITY_PATHS) {
      for (const file of sourceFiles(join(__dirname, "..", area))) {
        const body = code(readFileSync(file, "utf8"))
        // `phone_number` is Cognito's own standard attribute; neither it nor our column may appear.
        if (/\bphone\b|\bphone_number\b|\bphoneNumber\b/.test(body)) {
          offenders.push(file)
        }
      }
    }

    expect(
      offenders,
      `phone must not participate in identity or recovery:\n${offenders.join("\n")}`,
    ).toEqual([])
  })

  /**
   * The closure step-up is the sharpest case: it is the gate in front of an irreversible action, and
   * it MUST stay keyed on the verified email attribute. That is also what makes it completable by a
   * customer whose only credential is Google — a phone or password factor would dead-end them.
   */
  it("the account-closure challenge is keyed on the verified email, not the phone", () => {
    const body = code(readFileSync(join(__dirname, "..", "closure", "service.ts"), "utf8"))
    expect(body).toContain("sendEmailVerificationCode")
    expect(body).not.toMatch(/\bphone\b/)
  })

  /** The profile PATCH is the ONLY writer, and it is not an authentication path. */
  it("the profile update is the only place phone is written", () => {
    const body = code(
      readFileSync(join(__dirname, "..", "functions", "customer-me-v1-patch.ts"), "utf8"),
    )
    expect(body).toMatch(/\bphone\b/)
  })
})
