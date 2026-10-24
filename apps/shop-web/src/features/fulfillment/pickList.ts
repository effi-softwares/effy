/* The hex values in this file are deliberate and cannot be tokens.
 *
 * A pick list is written into a new window as a standalone HTML document and sent to a printer. That
 * document has no access to the console's stylesheet, so `var(--border)` would resolve to nothing and
 * the rules would vanish — and even if it did, the theme's colours are chosen for a screen: a navy
 * dark-mode ground printed on paper is a solid black page. Print output is its own medium, and these
 * greys (#ddd rules, #666 secondary text) are chosen for toner, not for the palette.
 *
 * This is the one file in the console exempt from the no-raw-hex rule, and the exemption is written
 * here rather than in an allow-list nobody reads while editing.
 */

/**
 * The pick list as a printable document: one renderer for the order detail's print and Today's "Print pick
 * lists" (one per waiting order, one window). No money on a pick list. Its own window keeps the chrome off
 * the paper, and everything interpolated is escaped (product names are operator text).
 */
import { STORAGE_CLASSES, STORAGE_CLASS_WORDS, type DeliveredBy, type StorageClass } from "@effy/shared-types"

import { deliveredByText, formatWhen } from "./orderConsole"
import { lineCodes } from "./codes";

/** What a printed page needs. Deliberately narrower than `OrderDetail` so the batch read can satisfy it. */
export interface PickListDocument {
  orderNumber: string
  recipientName: string
  /** Who collects it: what the sheet says, in the two words every shop screen uses. */
  deliveredBy: DeliveredBy
  /** ISO instant, or null when the promise is unknown (the batch read carries the paid time). */
  readyBy: string | null
  lines: Array<{
    name: string
    variantLabel?: string | null
    variantCode?: string | null
    sku: string | null
    quantity: number
    /** Groups the sheet Ambient → Chilled → Frozen, cold last (099). */
    storageClass: StorageClass
  }>
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/**
 * One document's markup — the lines in walking order under Ambient, Chilled and Frozen headings, each
 * with a checkbox column, the line (with its size), its codes and the quantity to pick.
 */
export function renderPickListPage(doc: PickListDocument): string {
  const row = (l: PickListDocument["lines"][number]) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #ddd">☐</td><td style="padding:8px;border-bottom:1px solid #ddd">${esc(l.variantLabel ? `${l.name} — ${l.variantLabel}` : l.name)}</td><td style="padding:8px;border-bottom:1px solid #ddd;font-family:monospace">${esc(lineCodes(l.variantCode, l.sku))}</td><td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right">${l.quantity}</td></tr>`
  const groups = STORAGE_CLASSES.map((zone) => ({ zone, lines: doc.lines.filter((l) => (l.storageClass ?? "ambient") === zone) })).filter(
    (g) => g.lines.length > 0,
  )
  const rows = groups
    .map(
      (g) =>
        `<tr><th colspan="4" style="text-align:left;padding:14px 0 4px;font-size:12px;letter-spacing:.04em">${esc(STORAGE_CLASS_WORDS[g.zone].toUpperCase())}</th></tr>` +
        g.lines.map(row).join(""),
    )
    .join("")
  const ready = doc.readyBy ? ` · ready by ${esc(formatWhen(doc.readyBy))}` : ""
  return (
    `<section style="page-break-after:always">` +
    `<h1 style="font-size:18px;margin:0 0 4px">Pick list · <span style="font-family:monospace">${esc(doc.orderNumber)}</span></h1>` +
    `<p style="color:#666;margin:0 0 16px">${esc(doc.recipientName)} · ${esc(deliveredByText(doc.deliveredBy))}${ready}</p>` +
    `<table style="width:100%;border-collapse:collapse">${rows}</table>` +
    `</section>`
  )
}

/**
 * Open one print window containing every document, newest page break between them.
 *
 * Returns how many pages were sent, so the caller can say so truthfully — and returns 0 when the
 * browser blocked the window, because "4 pick lists sent to printer" over a popup that never opened
 * is the kind of confident lie a toast should never tell.
 */
export function printPickLists(docs: readonly PickListDocument[], title = "Pick lists"): number {
  if (docs.length === 0) return 0
  const w = window.open("", "_blank", "width=720,height=900")
  if (!w) return 0
  w.document.write(
    `<!doctype html><title>${esc(title)}</title><body style="font:14px system-ui;margin:32px">` +
      docs.map(renderPickListPage).join("") +
      `</body>`,
  )
  w.document.close()
  w.focus()
  w.print()
  return docs.length
}
