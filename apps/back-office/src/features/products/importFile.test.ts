import { describe, expect, it } from "vitest"

import { readSheetFile, sheetToRows } from "./importFile"

describe("102 — reading an import sheet in the browser", () => {
  it("takes the first non-empty row as the header, keeps sheet row numbers and drops empty rows", () => {
    expect(
      sheetToRows([
        [null, null],
        ["Name", "Shop price"],
        ["Milk", 2.5],
        [null, ""],
        ["Bread", 4],
      ]),
    ).toEqual({
      columns: ["Name", "Shop price"],
      rows: [
        { rowNumber: 3, cells: ["Milk", "2.5"] },
        { rowNumber: 5, cells: ["Bread", "4"] },
      ],
    })
  })

  it("reads dates and yes/no as the import expects", () => {
    expect(
      sheetToRows([
        ["Best before", "18+"],
        [new Date("2026-10-27T00:00:00Z"), true],
      ]).rows[0]!.cells,
    ).toEqual(["2026-10-27", "Yes"])
  })

  it("pads a short row to the header", () => {
    expect(sheetToRows([["A", "B", "C"], ["x"]]).rows[0]!.cells).toEqual(["x", "", ""])
  })

  it("reads a CSV file, quoted commas included", async () => {
    const file = new File(['Name,Short description\n"Milk, full cream",Fresh\n'], "list.csv", { type: "text/csv" })
    expect(await readSheetFile(file)).toEqual({
      columns: ["Name", "Short description"],
      rows: [{ rowNumber: 2, cells: ["Milk, full cream", "Fresh"] }],
    })
  })
})
