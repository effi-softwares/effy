import { GEOMETRY, type LabelLayout } from "./render"

const PAGE: Record<LabelLayout, string> = {
  a6: "size: 4in 6in; margin: 0",
  a4x4: "size: A4 portrait; margin: 0",
  roll62: "size: 62mm 100mm; margin: 0",
}

export function printDocument(svgs: readonly string[], layout: LabelLayout): string {
  const g = GEOMETRY[layout]
  const pages: string[] = []
  if (layout === "a4x4") {
    for (let i = 0; i < svgs.length; i += 4) {
      const four = svgs
        .slice(i, i + 4)
        .map((s) => `<div class="cell">${s}</div>`)
        .join("")
      pages.push(`<div class="page sheet">${four}</div>`)
    }
  } else {
    for (const s of svgs) pages.push(`<div class="page">${s}</div>`)
  }
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Bag labels</title><style>` +
    `@page{${PAGE[layout]}}html,body{margin:0;padding:0;background:#fff}` +
    `.page{break-after:page;page-break-after:always;overflow:hidden;width:${g.widthMm}mm;height:${g.heightMm - 0.5}mm}` +
    `.page:last-child{break-after:auto;page-break-after:auto}` +
    `.page svg{display:block;width:100%;height:100%}` +
    `.sheet .cell{overflow:hidden}.sheet .cell svg{display:block;width:100%;height:100%}` +
    `.page.sheet{display:grid;grid-template-columns:${g.widthMm}mm ${g.widthMm}mm;grid-template-rows:${g.heightMm - 0.25}mm ${g.heightMm - 0.25}mm;width:210mm;height:296.5mm}` +
    `</style></head><body>${pages.join("")}</body></html>`
  )
}

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
