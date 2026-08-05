import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 034 SC-009 — the deletion flow never offers an alternative to deleting.
 *
 * ⚠ THIS IS AN AUTOMATED CHECK RATHER THAN A READING, AND THE REASON IS SPECIFIC.
 *
 * Both documented App Review rejections in this area were flows that said "delete" and behaved like
 * "deactivate". Google's User Data policy is blunter still: *"Temporary account deactivation,
 * disabling, or 'freezing' the app account does not qualify as account deletion."*
 *
 * The words are the tell. If one ever appears in shopper-facing copy — in a retention prompt, a
 * softened confirmation, a "are you sure you don't just want to…" — that is the moment this feature
 * stops being compliant, and it is exactly the kind of change that arrives as a friendly-sounding
 * copy tweak nobody flags in review.
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

/**
 * Strip comments before scanning. The words are legitimate — and necessary — in the explanations of
 * WHY they must not appear; it is the rendered copy that must be clean.
 */
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
