/**
 * 096 — printing labels through the browser (research R9): one SVG per page at the label's exact size,
 * margin 0, no scaling, and NO trailing page break — 089's labels printed a blank second page after
 * every label. On A4, four labels per page on a 2 × 2 grid of A6 quarters.
 *
 * ⚠ It writes into its OWN window so the console's chrome never reaches the printer, and returns 0 when
 * the browser blocked the window — "printed" is never claimed over a window that never opened (FR-018).
 */
import { GEOMETRY, type LabelLayout } from "./render"

const PAGE: Record<LabelLayout, string> = {
  a6: "size: 4in 6in; margin: 0",
  a4x4: "size: A4 portrait; margin: 0",
  roll62: "size: 62mm 100mm; margin: 0",
}

/** The whole printable document for these label SVGs. */
export function printDocument(svgs: readonly string[], layout: LabelLayout): string {
  const g = GEOMETRY[layout]
  const pages: string[] = []
  if (layout === "a4x4") {
    for (let i = 0; i < svgs.length; i += 4) {
      const four = svgs.slice(i, i + 4).map((s) => `<div class="cell">${s}</div>`).join("")
      pages.push(`<div class="page sheet">${four}</div>`)
    }
  } else {
    for (const s of svgs) pages.push(`<div class="page">${s}</div>`)
  }
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Bag labels</title><style>` +
    `@page{${PAGE[layout]}}html,body{margin:0;padding:0;background:#fff}` +
    `.page{break-after:page;page-break-after:always;overflow:hidden}` +
    `.page:last-child{break-after:auto;page-break-after:auto}` +
    `.page svg{display:block}` +
    `.sheet{display:grid;grid-template-columns:${g.widthMm}mm ${g.widthMm}mm;grid-template-rows:${g.heightMm}mm ${g.heightMm}mm;width:210mm;height:297mm}` +
    `</style></head><body>${pages.join("")}</body></html>`
  )
}

/** Open the print window. Returns how many labels were sent, or 0 when the browser blocked it. */
export function printBrowser(svgs: readonly string[], layout: LabelLayout): number {
  if (svgs.length === 0) return 0
  const w = window.open("", "_blank", "width=720,height=900")
  if (!w) return 0
  w.document.write(printDocument(svgs, layout))
  w.document.close()
  w.focus()
  w.print()
  return svgs.length
}
