import { describe, expect, it } from "vitest"

import { createWedge, normaliseScan } from "./wedge"

const TOKEN = /^EFY1:[2-9A-HJKMNP-TV-Z]{6}$/

/** A fake clock and timer, so bursts and idles are exact. */
function harness(opts: { interKeyMs?: number; idleMs?: number } = {}) {
  const scans: string[] = []
  let timers: Array<{ at: number; fn: () => void }> = []
  let now = 0
  const onKey = createWedge({
    accept: (t) => TOKEN.test(t) || /^EFY-[0-9A-Z]{4,12}$/.test(t),
    onScan: (t) => scans.push(t),
    ...opts,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn }
      timers.push(t)
      return t
    },
    clearTimer: (h) => {
      timers = timers.filter((t) => t !== h)
    },
  })
  const advance = (ms: number) => {
    now += ms
    const due = timers.filter((t) => t.at <= now)
    timers = timers.filter((t) => t.at > now)
    for (const t of due) t.fn()
  }
  const type = (text: string, gap: number, field?: { value: string; set: (v: string) => void }) => {
    for (const ch of text) {
      advance(gap)
      onKey({ key: ch, at: now, field })
    }
  }
  const key = (k: string) => onKey({ key: k, at: now })
  return { scans, type, key, advance }
}

describe("keyboard-wedge scanners (096, R13)", () => {
  it("a fast burst ending in Enter is a scan, and the Enter is swallowed", () => {
    const h = harness()
    h.type("EFY1:WTMZHX", 5)
    expect(h.key("Enter")).toBe(true)
    expect(h.scans).toEqual(["EFY1:WTMZHX"])
  })

  it("a burst with no suffix ends after a short idle", () => {
    const h = harness()
    h.type("EFY1:WTMZHX", 5)
    h.advance(100)
    expect(h.scans).toEqual(["EFY1:WTMZHX"])
  })

  it("Tab ends a scan too", () => {
    const h = harness()
    h.type("EFY1:WTMZHX", 5)
    expect(h.key("Tab")).toBe(true)
    expect(h.scans).toEqual(["EFY1:WTMZHX"])
  })

  it("slow typing is never a scan, and its Enter is left alone", () => {
    const h = harness()
    h.type("EFY1:WTMZHX", 120)
    expect(h.key("Enter")).toBe(false)
    expect(h.scans).toEqual([])
  })

  it("a stray key before the scan is dropped", () => {
    const h = harness()
    h.type("x", 5)
    h.advance(400)
    h.type("EFY1:WTMZHX", 5)
    h.key("Enter")
    expect(h.scans).toEqual(["EFY1:WTMZHX"])
  })

  it("forgives Caps Lock on a label token", () => {
    expect(normaliseScan("efy1:wtmzhx")).toBe("EFY1:WTMZHX")
    const h = harness()
    h.type("efy1:wtmzhx", 5)
    h.key("Enter")
    expect(h.scans).toEqual(["EFY1:WTMZHX"])
  })

  it("a fast burst the screen does not read (a product barcode) is not a scan", () => {
    const h = harness()
    h.type("9300633603345", 5)
    expect(h.key("Enter")).toBe(false)
    expect(h.scans).toEqual([])
  })

  it("reads an order number when the screen accepts one", () => {
    const h = harness()
    h.type("EFY-ESDPKF", 5)
    h.key("Enter")
    expect(h.scans).toEqual(["EFY-ESDPKF"])
  })

  it("takes a scan's characters back out of the field it was typed into (FR-051)", () => {
    const h = harness()
    const keyed = { value: "Leave at the door. EFY1:WTMZHX", set: (v: string) => { keyed.value = v } }
    h.type("EFY1:WTMZHX", 5, keyed)
    h.key("Enter")
    expect(h.scans).toEqual(["EFY1:WTMZHX"])
    expect(keyed.value).toBe("Leave at the door. ")
  })
})
