import { describe, expect, it } from "vitest"

import { LABEL_LAYOUTS, deliversWord, renderLabel, renderLabelDocument, type LabelDocument } from "./labels"

const doc = (over: Partial<LabelDocument> = {}): LabelDocument => ({
  orderNumber: "EFY-20481",
  deliveredBy: "effy_driver",
  label: { packageCode: "7K3Q9M", position: 2, packageCount: 3, suburb: "Richmond", cold: "frozen" },
  ...over,
})

describe("package labels (089, quickstart P4)", () => {
  for (const { id } of LABEL_LAYOUTS) {
    it(`${id}: carries the code three ways and what the driver and hub need`, () => {
      const html = renderLabel(doc(), id)
      expect(html).toContain('data-part="qr"')
      expect(html).toContain('data-part="barcode"')
      expect(html).toMatch(/data-part="code"[^>]*>7K3Q9M</)
      expect(html).toContain("EFY-20481 · package 2 of 3")
      expect(html).toMatch(/data-part="delivers"[^>]*>EFFY</)
      expect(html).toContain("Richmond")
      expect(html).toContain("FROZEN")
    })
  }

  it("says COURIER for a courier parcel, and EFFY otherwise — never a window, day or estimate", () => {
    expect(deliversWord("courier")).toBe("COURIER")
    expect(deliversWord("effy_driver")).toBe("EFFY")
    const html = renderLabel(doc({ deliveredBy: "courier" }), "roll62")
    expect(html).toMatch(/data-part="delivers"[^>]*>COURIER</)
    expect(html).not.toMatch(/same.?day|standard|window|\d{1,2}(:\d{2})?\s?(am|pm)/i)
  })

  /**
   * ⚠ The label goes on the customer's bag: no shop name (hidden fulfilment), no customer name or
   * street (privacy), no price. The document type carries none of them — this proves a renderer change
   * cannot add one through a field that happens to be nearby.
   */
  it("never carries a shop name, a customer name, a street or a price", () => {
    const leaky = { ...doc(), shopName: "Green Grocer", recipientName: "Ada Lovelace", line1: "27 Rathdowne St", total: "$44.00" }
    for (const { id } of LABEL_LAYOUTS) {
      const html = renderLabelDocument([leaky as LabelDocument], id)
      for (const forbidden of ["Green Grocer", "Ada Lovelace", "Rathdowne", "$"]) expect(html).not.toContain(forbidden)
    }
  })

  it("escapes what it is given", () => {
    const html = renderLabel(doc({ orderNumber: "<b>x</b>", label: { ...doc().label, suburb: "<script>" } }), "roll62")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;b&gt;")
  })

  it("prints the requested copies, laid out on a 3-wide grid for the A4 sheet", () => {
    const sheet = renderLabelDocument([doc()], "a4sheet", 4)
    expect(sheet.match(/class="label"/g)).toHaveLength(4)
    expect(sheet).toContain("grid-template-columns:repeat(3,63.5mm)")
    expect(sheet).toContain("@page{size: A4")
    expect(renderLabelDocument([doc()], "roll62")).toContain("@page{size: 62mm 100mm")
  })

  it("omits the cold mark and the suburb when there is none", () => {
    const html = renderLabel(doc({ label: { ...doc().label, cold: null, suburb: null } }), "label4x6")
    expect(html).not.toContain('data-part="cold"')
    expect(html).not.toContain('data-part="suburb"')
  })
})
