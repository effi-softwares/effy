import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Three Quick actions the design offers are not built, because each would have to be faked:
 *  • New order: a shop cannot create an order; it fulfils portions of orders already paid.
 *  • Discount code: codes are platform-wide and would discount other shops' items.
 *  • Message a customer: a shop never has the customer's email, and the design's mailbox does not exist.
 *
 * A source guard; comments are stripped first, and patterns are word-bounded phrases that match wherever
 * they appear in code.
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

/** Every.ts/.tsx file in the Today slice, minus its tests (a test may quote a banned phrase). */
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
