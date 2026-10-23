import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The deletion flow never offers an alternative to deleting: deactivate/disable/freeze wording in the
 * rendered copy is what app-store reviewers reject.
 */

const FORBIDDEN = ["deactivate", "deactivation", "freeze", "freezing", "pause your account"]

/** Files the shopper's deletion journey actually renders. */
const ROOTS = [
  join(__dirname),
  join(__dirname, "..", "..", "..", "delete-account"),
]

function sourceFiles(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out = out.concat(sourceFiles(full))
    } else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      out.push(full)
    }
  }
  return out
}

/** Comments are stripped first: they may explain why the words must not appear. */
function shopperFacingText(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
}

describe("account deletion copy (SC-009)", () => {
  it("never offers to deactivate, freeze or pause an account instead of deleting it", () => {
    const offenders: string[] = []

    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const text = shopperFacingText(readFileSync(file, "utf8")).toLowerCase()
        for (const word of FORBIDDEN) {
          if (text.includes(word)) offenders.push(`${file}: "${word}"`)
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("does say DELETE, so the check above cannot pass by the copy being empty", () => {
    const all = sourceFiles(ROOTS[0]!)
      .concat(sourceFiles(ROOTS[1]!))
      .map((f) => shopperFacingText(readFileSync(f, "utf8")).toLowerCase())
      .join("\n")

    expect(all).toContain("delete")
  })
})
