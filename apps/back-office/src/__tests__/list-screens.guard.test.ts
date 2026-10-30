import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * 103: every console list and bounded table is `@effy/web-kit/data-table` (`DataTable` / `StaticTable`). A screen
 * may draw the raw `Table` only when it is a board, an editor, a review or a timeline — named here, with why.
 */
const RAW_TABLE_ALLOWED: Record<string, string> = {
  "delivery/pricing/PlanEditor.tsx": "editor: a fee plan's bands",
  "dispatch/components/RoundTable.tsx": "board: dispatch",
  "dispatch/components/UnassignedPanel.tsx": "board: dispatch",
  "dispatch/components/WindowsByDay.tsx": "board: dispatch",
  "drivers/components/DutyPanel.tsx": "board: who is on duty now",
  "exceptions/SequenceSections.tsx": "board: held packages, overdue runs, vehicle checks",
  "hub/HubStationScreen.tsx": "board: the hub station",
  "orders/components/PackageRows.tsx": "bags: each row is a scan-to-find anchor",
  "orders/components/RefundsSection.tsx": "action list: proposed refunds (its history is a StaticTable)",
  "overview/TodaysWindows.tsx": "board: today's windows",
  "products/ImportScreens.tsx": "editor/review: an import's column map and outcome",
  "promotions/components/PerformancePanel.tsx": "matrix: metrics by window",
  "staff-identity/AdminAccessScreen.tsx": "matrix: permissions",
  "taxonomy/AttachmentEditor.tsx": "editor: a category's attributes",
}

const FEATURES = resolve(__dirname, "../features")
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const screens = walk(FEATURES).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
const importsRawTable = (s: string) =>
  [...s.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@effy\/design-system\/ui"/g)].some((m) => /\bTable\b/.test(m[1]!))

describe("console lists use the one data table (103)", () => {
  it("no screen draws the raw Table unless it is a named board, editor, review or timeline", () => {
    const offenders = screens
      .filter((f) => importsRawTable(readFileSync(f, "utf8")))
      .map((f) => relative(FEATURES, f))
      .filter((f) => !(f in RAW_TABLE_ALLOWED))
    expect(offenders, "use DataTable or StaticTable from @effy/web-kit/data-table").toEqual([])
  })

  it("the allow-list names only files that still need it", () => {
    const stale = Object.keys(RAW_TABLE_ALLOWED).filter((f) => {
      try {
        return !importsRawTable(readFileSync(join(FEATURES, f), "utf8"))
      } catch {
        return true
      }
    })
    expect(stale).toEqual([])
  })

  it("no list scrolls forever, and no list writes its own phone layout", () => {
    const infinite = screens
      .filter((f) => /useInfiniteQuery/.test(readFileSync(f, "utf8")))
      .map((f) => relative(FEATURES, f))
    expect(infinite).toEqual([])
    // A hand-written `data-m` belongs to a board above; a list gets its phone layout from column meta.
    const dataM = screens
      .filter((f) => /data-m=/.test(readFileSync(f, "utf8")))
      .map((f) => relative(FEATURES, f))
      .filter((f) => !(f in RAW_TABLE_ALLOWED))
    expect(dataM).toEqual([])
  })
})
