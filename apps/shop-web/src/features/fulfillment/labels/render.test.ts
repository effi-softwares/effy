// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { PATTERNS, STOP } from "./code128"
import { fitText, textWidthMm } from "./fit"
import { printDocument } from "./print"
import {
  GEOMETRY,
  LABEL_CONTACT,
  LABEL_LAYOUTS,
  WORDMARK_PATHS,
  layoutLabel,
  renderLabelSvg,
  type LabelDocument,
  type LabelElement,
  type LabelLayout,
  type PrinterDpi,
} from "./render"
import { bitmapToZpl, crc16, labelDots, toMonochrome } from "./zpl"

const common = {
  service: "effy_driver" as const,
  orderNumber: "EFY-ESDPKF",
  packedOn: "2026-10-21",
  recipientName: "Amelia Thompson",
  line1: "14 Lydiard Street North",
  line2: "Unit 3" as string | null,
  country: "AU" as string | null,
  phone: "0412 345 678" as string | null,
  suburb: "Ballarat Central",
  state: "VIC",
  postcode: "3350",
}
const LONG = {
  ...common,
  service: "courier" as const,
  recipientName: "Dr Christopher Alexander Montgomery-Wright of Somewhere Rather Long Indeed",
  line1: "Unit 1204, Level 12, 488 St Kilda Road (enter via Bowen Crescent, use the side gate past the bins)",
  line2: "Building C, Southbank Business Park, Tower Two, Reception on the Ground Floor",
  suburb: "Melbourne Central Business District Extended",
}
const doc = (over: Partial<LabelDocument["parcel"]> = {}, c: LabelDocument["common"] = common): LabelDocument => ({
  common: c,
  parcel: { code: "WTMZHX", seq: 2, of: 3, zone: "frozen", ...over },
})

const LAYOUTS = LABEL_LAYOUTS.map((l) => l.id)
const ZONES = ["ambient", "chilled", "frozen"] as const
const textOf = (els: LabelElement[]) => els.filter((e): e is Extract<LabelElement, { kind: "text" }> => e.kind === "text").map((e) => e.text)

/** An element's box in mm (text measured with the same metrics the fit uses). */
function box(e: LabelElement): { x0: number; x1: number; y0: number; y1: number } {
  switch (e.kind) {
    case "rect":
      return { x0: e.x, x1: e.x + e.w, y0: e.y, y1: e.y + e.h }
    case "bars": {
      const w = e.widths.reduce((a, b) => a + b, 0) * e.moduleMm
      return { x0: e.x, x1: e.x + w, y0: e.y, y1: e.y + e.h }
    }
    case "qr":
      return { x0: e.x, x1: e.x + e.size, y0: e.y, y1: e.y + e.size }
    case "mark":
      return { x0: e.x, x1: e.x + (e.h * 198.2) / 86, y0: e.y, y1: e.y + e.h }
    case "text": {
      const w = textWidthMm(e.text, e.sizePt, { bold: e.bold, mono: e.mono }) + (e.spacing ?? 0) * e.sizePt * 0.3528 * e.text.length
      const x0 = e.anchor === "end" ? e.x - w : e.anchor === "middle" ? e.x - w / 2 : e.x
      return { x0, x1: x0 + w, y0: e.y - e.sizePt * 0.3528 * 0.8, y1: e.y + e.sizePt * 0.3528 * 0.25 }
    }
  }
}

/** Decode the bars back to text — what a scanner would read. */
function decode(widths: number[]): string {
  const byPattern = new Map(PATTERNS.map((p, v) => [p, v]))
  const values: number[] = []
  for (let i = 0; i < widths.length; ) {
    const len = values.length > 0 && widths.length - i === 7 ? 7 : 6
    const v = byPattern.get(widths.slice(i, i + len).join(""))
    if (v === undefined) throw new Error(`no pattern at ${i}`)
    values.push(v)
    i += len
  }
  expect(values[values.length - 1]).toBe(STOP)
  const data = values.slice(1, -2) // drop start, checksum, stop
  const checksum = values[values.length - 2]!
  expect([values[0]!, ...data].reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0) % 103).toBe(checksum)
  return String.fromCharCode(...data.map((v) => v + 32))
}

describe("bag labels (096, spec US10)", () => {
  for (const layout of LAYOUTS) {
    for (const zone of ZONES) {
      for (const c of [common, LONG]) {
        it(`${layout} · ${zone} · ${c.service}${c === LONG ? " · long name and address" : ""}: every block, in order, inside the label`, () => {
          const l = layoutLabel(doc({ zone }, c), layout)
          expect(l.blocks).toEqual(["header", "deliver-to", "zone", "bag", "barcode", "code", "footer"])
          const g = GEOMETRY[layout]
          for (const e of l.elements) {
            const b = box(e)
            expect(b.x0, `${e.kind} ${JSON.stringify("text" in e ? e.text : "")} left`).toBeGreaterThanOrEqual(g.padMm - 0.01)
            expect(b.x1, `${e.kind} ${JSON.stringify("text" in e ? e.text : "")} right`).toBeLessThanOrEqual(g.widthMm - g.padMm + 0.01)
            expect(b.y0, `${e.kind} top`).toBeGreaterThanOrEqual(g.padMm - 0.5)
            expect(b.y1, `${e.kind} bottom`).toBeLessThanOrEqual(g.heightMm - g.padMm + 0.5)
          }
          // Nothing overlaps the footer: the code block ends above it.
          const footerRule = l.elements.filter((e) => e.kind === "rect").at(-1)!
          const qr = l.elements.find((e) => e.kind === "qr")!
          expect(box(qr).y1).toBeLessThanOrEqual(box(footerRule).y0 + 0.01)
        })
      }
    }
  }

  it("says what a bag needs: service, recipient, postcode, zone, bag n of N, order, packed date, code, contact", () => {
    const words = textOf(layoutLabel(doc(), "a6").elements)
    expect(words).toEqual(expect.arrayContaining([
      "DELIVER TO", "Amelia Thompson", "14 Lydiard Street North", "Unit 3", "BALLARAT CENTRAL VIC", "3350", "AUSTRALIA · Ph 0412 345 678",
      "FROZEN", "Keep frozen · −18 °C or colder", "BAG", "2", "OF", "3", "ORDER", "EFY-ESDPKF", "PACKED", "21 Oct 2026",
      "EFY1:WTMZHX", "WTMZHX", "Scan, or type this code", LABEL_CONTACT,
    ]))
    // The header is the Effy mark only: no service badge on any bag.
    expect(words).not.toContain("EFFY DELIVERY")
    expect(textOf(layoutLabel(doc({}, { ...common, service: "courier" }), "a6").elements)).not.toContain("COURIER")
    expect(textOf(layoutLabel(doc({ zone: "chilled" }), "a6").elements)).toContain("Keep chilled · 5 °C or colder")
  })

  it("chilled and frozen bands are reversed; ambient is outlined", () => {
    const band = (zone: (typeof ZONES)[number]) =>
      layoutLabel(doc({ zone }), "a6").elements.find((e) => e.kind === "rect" && e.h > 5 && Math.abs(e.w - (101.6 - 8)) < 0.01)!
    expect(band("frozen")).toMatchObject({ fill: "#000" })
    expect(band("chilled")).toMatchObject({ fill: "#000" })
    expect(band("ambient")).toMatchObject({ fill: "none" })
  })

  it("long text shrinks, then wraps to two lines, then ends in an ellipsis — never clipped", () => {
    const name = fitText(LONG.recipientName, 93.6, [15, 13, 11, 9], 2, { bold: true })
    expect(name.sizePt).toBe(9)
    expect(name.lines.length).toBeLessThanOrEqual(2)
    for (const line of name.lines) expect(textWidthMm(line, 9, { bold: true })).toBeLessThanOrEqual(93.6)
    const huge = fitText("W".repeat(200), 50, [12, 9], 2)
    expect(huge.lines.at(-1)).toMatch(/…$/)
    for (const line of huge.lines) expect(textWidthMm(line, 9)).toBeLessThanOrEqual(50)
    expect(fitText("Short", 50, [15, 9]).sizePt).toBe(15)
  })

  it("the barcode's module never shrinks, and its height never goes under 16 mm", () => {
    const a = layoutLabel(doc({}, common), "a6").elements
    const b = layoutLabel(doc({}, LONG), "a6").elements
    const bars = (els: LabelElement[]) => els.find((e) => e.kind === "bars") as Extract<LabelElement, { kind: "bars" }>
    expect(bars(b).moduleMm).toBe(bars(a).moduleMm)
    expect(bars(b).h).toBeGreaterThanOrEqual(16)
  })

  for (const layout of LAYOUTS) {
    for (const dpi of [203, 300] as PrinterDpi[]) {
      it(`${layout} @ ${dpi} dpi: bars are whole printer dots, start on the dot grid, and decode to the token`, () => {
        const bars = layoutLabel(doc(), layout, dpi).elements.find((e) => e.kind === "bars") as Extract<LabelElement, { kind: "bars" }>
        const dot = 25.4 / dpi
        expect(Math.abs(bars.moduleMm / dot - Math.round(bars.moduleMm / dot))).toBeLessThan(1e-9)
        expect(bars.moduleMm).toBeGreaterThanOrEqual(0.25 - 1e-6)
        const startDots = (bars.x - 10 * bars.moduleMm) / dot
        expect(Math.abs(startDots - Math.round(startDots))).toBeLessThan(1e-6)
        expect(decode(bars.widths)).toBe("EFY1:WTMZHX")
      })
    }
  }

  it("is black and white only", () => {
    for (const layout of LAYOUTS) {
      const svg = renderLabelSvg(doc({ zone: "chilled" }, LONG), layout)
      const colours = new Set([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]))
      for (const c of colours) expect(["#000", "#fff", "none"]).toContain(c)
    }
  })

  /**
   * Hidden fulfilment and the 079 rule: no shop name, price, billing address or email but the approved
   * contact, and no window, day or estimate. The document type carries none of them — this proves a renderer
   * change cannot add one through a field that happens to be nearby. (The recipient's phone IS printed.)
   */
  it("never carries a shop name, a price, the billing address, another email, or a delivery window or day", () => {
    const leaky = {
      ...common, shopName: "Green Grocer", email: "ada@example.com", total: "$44.00", window: "4–6 pm",
      billingAddress: { line1: "99 Billing Road", city: "Geelong" },
    }
    for (const layout of LAYOUTS) {
      const svg = renderLabelSvg(doc({}, leaky as typeof common), layout)
      const text = [...svg.matchAll(/>([^<]+)</g)].map((m) => m[1]).join(" ")
      expect(text).not.toMatch(/Green Grocer|\$|Billing Road|Geelong|ada@|same.?day|standard|window|\d{1,2}(:\d{2})?\s?(am|pm)|\d\s?–\s?\d/i)
      expect(text.match(/[\w.+-]+@[\w.-]+/g) ?? []).toEqual(["hello@effyshopping.com"])
    }
  })

  it("draws the Effy wordmark from the brand package's own paths", () => {
    const brand = readFileSync(resolve(__dirname, "../../../../../../packages/brand/src/wordmark.svg"), "utf8")
    for (const d of WORDMARK_PATHS) expect(brand).toContain(`d="${d}"`)
  })

  it("prints one page per label, four per A4 page, and no blank page after the last", () => {
    const svgs = [1, 2, 3, 4, 5].map((n) => renderLabelSvg(doc({ seq: n, of: 5 }), "a6"))
    const a6 = printDocument(svgs, "a6")
    expect(a6.match(/class="page"/g)).toHaveLength(5)
    expect(a6).toContain(".page:last-child{break-after:auto")
    expect(a6).toContain("size: 4in 6in; margin: 0")
    const a4 = printDocument(svgs, "a4x4")
    expect(a4.match(/class="page sheet"/g)).toHaveLength(2)
    expect(a4).toContain("size: A4 portrait; margin: 0")
    expect(printDocument([svgs[0]!], "roll62")).toContain("size: 62mm 100mm; margin: 0")
  })
})

describe("direct thermal (ZPL) — 096, R9", () => {
  it("thresholds to one bit per pixel, MSB first, transparent as paper", () => {
    // 9 × 1: black, white, black, transparent, black×5 → 1010 1111 | 1000 0000
    const px = (r: number, a = 255) => [r, r, r, a]
    const rgba = new Uint8ClampedArray([...px(0), ...px(255), ...px(0), ...px(0, 0), ...px(0), ...px(0), ...px(0), ...px(0), ...px(0)])
    expect([...toMonochrome(rgba, 9, 1)]).toEqual([0b10101111, 0b10000000])
  })

  it("CRC-16/XMODEM matches the standard check value", () => {
    expect(crc16("123456789")).toBe("31C3")
  })

  it("wraps a compressed bitmap as one ^GFA field sized for the label", async () => {
    const bits = new Uint8Array(2 * 3).fill(0xff)
    const zpl = await bitmapToZpl(bits, 16, 3)
    expect(zpl).toMatch(/^\^XA\^PW16\^LL3\^FO0,0\^GFA,6,6,2,:Z64:[A-Za-z0-9+/=]+:[0-9A-F]{4}\^FS\^XZ$/)
  })

  it("labels are sized for the printer in whole dots", () => {
    expect(labelDots("a6", 203)).toEqual({ w: 812, h: 1218 })
    expect(labelDots("roll62" as LabelLayout, 300)).toEqual({ w: 732, h: 1181 })
  })
})
