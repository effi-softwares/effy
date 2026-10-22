/* ⚠ THE HEX VALUES IN THIS FILE ARE DELIBERATE AND CANNOT BE TOKENS — the same exemption as
 * `pickList.ts`. A label is a document for a thermal or laser printer: it has no access to the console's
 * stylesheet, and the theme's colours are for screens. It is BLACK AND WHITE ONLY (FR-012b).
 */

/**
 * Bag labels (096, spec US10) — ONE renderer: a pure function from a label document to an SVG string.
 * The browser print, the console's preview and the direct-thermal (ZPL) path all draw THIS SVG, so the
 * preview is what prints (research R9). The design: `specs/096-parcel-labels-scanning/label-redesign.md`.
 *
 * Fixed blocks, top to bottom, never reordered or omitted:
 *   1 header (Effy mark · EFFY DELIVERY / COURIER, reversed)   2 deliver to (postcode largest)
 *   3 temperature band (chilled/frozen reversed)                4 BAG n OF N · order · packed date
 *   5 Code 128 of EFY1:<code>, full width                       6 QR · the code grouped for reading aloud
 *   7 footer: the approved customer contact
 *
 * ⚠ NEVER ON A LABEL: the shop's name (hidden fulfilment), any price, the customer's email, the billing
 * address, or any delivery window, day or estimate (a shop is told who takes a package away, 079).
 * The recipient's name, the full SHIPPING address and the recipient's phone ARE on it (spec
 * Clarifications, reversing 089; the phone added by the operator 2026-10-22): a bag separated from its run
 * must still be deliverable, and the shop already sees all three.
 *
 * ⚠ BARS ON THE PRINTER'S DOT GRID. A bar width between dots is rounded per bar by the printer, which
 * skews the ratios Code 128 depends on (research-08 W4). Each layout's module is a whole number of dots
 * at the chosen dpi, and the symbol starts on a dot boundary.
 *
 * ⚠ Everything interpolated is escaped; this builds raw markup.
 */
import qrcode from "qrcode-generator"

import { packageToken, WORDMARK_PATHS, WORDMARK_VIEWBOX, type ParcelZone, type ShopLabelCommonDTO } from "@effy/shared-types"

import { code128BWidths } from "./code128"
import { fitText, PT_TO_MM, textWidthMm } from "./fit"

export type LabelLayout = "a6" | "a4x4" | "roll62"
export type PrinterDpi = 203 | 300

export const LABEL_LAYOUTS: ReadonlyArray<{ id: LabelLayout; name: string }> = [
  { id: "a6", name: "4 × 6 in / A6 label (thermal)" },
  { id: "a4x4", name: "A4 sheet, 4 labels (office printer)" },
  { id: "roll62", name: "62 mm roll (compact)" },
]

/** What one bag's label needs — narrower than the order detail on purpose: nothing else can leak onto it. */
export interface LabelDocument {
  common: ShopLabelCommonDTO
  parcel: { code: string; seq: number; of: number; zone: ParcelZone }
}

interface Geometry {
  widthMm: number
  heightMm: number
  padMm: number
  /** Scale of every type size against the A6 design. */
  scale: number
  /** The smallest any text may become (pt). */
  floorPt: number
  /** Bar module in printer dots, per dpi. */
  moduleDots: Record<PrinterDpi, number>
  barHeightMm: number
  qrMm: number
}

export const GEOMETRY: Record<LabelLayout, Geometry> = {
  a6: { widthMm: 101.6, heightMm: 152.4, padMm: 4, scale: 1, floorPt: 8, moduleDots: { 203: 4, 300: 6 }, barHeightMm: 22, qrMm: 24 },
  // One quarter of A4 portrait: 105 × 148.5 mm.
  a4x4: { widthMm: 105, heightMm: 148.5, padMm: 4, scale: 1, floorPt: 8, moduleDots: { 203: 4, 300: 6 }, barHeightMm: 22, qrMm: 24 },
  roll62: { widthMm: 62, heightMm: 100, padMm: 2.5, scale: 0.62, floorPt: 5.5, moduleDots: { 203: 2, 300: 3 }, barHeightMm: 13, qrMm: 15 },
}

const ZONE_LINE: Record<ParcelZone, string> = {
  frozen: "Keep frozen · −18 °C or colder",
  chilled: "Keep chilled · 5 °C or colder",
  ambient: "Store in a cool, dry place",
}

export const LABEL_CONTACT = "Questions? hello@effyshopping.com"

export { WORDMARK_PATHS, WORDMARK_VIEWBOX } from "@effy/shared-types"

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** "21 Oct 2026" from an ISO date (yyyy-mm-dd), in the label's own words. */
export function packedWords(iso: string | null, today: Date = new Date()): string {
  const d = iso ? new Date(`${iso}T00:00:00Z`) : new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]
  return `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}`
}

/** "AUSTRALIA" for the stored `AU`; any other value as written, upper-cased. */
export function countryWords(country: string | null | undefined): string | null {
  const c = country?.trim()
  if (!c) return null
  return c.toUpperCase() === "AU" ? "AUSTRALIA" : c.toUpperCase()
}

// ── The layout: every element as a box in mm, so tests can prove nothing leaves the label ──────────────

type Text = { kind: "text"; x: number; y: number; text: string; sizePt: number; bold?: boolean; mono?: boolean; anchor?: "start" | "end" | "middle"; fill?: "#000" | "#fff"; spacing?: number }
type Rect = { kind: "rect"; x: number; y: number; w: number; h: number; fill: "#000" | "#fff" | "none"; stroke?: number }
type Bars = { kind: "bars"; x: number; y: number; moduleMm: number; h: number; widths: number[] }
type Qr = { kind: "qr"; x: number; y: number; size: number; token: string }
type Mark = { kind: "mark"; x: number; y: number; h: number }
export type LabelElement = Text | Rect | Bars | Qr | Mark

export interface LabelLayoutResult {
  widthMm: number
  heightMm: number
  elements: LabelElement[]
  /** The block each element belongs to, in order — for the "every block, in order" tests. */
  blocks: string[]
}

/**
 * Lay out one label. Pure and deterministic; `today` fills the packed date before the first print.
 *
 * ⚠ IT TIGHTENS ITSELF RATHER THAN OVERFLOW. A long name and address (or the A4 quarter, shorter than
 * 4×6) can push the code block into the footer; the layout is tried at increasing `squeeze` — smaller gaps,
 * then a smaller QR, then shorter bars (never under 16 mm, never narrower) — until everything fits.
 */
export function layoutLabel(doc: LabelDocument, layout: LabelLayout, dpi: PrinterDpi = 203, today?: Date): LabelLayoutResult {
  let out = layoutAt(doc, layout, dpi, today, 0)
  for (let squeeze = 1; squeeze <= 4 && overflows(out); squeeze++) out = layoutAt(doc, layout, dpi, today, squeeze)
  return out
}

/** True when the code block runs into the footer. */
function overflows(l: LabelLayoutResult): boolean {
  const qr = l.elements.find((e) => e.kind === "qr") as Qr
  const footerRule = l.elements.filter((e) => e.kind === "rect").at(-1) as Rect
  const hint = l.elements.filter((e) => e.kind === "text").at(-2) as Text
  return qr.y + qr.size > footerRule.y - 0.2 || hint.y > footerRule.y - 0.2
}

function layoutAt(doc: LabelDocument, layout: LabelLayout, dpi: PrinterDpi, today: Date | undefined, squeeze: number): LabelLayoutResult {
  const base = GEOMETRY[layout]
  const g = {
    ...base,
    qrMm: Math.max(base.qrMm * (1 - 0.1 * squeeze), base.qrMm * 0.7),
    barHeightMm: Math.max(base.barHeightMm * (1 - 0.1 * Math.max(0, squeeze - 1)), Math.min(16, base.barHeightMm)),
  }
  const k = g.scale
  /** Vertical breathing room, tightened step by step. */
  const v = (n: number) => n * k * (1 - 0.2 * Math.min(squeeze, 3))
  const pt = (n: number) => Math.max(n * k, g.floorPt)
  const asc = (sizePt: number) => sizePt * PT_TO_MM * 0.78 // cap height-ish: baseline offset below a line top
  const lineH = (sizePt: number) => sizePt * PT_TO_MM * 1.15
  const x0 = g.padMm
  const x1 = g.widthMm - g.padMm
  const W = x1 - x0
  const els: LabelElement[] = []
  const blocks: string[] = []
  const rule = (y: number, weight = 0.6) => els.push({ kind: "rect", x: x0, y, w: W, h: weight * Math.max(k, 0.7), fill: "#000" })
  let y = g.padMm

  // 1 — header
  blocks.push("header")
  const headH = 8 * k
  els.push({ kind: "mark", x: x0, y: y + headH * 0.1, h: headH * 0.8 })
  // The header is the Effy mark only (operator, 2026-10-22): no service badge for Effy or courier bags.
  y += headH + v(2)
  rule(y)
  y += 0.6 * k + v(2)

  // 2 — deliver to
  blocks.push("deliver-to")
  const capPt = pt(7)
  els.push({ kind: "text", x: x0, y: y + asc(capPt), text: "DELIVER TO", sizePt: capPt, bold: true, spacing: 0.12 })
  y += lineH(capPt) + v(0.6)
  const name = fitText(doc.common.recipientName, W, [15, 13, 11, 9].map(pt), 2, { bold: true })
  for (const line of name.lines) {
    els.push({ kind: "text", x: x0, y: y + asc(name.sizePt), text: line, sizePt: name.sizePt, bold: true })
    y += lineH(name.sizePt)
  }
  // Every part of the SHIPPING address, each on its own line (operator, 2026-10-22).
  for (const part of [doc.common.line1, doc.common.line2]) {
    if (!part?.trim()) continue
    const fit = fitText(part.trim(), W, [11, 10, 9, 8].map(pt), 2)
    for (const line of fit.lines) {
      els.push({ kind: "text", x: x0, y: y + asc(fit.sizePt), text: line, sizePt: fit.sizePt })
      y += lineH(fit.sizePt)
    }
  }
  y += v(1.5)
  const pcPt = pt(22)
  const pc = doc.common.postcode
  const pcW = textWidthMm(pc, pcPt, { bold: true })
  const place = [doc.common.suburb.toUpperCase(), doc.common.state.toUpperCase()].filter(Boolean).join(" ")
  const placeFit = fitText(place, W - pcW - 3 * k, [12, 11, 10, 9].map(pt), 1, { bold: true })
  const rowH = lineH(pcPt) * 0.95
  els.push({ kind: "text", x: x1, y: y + asc(pcPt), text: pc, sizePt: pcPt, bold: true, anchor: "end" })
  if (placeFit.lines[0]) els.push({ kind: "text", x: x0, y: y + asc(pcPt), text: placeFit.lines[0], sizePt: placeFit.sizePt, bold: true })
  y += rowH
  // The country, and the phone the driver calls from the door.
  const country = countryWords(doc.common.country)
  const contact = [country, doc.common.phone?.trim() ? `Ph ${doc.common.phone.trim()}` : null].filter(Boolean).join(" · ")
  if (contact) {
    const fit = fitText(contact, W, [10, 9, 8].map(pt), 1, { bold: true })
    els.push({ kind: "text", x: x0, y: y + asc(fit.sizePt), text: fit.lines[0]!, sizePt: fit.sizePt, bold: true })
    y += lineH(fit.sizePt)
  }
  y += v(1.5)
  rule(y)
  y += 0.6 * k + v(2)

  // 3 — temperature band
  blocks.push("zone")
  const bandH = 8 * k
  const reversed = doc.parcel.zone !== "ambient"
  els.push(reversed
    ? { kind: "rect", x: x0, y, w: W, h: bandH, fill: "#000" }
    : { kind: "rect", x: x0, y, w: W, h: bandH, fill: "none", stroke: 0.6 * Math.max(k, 0.7) })
  const zonePt = pt(13)
  const ink = reversed ? "#fff" : "#000"
  const zoneWord = doc.parcel.zone.toUpperCase()
  els.push({ kind: "text", x: x0 + 2.5 * k, y: y + bandH / 2 + asc(zonePt) / 2, text: zoneWord, sizePt: zonePt, bold: true, fill: ink, spacing: 0.08 })
  const zoneLineRoom = W - 5 * k - textWidthMm(zoneWord, zonePt, { bold: true }) - 3 * k
  const zl = fitText(ZONE_LINE[doc.parcel.zone], zoneLineRoom, [9, 8, 7, 6, 5.5].map(pt), 2, { bold: true })
  const zlTop = y + bandH / 2 - (zl.lines.length * lineH(zl.sizePt)) / 2
  zl.lines.forEach((line, i) =>
    els.push({ kind: "text", x: x1 - 2.5 * k, y: zlTop + i * lineH(zl.sizePt) + asc(zl.sizePt), text: line, sizePt: zl.sizePt, bold: true, anchor: "end", fill: ink }))
  y += bandH + v(2.5)

  // 4 — bag n of N, order, packed date
  blocks.push("bag")
  const bigPt = pt(22)
  const ofPt = pt(9)
  els.push({ kind: "text", x: x0, y: y + asc(capPt), text: "BAG", sizePt: capPt, bold: true, spacing: 0.12 })
  const bagTop = y + lineH(capPt) + 0.5 * k
  const nStr = String(doc.parcel.seq)
  const nW = textWidthMm(nStr, bigPt, { bold: true })
  // ⚠ Positioned, not spaced: SVG collapses the spaces in " OF ", which ran "2OF 3" together.
  const gap = 1.6 * k
  const ofW = textWidthMm("OF", ofPt, { bold: true })
  els.push({ kind: "text", x: x0, y: bagTop + asc(bigPt), text: nStr, sizePt: bigPt, bold: true })
  els.push({ kind: "text", x: x0 + nW + gap, y: bagTop + asc(bigPt), text: "OF", sizePt: ofPt, bold: true })
  els.push({ kind: "text", x: x0 + nW + gap + ofW + gap, y: bagTop + asc(bigPt), text: String(doc.parcel.of), sizePt: bigPt, bold: true })
  const metaPt = pt(10)
  const orderPt = pt(11)
  els.push({ kind: "text", x: x1, y: y + asc(capPt), text: "ORDER", sizePt: capPt, bold: true, anchor: "end", spacing: 0.12 })
  els.push({ kind: "text", x: x1, y: y + lineH(capPt) + asc(orderPt), text: doc.common.orderNumber, sizePt: orderPt, bold: true, mono: true, anchor: "end" })
  const packedTop = y + lineH(capPt) + lineH(orderPt) + 1.2 * k
  els.push({ kind: "text", x: x1, y: packedTop + asc(capPt), text: "PACKED", sizePt: capPt, bold: true, anchor: "end", spacing: 0.12 })
  els.push({ kind: "text", x: x1, y: packedTop + lineH(capPt) + asc(metaPt), text: packedWords(doc.common.packedOn, today), sizePt: metaPt, bold: true, anchor: "end" })
  y = Math.max(bagTop + lineH(bigPt) * 0.9, packedTop + lineH(capPt) + lineH(metaPt)) + v(1.5)
  rule(y)
  y += 0.6 * k + v(2)

  // 5 — the barcode, on the dot grid
  blocks.push("barcode")
  const token = packageToken(doc.parcel.code)
  const dot = 25.4 / dpi
  const moduleMm = g.moduleDots[dpi] * dot
  const widths = code128BWidths(token)
  const quiet = 10
  const totalModules = widths.reduce((a, b) => a + b, 0) + quiet * 2
  const symbolW = totalModules * moduleMm
  const bx = Math.round((x0 + (W - symbolW) / 2) / dot) * dot
  els.push({ kind: "bars", x: bx + quiet * moduleMm, y, moduleMm, h: g.barHeightMm, widths })
  y += g.barHeightMm + v(1)
  const hrPt = pt(9)
  els.push({ kind: "text", x: x0 + W / 2, y: y + asc(hrPt), text: token, sizePt: hrPt, mono: true, anchor: "middle", spacing: 0.15 })
  y += lineH(hrPt) + v(1.5)
  rule(y)
  y += 0.6 * k + v(2)

  // 6 — QR and the code for reading aloud
  blocks.push("code")
  els.push({ kind: "qr", x: x0, y, size: g.qrMm, token })
  const codePt = pt(16)
  const codeX = x0 + g.qrMm + 3 * k
  els.push({ kind: "text", x: codeX, y: y + g.qrMm / 2 + asc(codePt) / 2 - 1 * k, text: doc.parcel.code, sizePt: codePt, bold: true, mono: true, spacing: 0.08 })
  const hintPt = pt(9)
  els.push({ kind: "text", x: codeX, y: y + g.qrMm / 2 + asc(codePt) / 2 + lineH(hintPt), text: "Scan, or type this code", sizePt: hintPt })

  // 7 — footer, anchored to the bottom
  blocks.push("footer")
  const footPt = pt(8)
  const footY = g.heightMm - g.padMm - lineH(footPt)
  els.push({ kind: "rect", x: x0, y: footY - 1 * k, w: W, h: 0.3 * Math.max(k, 0.7), fill: "#000" })
  els.push({ kind: "text", x: x0 + W / 2, y: footY + asc(footPt), text: LABEL_CONTACT, sizePt: footPt, anchor: "middle" })

  return { widthMm: g.widthMm, heightMm: g.heightMm, elements: els, blocks }
}

// ── SVG ──────────────────────────────────────────────────────────────────────────────────────────────

const FONT = "Helvetica, Arial, sans-serif"
const MONO = "Menlo, Consolas, 'Courier New', monospace"

function qrCells(token: string): { n: number; cells: string } {
  // Level M recovers from ~15% damage; at 11 characters the symbol stays at version 1–2.
  const qr = qrcode(0, "M")
  qr.addData(token)
  qr.make()
  const n = qr.getModuleCount()
  const cells: string[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c + 2} ${r + 2}h1v1h-1z`)
  return { n: n + 4, cells: cells.join("") }
}

function elementSvg(e: LabelElement): string {
  switch (e.kind) {
    case "rect":
      return e.fill === "none"
        ? `<rect x="${f(e.x)}" y="${f(e.y)}" width="${f(e.w)}" height="${f(e.h)}" fill="none" stroke="#000" stroke-width="${f(e.stroke ?? 0.6)}"/>`
        : `<rect x="${f(e.x)}" y="${f(e.y)}" width="${f(e.w)}" height="${f(e.h)}" fill="${e.fill}"/>`
    case "text": {
      const anchor = e.anchor && e.anchor !== "start" ? ` text-anchor="${e.anchor}"` : ""
      const spacing = e.spacing ? ` letter-spacing="${f(e.spacing * e.sizePt * PT_TO_MM)}"` : ""
      return `<text x="${f(e.x)}" y="${f(e.y)}" font-family="${e.mono ? MONO : FONT}" font-size="${f(e.sizePt * PT_TO_MM)}" font-weight="${e.bold ? 700 : 400}" fill="${e.fill ?? "#000"}"${anchor}${spacing}>${esc(e.text)}</text>`
    }
    case "bars": {
      let x = e.x
      const rects: string[] = []
      e.widths.forEach((w, i) => {
        if (i % 2 === 0) rects.push(`<rect x="${f(x)}" y="${f(e.y)}" width="${f(w * e.moduleMm)}" height="${f(e.h)}"/>`)
        x += w * e.moduleMm
      })
      return `<g fill="#000" shape-rendering="crispEdges">${rects.join("")}</g>`
    }
    case "qr": {
      const { n, cells } = qrCells(e.token)
      return `<svg x="${f(e.x)}" y="${f(e.y)}" width="${f(e.size)}" height="${f(e.size)}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${cells}" fill="#000"/></svg>`
    }
    case "mark": {
      const w = (e.h * WORDMARK_VIEWBOX.w) / WORDMARK_VIEWBOX.h
      return `<svg x="${f(e.x)}" y="${f(e.y)}" width="${f(w)}" height="${f(e.h)}" viewBox="0 0 ${WORDMARK_VIEWBOX.w} ${WORDMARK_VIEWBOX.h}">${WORDMARK_PATHS.map((d) => `<path d="${d}" fill="#000"/>`).join("")}</svg>`
    }
  }
}

const f = (n: number): string => (Math.round(n * 1000) / 1000).toString()

/** One label as a standalone SVG sized in mm (its viewBox is in mm too). */
export function renderLabelSvg(doc: LabelDocument, layout: LabelLayout, dpi: PrinterDpi = 203, today?: Date): string {
  const l = layoutLabel(doc, layout, dpi, today)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l.widthMm}mm" height="${l.heightMm}mm" viewBox="0 0 ${l.widthMm} ${l.heightMm}">` +
    `<rect width="${l.widthMm}" height="${l.heightMm}" fill="#fff"/>` +
    l.elements.map(elementSvg).join("") +
    `</svg>`
  )
}
