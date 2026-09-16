/* ⚠ THE HEX VALUES IN THIS FILE ARE DELIBERATE AND CANNOT BE TOKENS.
 *
 * A pick list is written into a NEW WINDOW as a standalone HTML document and sent to a printer. That
 * document has no access to the console's stylesheet, so `var(--border)` would resolve to nothing and
 * the rules would vanish — and even if it did, the theme's colours are chosen for a screen: a navy
 * dark-mode ground printed on paper is a solid black page. Print output is its own medium, and these
 * greys (#ddd rules, #666 secondary text) are chosen for toner, not for the palette.
 *
 * This is the one file in the console exempt from the no-raw-hex rule, and the exemption is written
 * here rather than in an allow-list nobody reads while editing.
 */

/**
 * The pick list, as a printable document — ONE renderer, two call sites (058 T010).
 *
 * ⚠ EXTRACTED, NOT COPIED. The order detail prints one list; Today's "Print pick lists" prints one
 * per waiting order in a single window. Two renderers would drift the moment either changed, and the
 * drift would reach paper rather than a screen — a picker walking the shelves with a sheet that no
 * longer matches the one their colleague printed. So the markup lives here and both callers pass
 * documents into it.
 *
 * ⚠ NO MONEY ON A PICK LIST (020's rule for the pick document). The console shows an order's money
 * on screen (057 A3); a sheet that goes to the shelves does not need it and should not carry it.
 *
 * ⚠ It writes into its OWN window so the console's chrome never reaches the printer, and everything
 * interpolated is escaped — a product name is operator-entered text, and this is the one place in
 * the app that builds raw HTML.
 */
import { formatWhen, methodText } from "./orderConsole"

/** What a printed page needs. Deliberately narrower than `OrderDetail` so the batch read can satisfy it. */
export interface PickListDocument {
  orderNumber: string
  recipientName: string
  deliveryMethod: "same_day" | "standard" | null
  /** ISO instant, or null when the promise is unknown (the batch read carries the paid time). */
  readyBy: string | null
  lines: Array<{ name: string; sku: string | null; quantity: number }>
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/** One document's markup — a checkbox column, the line, its SKU and the quantity to pick. */
export function renderPickListPage(doc: PickListDocument): string {
  const rows = doc.lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #ddd">☐</td><td style="padding:8px;border-bottom:1px solid #ddd">${esc(l.name)}</td><td style="padding:8px;border-bottom:1px solid #ddd;font-family:monospace">${esc(l.sku ?? "")}</td><td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right">${l.quantity}</td></tr>`,
    )
    .join("")
  const ready = doc.readyBy ? ` · ready by ${esc(formatWhen(doc.readyBy))}` : ""
  return (
    `<section style="page-break-after:always">` +
    `<h1 style="font-size:18px;margin:0 0 4px">Pick list · <span style="font-family:monospace">${esc(doc.orderNumber)}</span></h1>` +
    `<p style="color:#666;margin:0 0 16px">${esc(doc.recipientName)} · ${esc(methodText(doc.deliveryMethod))} delivery${ready}</p>` +
    `<table style="width:100%;border-collapse:collapse">${rows}</table>` +
    `</section>`
  )
}

/**
 * Open one print window containing every document, newest page break between them.
 *
 * Returns how many pages were sent, so the caller can say so truthfully — ⚠ and returns 0 when the
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
