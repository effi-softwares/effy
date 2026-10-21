import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { judgeRead, readCode, type ScanContext } from "./scan-rule"
import type { ReadMethod } from "./parcels"

const FIXTURES = JSON.parse(readFileSync(resolve(__dirname, "../scan-rule.fixtures.json"), "utf8")) as {
  context: ScanContext
  cases: Array<{ raw: string; method: ReadMethod; expect: { outcome: string; code: string | null; words: string } }>
}

describe("scan rule (096)", () => {
  it("agrees with every row of the shared fixture", () => {
    for (const c of FIXTURES.cases) {
      expect(judgeRead(c.raw, c.method, FIXTURES.context), JSON.stringify(c.raw)).toEqual(c.expect)
    }
  })

  it("covers every outcome the client can decide", () => {
    const seen = new Set(FIXTURES.cases.map((c) => c.expect.outcome))
    for (const o of ["accepted", "already_counted", "belongs_elsewhere", "not_on_this_work", "voided", "cancelled", "not_a_label"]) {
      expect(seen, o).toContain(o)
    }
  })

  it("a voided label is refused even when it is also expected", () => {
    const ctx: ScanContext = { expected: [{ code: "7K3Q9M", seq: 1, of: 1 }], counted: [], voided: ["7K3Q9M"] }
    expect(judgeRead("EFY1:7K3Q9M", "scan", ctx).outcome).toBe("voided")
  })

  it("a scanned bare value is not loosened like a typed one", () => {
    expect(readCode("wtm zhx", "scan")).toBeNull()
    expect(readCode("wtm zhx", "typed")).toBe("WTMZHX")
  })

  /** The driver app embeds a copy of the fixture (commonTest cannot read outside the app). */
  it("the driver app's embedded fixture is this JSON", () => {
    const kt = readFileSync(
      resolve(__dirname, "../../../apps/driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile/core/scan/ScanRuleFixture.kt"),
      "utf8",
    )
    const embedded = kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')).trim()
    expect(JSON.parse(embedded)).toEqual(FIXTURES)
  })
})
