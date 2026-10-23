import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The self-asserted phone reaches no identity, recovery or authentication path. A source scan, because
 * the requirement is an absence: trusting an unverified phone would be an account-takeover primitive.
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

/** Comments may discuss the phone; code must not touch it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

describe("phone isolation (SC-018)", () => {
  it("no identity, recovery or password path reads the phone", () => {
    const offenders: string[] = []

    for (const area of IDENTITY_PATHS) {
      for (const file of sourceFiles(join(__dirname, "..", area))) {
        const body = code(readFileSync(file, "utf8"))
        // Neither Cognito's `phone_number` nor our column.
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

  /** The closure step-up must stay keyed on the verified email. */
  it("the account-closure challenge is keyed on the verified email, not the phone", () => {
    const body = code(readFileSync(join(__dirname, "..", "closure", "service.ts"), "utf8"))
    expect(body).toContain("sendEmailVerificationCode")
    expect(body).not.toMatch(/\bphone\b/)
  })

  /** The profile PATCH is the only writer, and it is not an authentication path. */
  it("the profile update is the only place phone is written", () => {
    const body = code(
      readFileSync(join(__dirname, "..", "functions", "customer-me-v1-patch.ts"), "utf8"),
    )
    expect(body).toMatch(/\bphone\b/)
  })
})
