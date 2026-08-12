import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * ⚠ THE ENUMERATION INVARIANT (037 FR-030a / SC-011a).
 *
 * 037 gave the platform something it never had: it now KNOWS when it cannot reach an address. The
 * tempting next step is to say so on the sign-in screen — it would be kinder, and it is the first
 * thing anyone will propose.
 *
 * It must not happen. The sign-in screens are UNAUTHENTICATED, and delivery state is only knowable
 * for an address the platform has actually emailed — which implies an account exists. Branching on
 * it there would answer *"does this address have an Effy account?"* to anyone who types one,
 * spending the defence 035 built (phantom sends to `success@simulator.amazonses.com`, deliberate
 * timing parity, its own FR-016) to improve a line of copy.
 *
 * ⚠ A RULE THAT ONLY EXISTS IN A COMMENT IS A RULE THAT EVENTUALLY GETS BROKEN. This makes it
 * mechanical: the unauthenticated auth components may not reference delivery state at all.
 *
 * The honest, specific statement lives on the AUTHENTICATED account page instead (FR-030), and this
 * screen carries a UNIFORM escape hatch shown to everyone regardless of state.
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
      // Strip comments: this file's own siblings explain the rule in prose, and asserting against
      // prose is exactly how 035's hyphenation guard failed the first time it was written.
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
   * ⚠ TWO TESTS WERE REMOVED HERE ON 2026-08-11, AND THIS NOTE IS THEIR REPLACEMENT.
   *
   * They asserted 037 FR-030a: that the code step carries an UNCONDITIONAL escape hatch — a support
   * address, shown to everyone, never behind a branch — and that it names a route to a human.
   *
   *   expect(src).toContain("<StuckNote />")
   *   expect(src).not.toMatch(/[&?]\s*<StuckNote/)
   *   expect(src).toContain("hello@effyshopping.com")
   *
   * ⚠ THE REQUIREMENT WAS WITHDRAWN BY THE OPERATOR (044), NOT THE TEST LOOSENED TO MAKE A CHANGE
   * PASS. The support address and the spam-folder note were removed from the code step for visual
   * reasons. These assertions became false statements about a requirement that no longer exists, and
   * a guard that asserts a withdrawn requirement is worse than no guard: the next person deletes it on
   * correct grounds and takes the live requirement with it.
   *
   * ⚠ WHAT WAS ACTUALLY GIVEN UP, recorded so it is a decision and not an accident. The hatch existed
   * BECAUSE of the test above it: the platform deliberately cannot tell a shopper "we can't reach that
   * address", since delivery state is only knowable for an address it has emailed — which would answer
   * "does this person have an Effy account?" to anyone who asked. The support line was the one honest
   * way out for someone whose code never arrives. There is now no route to a human from that screen.
   *
   * The FIRST test in this file — the one that matters most — is untouched and still passing: no
   * unauthenticated auth component may vary its copy with delivery state. That is the enumeration
   * defence itself. This was the mitigation for the cost of it.
   */
})
