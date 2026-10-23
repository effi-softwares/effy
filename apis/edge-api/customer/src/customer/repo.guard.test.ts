import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

/** The upsert must never write `status` on conflict, or a barred customer un-bars themselves by signing in. */
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "repo.ts"),
  "utf8",
)

/** Only the executable SQL: comments are stripped so prose cannot trip the guard. */
function executableSql(src: string): string {
  const withoutBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, "")
  const withoutLineComments = withoutBlockComments.replace(/\/\/[^\n]*/g, "")
  const literals = withoutLineComments.match(/`[\s\S]*?`/g) ?? []
  // `--` starts a SQL comment.
  return literals.join("\n").replace(/--[^\n]*/g, "")
}

const sql = executableSql(source)

describe("upsert SQL guard (FR-025)", () => {
  it("does NOT write `status` on the ON CONFLICT path", () => {
    const doUpdate = /DO UPDATE([\s\S]*?)RETURNING/i.exec(sql)?.[1]

    expect(doUpdate, "the upsert's DO UPDATE clause should be findable").toBeTruthy()

    expect(
      /\bstatus\b\s*=/.test(doUpdate!),
      "SECURITY: the upsert assigns `status` on the conflict path. A BARRED customer would " +
        "un-ban themselves simply by signing in — the INSERT supplies the 'active' default and " +
        "DO UPDATE writes it over the ban, silently. `status` is platform-owned. Remove it.",
    ).toBe(false)
  })

  it("does NOT overwrite the customer's NAME on conflict either", () => {
    // Nor the name: it is the customer's to change, and refreshing it from the token would revert their edit.
    const doUpdate = /DO UPDATE([\s\S]*?)RETURNING/i.exec(sql)?.[1] ?? ""

    expect(
      /\bgiven_name\b\s*=/.test(doUpdate) || /\bfamily_name\b\s*=/.test(doUpdate),
      "the upsert assigns the customer's name on conflict — a profile edit would be silently reverted on their next page load",
    ).toBe(false)
  })

  it("still refreshes the email, which legitimately changes at the IdP", () => {
    const doUpdate = /DO UPDATE([\s\S]*?)RETURNING/i.exec(sql)?.[1] ?? ""
    expect(/\bemail\b\s*=/.test(doUpdate)).toBe(true)
  })

  it("the guard itself can still detect a violation (it is not vacuously green)", () => {
    // Prove the stripping is not so aggressive that the guard passes anything.
    const bad = executableSql(
      "const q = `INSERT ... ON CONFLICT (x) DO UPDATE SET status = EXCLUDED.status RETURNING *`",
    )
    const clause = /DO UPDATE([\s\S]*?)RETURNING/i.exec(bad)?.[1] ?? ""
    expect(/\bstatus\b\s*=/.test(clause)).toBe(true)
  })
})
