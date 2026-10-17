/* ⚠ THE HEX VALUES IN THIS FILE ARE DELIBERATE AND CANNOT BE TOKENS — the same exemption as
 * `pickList.ts`. A label is a standalone document written into its own window and sent to a thermal or
 * laser printer: it has no access to the console's stylesheet, and the theme's colours are for screens.
 */

/**
 * Package labels (089) — one renderer, three layouts.
 *
 * A label carries the package's code three ways — a Code 128 barcode, a QR code and in large type (what a
 * person reads or types) — all for the same value, `EFY1:<code>`. Beside it: the order number and
 * "package n of m", who takes it away, the destination suburb and a cold mark.
 *
 * ⚠ THE BARCODE IS THE MAIN ELEMENT (operator direction, 2026-10-17): shops and the hub may use handheld
 * barcode scanners, as delivery services do, and the driver app's camera reads Code 128 too. So it is
 * first on the label and nearly the label's full width — each layout's bar width (`barModuleMm`) is set
 * so the 176-module symbol (11 characters + start, check, stop and the two quiet zones) fills the
 * printable width; ≥ 0.3 mm everywhere, which a phone camera reads as well as a scanner. The QR is
 * secondary: what a phone reads at an angle or off a crumpled bag.
 *
 * ⚠ NEVER ON A LABEL: the shop's name (hidden fulfilment — the customer receives this bag), the
 * customer's name or street (the driver has the address in the app), any price — and no delivery
 * window, day or estimate (a shop is told who takes a package away and nothing else, 079).
 *
 * ⚠ Everything interpolated is escaped; this builds raw HTML.
 */
import qrcode from "qrcode-generator"

import { packageToken, type DeliveredBy, type ShopPackageLabelDTO } from "@effy/shared-types"

import { code128BSvg } from "./code128"

export type LabelLayout = "roll62" | "label4x6" | "a4sheet"

export const LABEL_LAYOUTS: ReadonlyArray<{ id: LabelLayout; name: string }> = [
  { id: "roll62", name: "62 mm roll" },
  { id: "label4x6", name: "4 × 6 in label" },
  { id: "a4sheet", name: "A4 sticker sheet (21 per page)" },
]

/** What one label needs — narrower than the order detail on purpose: nothing else can leak onto it. */
export interface LabelDocument {
  orderNumber: string
  deliveredBy: DeliveredBy
  label: ShopPackageLabelDTO
}

interface Geometry {
  /** The label's own size. */
  widthMm: number
  heightMm: number
  /** The padding inside the label; the barcode fills the width between it. */
  padMm: number
  qrMm: number
  codePt: number
  textPt: number
  deliversPt: number
  barModuleMm: number
  barHeightMm: number
  /** The page around it; the A4 sheet is a grid of 3 × 7 labels. */
  page: string
  perRow: number
}

const GEOMETRY: Record<LabelLayout, Geometry> = {
  // 176 modules × 0.31 = 54.6 mm of 56 mm printable.
  roll62: {
    widthMm: 62, heightMm: 100, padMm: 3, qrMm: 26, codePt: 22, textPt: 10, deliversPt: 18,
    barModuleMm: 0.31, barHeightMm: 24, page: "size: 62mm 100mm; margin: 0", perRow: 1,
  },
  // 176 × 0.53 = 93.3 mm of 95.6 mm.
  label4x6: {
    widthMm: 101.6, heightMm: 152.4, padMm: 3, qrMm: 38, codePt: 36, textPt: 14, deliversPt: 28,
    barModuleMm: 0.53, barHeightMm: 34, page: "size: 4in 6in; margin: 0", perRow: 1,
  },
  // The common 21-up sheet: 63.5 × 38.1 mm labels, 7.2 mm side and 15.15 mm top margins.
  // 176 × 0.34 = 59.8 mm of 60.5 mm — it was 0.19 mm, too fine for a phone camera.
  a4sheet: {
    widthMm: 63.5, heightMm: 38.1, padMm: 1.5, qrMm: 15, codePt: 11, textPt: 6, deliversPt: 8,
    barModuleMm: 0.34, barHeightMm: 11, page: "size: A4; margin: 15.15mm 7.2mm", perRow: 3,
  },
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** EFFY or COURIER — who takes the package away, in the label's own two words. */
export function deliversWord(d: DeliveredBy): "EFFY" | "COURIER" {
  return d === "courier" ? "COURIER" : "EFFY"
}

function qrSvg(token: string, sizeMm: number): string {
  // Level M recovers from ~15% damage; at 11 characters the symbol stays at version 1–2, so the
  // modules are large enough for a phone at arm's length at every layout.
  const qr = qrcode(0, "M")
  qr.addData(token)
  qr.make()
  const n = qr.getModuleCount()
  const quiet = 2
  const total = n + quiet * 2
  const cells: string[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) cells.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`)
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeMm}mm" height="${sizeMm}mm" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><g fill="#000">${cells.join("")}</g></svg>`
  )
}

/** One label's markup at `layout`. */
export function renderLabel(doc: LabelDocument, layout: LabelLayout): string {
  const g = GEOMETRY[layout]
  const token = packageToken(doc.label.packageCode)
  const cold = doc.label.cold
    ? `<span style="display:inline-block;border:1.5px solid #000;padding:0 4px;font-weight:700">${doc.label.cold === "frozen" ? "FROZEN" : "CHILLED"}</span>`
    : ""
  const position = `package ${doc.label.position} of ${doc.label.packageCount}`
  const gap = layout === "a4sheet" ? 1 : 3
  return (
    `<div class="label" style="width:${g.widthMm}mm;height:${g.heightMm}mm;box-sizing:border-box;padding:${g.padMm}mm;` +
    `display:flex;flex-direction:column;gap:${gap}mm;overflow:hidden;font:${g.textPt}pt system-ui,sans-serif;color:#000">` +
    // The barcode first and full width: what a handheld scanner, and the driver's camera, aims at.
    `<div data-part="barcode" style="display:flex;justify-content:center">${code128BSvg(token, { moduleMm: g.barModuleMm, heightMm: g.barHeightMm })}</div>` +
    `<div style="display:flex;gap:${gap}mm;align-items:flex-start">` +
    `<div data-part="qr">${qrSvg(token, g.qrMm)}</div>` +
    `<div style="min-width:0">` +
    `<div data-part="code" style="font:700 ${g.codePt}pt ui-monospace,Menlo,monospace;letter-spacing:0.05em">${esc(doc.label.packageCode)}</div>` +
    `<div data-part="delivers" style="font-weight:800;font-size:${g.deliversPt}pt">${deliversWord(doc.deliveredBy)}</div>` +
    `<div data-part="order">${esc(doc.orderNumber)} · ${position}</div>` +
    (doc.label.suburb ? `<div data-part="suburb">${esc(doc.label.suburb)}</div>` : "") +
    (cold ? `<div data-part="cold" style="margin-top:1mm">${cold}</div>` : "") +
    `</div></div>` +
    `</div>`
  )
}

/** The whole printable document: `copies` of each label, laid out for `layout`. */
export function renderLabelDocument(docs: readonly LabelDocument[], layout: LabelLayout, copies = 1): string {
  const g = GEOMETRY[layout]
  const labels = docs.flatMap((d) => Array.from({ length: Math.max(1, copies) }, () => renderLabel(d, layout)))
  const body =
    g.perRow > 1
      ? `<div style="display:grid;grid-template-columns:repeat(${g.perRow},${g.widthMm}mm);grid-auto-rows:${g.heightMm}mm;column-gap:2.5mm">${labels.join("")}</div>`
      : labels.map((l) => `<div style="page-break-after:always">${l}</div>`).join("")
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Package labels</title>` +
    `<style>@page{${g.page}}html,body{margin:0;padding:0;background:#fff}` +
    `.label{break-inside:avoid}</style></head><body>${body}</body></html>`
  )
}

/**
 * Open the print window. Returns how many labels were sent — ⚠ 0 when the browser blocked the window,
 * so the caller never claims labels were printed when nothing opened (the pick list's rule).
 */
export function printLabels(docs: readonly LabelDocument[], layout: LabelLayout, copies = 1): number {
  if (docs.length === 0) return 0
  const w = window.open("", "_blank", "width=720,height=900")
  if (!w) return 0
  w.document.write(renderLabelDocument(docs, layout, copies))
  w.document.close()
  w.focus()
  w.print()
  return docs.length * Math.max(1, copies)
}
