import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The enumeration invariant: the unauthenticated auth components may not vary with email delivery state,
 * which is knowable only for an address the platform has emailed and would reveal that an account
 * exists. The account page says it instead.
 */

const here = dirname(fileURLToPath(import.meta.url))

const AUTH_COMPONENTS = [
  "CodeStep.tsx",
  "AuthKit.tsx",
  "EmailStep.tsx",
  "PasswordStep.tsx",
  "NameStep.tsx",
]

/** Anything that would let a sign-in surface vary with how reachable an address is. */
const FORBIDDEN = [
  "emailDelivery",
  "EmailDeliveryState",
  "undeliverable",
  "soft_failing",
  "complained",
  "email_delivery_status",
]

function readIfPresent(name: string): string | null {
  try {
    return readFileSync(resolve(here, name), "utf8")
  } catch {
    return null
  }
}

describe("sign-in surfaces must not leak account existence", () => {
  it("⚠ no unauthenticated auth component references delivery state", () => {
    const offenders: string[] = []

    for (const file of AUTH_COMPONENTS) {
      const src = readIfPresent(file)
      if (src === null) continue
      // Comments are stripped: the siblings explain the rule in prose.
      const code = src
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n")

      for (const term of FORBIDDEN) {
        if (code.includes(term)) offenders.push(`${file} references "${term}"`)
      }
    }

    expect(
      offenders,
      `Sign-in copy must not vary with delivery state (FR-030a):\n${offenders.join("\n")}`,
    ).toEqual([])
  })

  /**
   * The code step's unconditional support-address escape hatch was withdrawn by the operator, along with
   * its tests; there is now no route to a human from that screen. The invariant above still holds.
   */
})
