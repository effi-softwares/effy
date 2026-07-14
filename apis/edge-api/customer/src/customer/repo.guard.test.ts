import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * A GUARD, not a unit test.
 *
 * The upsert in repo.ts must never write `status` on the conflict path. If it does, a BARRED
 * customer un-bars themselves simply by signing in: the INSERT supplies the column default
 * ('active'), the DO UPDATE writes it straight over the ban, and the ban silently evaporates —
 * no error, no log, nothing to notice. It would defeat FR-025 and SC-011 completely, and in
 * review it would look like a harmless tidy-up ("why are we not updating status here?").
 *
 * A behavioural test cannot catch it: `upsertCustomer` is mocked in service.test.ts, and a real
 * one would need a live Postgres. So we assert the SQL itself. It is blunt, and it is the only
 * thing standing between a plausible-looking cleanup and a silent security hole.
 */
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "repo.ts"),
  "utf8",
)

/**
 * Take ONLY the executable SQL.
 *
 * ⚠ This stripping is load-bearing, and its absence is how this guard first went wrong: the
 * JSDoc above `upsertCustomer` deliberately quotes the DANGEROUS version of the statement, as a
 * warning. A guard that greps the raw file therefore fires on the counter-example in the comment
 * and reports a hole that does not exist — a false positive that trains people to ignore it,
 * which is the worst possible failure mode for a security guard.
 *
 * So: strip block comments (`/* ... *\/`) and line comments, then look only at the template
 * literals that actually reach Postgres.
 */
function executableSql(src: string): string {
  const withoutBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, "")
  const withoutLineComments = withoutBlockComments.replace(/\/\/[^\n]*/g, "")
  const literals = withoutLineComments.match(/`[\s\S]*?`/g) ?? []
  // Inside SQL, `--` starts a comment; the real statement carries an explanatory one.
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

  it("still refreshes the email, which legitimately changes at the IdP", () => {
    const doUpdate = /DO UPDATE([\s\S]*?)RETURNING/i.exec(sql)?.[1] ?? ""
    expect(/\bemail\b\s*=/.test(doUpdate)).toBe(true)
  })

  it("the guard itself can still detect a violation (it is not vacuously green)", () => {
    // If the stripping ever becomes too aggressive, this guard would pass on ANY input — which
    // is exactly as useless as no guard. Prove it still bites.
    const bad = executableSql(
      "const q = `INSERT ... ON CONFLICT (x) DO UPDATE SET status = EXCLUDED.status RETURNING *`",
    )
    const clause = /DO UPDATE([\s\S]*?)RETURNING/i.exec(bad)?.[1] ?? ""
    expect(/\bstatus\b\s*=/.test(clause)).toBe(true)
  })
})
