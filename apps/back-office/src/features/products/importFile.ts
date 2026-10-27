import Papa from "papaparse"
import { readSheet } from "read-excel-file/browser"
import writeXlsxFile from "write-excel-file/browser"

import type { StartProductImportRequest } from "@effy/shared-types"

type Cell = string | number | boolean | Date | null | undefined | object

/** A cell as the import reads it: text, with numbers as typed and dates as YYYY-MM-DD. */
function text(cell: Cell): string {
  if (cell === null || cell === undefined) return ""
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  if (typeof cell === "boolean") return cell ? "Yes" : "No"
  return String(cell).trim()
}

/**
 * A sheet's rows as the import takes them (102): the first non-empty row is the header; rows after it keep
 * their spreadsheet numbers (so a problem names the row staff see); empty rows are dropped.
 */
export function sheetToRows(data: readonly (readonly Cell[])[]): Pick<StartProductImportRequest, "columns" | "rows"> {
  const lines = data.map((r) => r.map(text))
  const head = lines.findIndex((r) => r.some((c) => c !== ""))
  if (head === -1) return { columns: [], rows: [] }
  const columns = lines[head]!
  const rows = lines
    .map((cells, i) => ({ rowNumber: i + 1, cells: columns.map((_, j) => cells[j] ?? "") }))
    .slice(head + 1)
    .filter((r) => r.cells.some((c) => c !== ""))
  return { columns, rows }
}

/** FileReader, not Blob.text(): one path for every browser and for jsdom. */
function readAs<T extends "text" | "buffer">(file: Blob, as: T): Promise<T extends "text" ? string : ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as never)
    reader.onerror = () => reject(reader.error ?? new Error("the file could not be read"))
    if (as === "text") reader.readAsText(file)
    else reader.readAsArrayBuffer(file)
  })
}

export function isSheetFile(file: File): boolean {
  return /\.(xlsx|csv)$/i.test(file.name)
}

/** An .xlsx or .csv file, read in the browser: nothing but its parsed rows leaves it. */
export async function readSheetFile(file: File): Promise<Pick<StartProductImportRequest, "columns" | "rows">> {
  if (/\.csv$/i.test(file.name)) {
    const parsed = Papa.parse<string[]>(await readAs(file, "text"), { skipEmptyLines: false })
    return sheetToRows(parsed.data)
  }
  return sheetToRows((await readSheet(file)) as unknown as Cell[][])
}

/** The file's fingerprint: the same file imported twice for a shop is flagged. */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await readAs(file, "buffer"))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** The template: one header row, the columns' meaning shown beside the upload. */
export async function downloadTemplate(columns: readonly { name: string }[], fileName: string): Promise<void> {
  await writeXlsxFile([columns.map((c) => ({ value: c.name, fontWeight: "bold" as const }))], {
    columns: columns.map((c) => ({ width: Math.max(14, c.name.length + 2) })),
  }).toFile(fileName)
}
