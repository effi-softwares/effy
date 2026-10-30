import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * 104: every activity log is `@effy/web-kit/activity-log`'s drawer - one way to page, search, filter and export a
 * log. A screen may draw a `Timeline` only for a conversation people write into, named here with why.
 */
const TIMELINE_ALLOWED: Record<string, string> = {
  "fulfillment/OrderDetailScreen.tsx": "conversation: an order's internal notes, with Add note",
}

const FEATURES = resolve(__dirname, "../features")
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const screens = walk(FEATURES).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
const usesTimeline = (s: string) => /\bTimeline(Item)?\b/.test(s) && /@effy\/web-kit\/patterns/.test(s)

describe("activity logs are the one drawer (104)", () => {
  it("no screen draws a log inline", () => {
    const offenders = screens
      .filter((f) => usesTimeline(readFileSync(f, "utf8")))
      .map((f) => relative(FEATURES, f))
      .filter((f) => !(f in TIMELINE_ALLOWED))
    expect(offenders, "open the page's log in ActivityLogDrawer (@effy/web-kit/activity-log)").toEqual([])
  })

  it("no feature keeps a history component of its own", () => {
    const own = screens
      .map((f) => relative(FEATURES, f))
      .filter((f) => /(History|AuditTrail|ActivitySheet)\w*\.tsx$/.test(f))
    expect(own).toEqual([])
  })

  it("the allow-list names only files that still need it", () => {
    const stale = Object.keys(TIMELINE_ALLOWED).filter((f) => !usesTimeline(readFileSync(join(FEATURES, f), "utf8")))
    expect(stale).toEqual([])
  })
})
