import { STORAGE_CLASSES, STORAGE_CLASS_WORDS, type DeliveredBy, type StorageClass } from "@effy/shared-types"

import { deliveredByText, formatWhen } from "./orderConsole"
import { lineCodes } from "./codes"

interface PickListDocument {
  orderNumber: string
  recipientName: string
  deliveredBy: DeliveredBy
  readyBy: string | null
  lines: Array<{
    name: string
    variantLabel?: string | null
    variantCode?: string | null
    sku: string | null
    quantity: number
    storageClass: StorageClass
  }>
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

function renderPickListPage(doc: PickListDocument): string {
  const row = (l: PickListDocument["lines"][number]) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #ddd">☐</td><td style="padding:8px;border-bottom:1px solid #ddd">${esc(l.variantLabel ? `${l.name} — ${l.variantLabel}` : l.name)}</td><td style="padding:8px;border-bottom:1px solid #ddd;font-family:monospace">${esc(lineCodes(l.variantCode, l.sku))}</td><td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right">${l.quantity}</td></tr>`
  const groups = STORAGE_CLASSES.map((zone) => ({
    zone,
    lines: doc.lines.filter((l) => (l.storageClass ?? "ambient") === zone),
  })).filter((g) => g.lines.length > 0)
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
