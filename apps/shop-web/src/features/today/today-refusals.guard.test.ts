import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * FR-011 — THREE CONTROLS THE PLATFORM CANNOT HONOUR ARE NOT BUILT (058).
 *
 * The imported design's Quick actions sheet offers nine rows. Three of them describe capabilities
 * Effy does not have, and each would have to be faked to be shown:
 *
 *   • NEW ORDER — a shop cannot create an order. Customers buy from Effy; a shop is a hidden
 *     fulfilment node that receives portions of orders the platform has already been paid for
 *     (057 FR-013 refused the same control on the order console).
 *   • DISCOUNT CODE — promotion codes are platform-wide and apply to a whole basket (027). A code
 *     created by one shop would discount other shops' items, on orders this shop never sees.
 *   • MESSAGE A CUSTOMER — a shop is never given the customer's email address (023 FR-018), and the
 *     design's own copy names a mailbox (`orders@effy.shop`) that does not exist here. The
 *     constitution is explicit that an address is asked for, never inferred.
 *
 * ⚠ WHY A SOURCE GUARD AND NOT A RENDER ASSERTION. A render test proves that today's sheet happens
 * not to contain these rows; it proves nothing about the row someone adds next month from the same
 * mockup, which is still open in a tab somewhere. The guard reads the source and fails NAMING the
 * file — the shape 054's `guard_test.go`, 039's `storefront-locks` and 057's own refusals guard all
 * use.
 *
 * ⚠ COMMENTS ARE STRIPPED FIRST, so prose stays free to explain the refusal (including this file's
 * own docblock). A guard that fires on its own justification gets deleted by the next person, and
 * takes the requirement with it.
 *
 * ⚠ AND THE PATTERNS ARE WORD-BOUNDED PHRASES, NOT DELIMITER-ANCHORED ONES. 057's first draft of the
 * equivalent guard required a quote or `<` immediately after the phrase, and its negative proof
 * exposed the hole: `<RotateCcw />Capture payment` sailed straight through. 056 records the same
 * near-miss. The phrases here match wherever they appear in code.
 */

const TODAY_DIR = resolve(__dirname)

const BANNED: Array<{ phrase: RegExp; why: string }> = [
  {
    phrase: /\bNew\s+order\b/i,
    why: "a shop cannot create an order — customers buy from Effy (057 FR-013)",
  },
  {
    phrase: /\bDiscount\s+code\b/i,
    why: "promotion codes are platform-wide and would discount other shops' items (027)",
  },
  {
    phrase: /\bNew\s+discount\s+code\b/i,
    why: "the discount dialog belongs to a capability the shop audience does not have",
  },
  {
    phrase: /\bMessage\s+a\s+customer\b/i,
    why: "a shop is never given the customer's email address (023 FR-018)",
  },
  {
    phrase: /orders@effy\.shop/i,
    why: "that mailbox does not exist — an address is asked for, never inferred (constitution)",
  },
  {
    phrase: /\bSend\s+message\b/i,
    why: "there is no customer messaging path from the shop console",
  },
]

/** Every .ts/.tsx file in the Today slice, minus its tests (a test may quote a banned phrase). */
function sourceFiles(): string[] {
  return readdirSync(TODAY_DIR, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => (n.endsWith(".ts") || n.endsWith(".tsx")) && !n.includes(".test."))
    .map((n) => join(TODAY_DIR, n))
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
}

describe("Today offers no action the platform cannot perform (FR-011)", () => {
  const files = sourceFiles()

  it("finds the Today slice's source, so the guard cannot pass vacuously", () => {
    expect(files.length).toBeGreaterThan(5)
    expect(files.some((f) => f.endsWith("QuickActionsSheet.tsx"))).toBe(true)
  })

  it.each(BANNED)("never offers $phrase", ({ phrase, why }) => {
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"))
      expect(
        phrase.test(code),
        `${file.split("/").pop()} contains ${phrase} — ${why}. If the platform genuinely gains this ` +
          `capability, the spec (FR-011) is what changes first; this assertion is not the obstacle.`,
      ).toBe(false)
    }
  })

  it("the six rows that ARE built are all present", () => {
    const sheet = readFileSync(join(TODAY_DIR, "QuickActionsSheet.tsx"), "utf8")
    for (const row of [
      "New product",
      "Print pick lists",
      "Receive stock",
      "Open the attention queue",
      "Export orders",
      "Open insights",
    ]) {
      expect(sheet, `the sheet should offer "${row}"`).toContain(row)
    }
  })
})
