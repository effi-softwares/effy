import type { ShopLabelCommonDTO, ShopParcelLabelDTO } from "@effy/shared-types"

import { printBrowser } from "./print"
import { renderLabelSvg, type LabelDocument, type LabelLayout, type PrinterDpi } from "./render"
import { svgsToZpl } from "./zpl"

const LAYOUT_KEY = "effy.shop.labelLayout"
const PRINTER_KEY = "effy.shop.labelPrinter"
const PENDING_KEY = "effy.shop.pendingPrints"

export type PrinterChoice =
  | { kind: "browser"; dpi: PrinterDpi }
  | { kind: "zebra"; dpi: PrinterDpi; device: ZebraDevice }

function read<T>(key: string): T | null {
  try {
    const v = window.localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A browser that refuses storage simply asks again next time.
  }
}

export function rememberedLayout(): LabelLayout {
  const v = read<string>(LAYOUT_KEY)
  return v === "a4x4" || v === "roll62" || v === "a6" ? v : "a6"
}
export const rememberLayout = (layout: LabelLayout) => write(LAYOUT_KEY, layout)

export function rememberedPrinter(): PrinterChoice {
  const v = read<PrinterChoice>(PRINTER_KEY)
  if (v && (v.kind === "browser" || (v.kind === "zebra" && v.device)) && (v.dpi === 203 || v.dpi === 300)) return v
  return { kind: "browser", dpi: 203 }
}
export const rememberPrinter = (choice: PrinterChoice) => write(PRINTER_KEY, choice)

export interface ZebraDevice {
  name: string
  uid: string
  connection?: string
  deviceType?: string
  provider?: string
  manufacturer?: string
  version?: number
}

export const BROWSER_PRINT_URL = "https://localhost:9101"

async function zebra<T>(path: string, init?: RequestInit, base = BROWSER_PRINT_URL): Promise<T> {
  const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(4000) })
  if (!res.ok) throw new Error(`Browser Print answered ${res.status}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

export async function discoverZebraPrinters(): Promise<ZebraDevice[] | null> {
  try {
    const out = await zebra<{ printer?: ZebraDevice[] }>("/available")
    return out.printer ?? []
  } catch {
    return null
  }
}

async function sendZebra(device: ZebraDevice, zpl: string): Promise<void> {
  await zebra("/write", {
    method: "POST",
    body: JSON.stringify({ device, data: zpl }),
    headers: { "Content-Type": "text/plain" },
  })
}

export interface PrintJob {
  common: ShopLabelCommonDTO
  parcels: ReadonlyArray<Pick<ShopParcelLabelDTO, "parcelId" | "code" | "seq" | "of" | "zone">>
}

type PrintOutcome =
  | { ok: true; printed: number; path: "browser" | "zpl" }
  | { ok: false; reason: "blocked" | "printer_unreachable" | "nothing_to_print"; detail: string }

type RecordPrints = (body: {
  changeId: string
  parcelIds: string[]
  layout: LabelLayout
  path: "browser" | "zpl"
}) => Promise<unknown>

function labelDocuments(jobs: readonly PrintJob[]): LabelDocument[] {
  return jobs.flatMap((j) =>
    j.parcels.map((p) => ({ common: j.common, parcel: { code: p.code, seq: p.seq, of: p.of, zone: p.zone } })),
  )
}

export async function printLabels(
  jobs: readonly PrintJob[],
  layout: LabelLayout,
  record: RecordPrints,
  printer: PrinterChoice = rememberedPrinter(),
): Promise<PrintOutcome> {
  const docs = labelDocuments(jobs)
  if (docs.length === 0) return { ok: false, reason: "nothing_to_print", detail: "There are no bags to print." }
  const parcelIds = jobs.flatMap((j) => j.parcels.map((p) => p.parcelId))
  const svgs = docs.map((d) => renderLabelSvg(d, layout, printer.dpi))

  let path: "browser" | "zpl" = "browser"
  if (printer.kind === "zebra" && layout !== "a4x4") {
    try {
      await sendZebra(printer.device, await svgsToZpl(svgs, layout, printer.dpi))
      path = "zpl"
    } catch {
      return {
        ok: false,
        reason: "printer_unreachable",
        detail: `The label printer "${printer.device.name}" didn't answer. Check it is on and Zebra Browser Print is running, or print from the browser instead.`,
      }
    }
  } else if (printBrowser(svgs, layout) === 0) {
    return {
      ok: false,
      reason: "blocked",
      detail: "The browser blocked the print window. Allow pop-ups for this site and try again.",
    }
  }

  const body = { changeId: crypto.randomUUID(), parcelIds, layout, path }
  await flushPendingPrints(record)
  try {
    await record(body)
  } catch {
    write(PENDING_KEY, [...(read<(typeof body)[]>(PENDING_KEY) ?? []), body].slice(-50))
  }
  return { ok: true, printed: docs.length, path }
}

async function flushPendingPrints(record: RecordPrints): Promise<void> {
  const pending = read<Parameters<RecordPrints>[0][]>(PENDING_KEY) ?? []
  if (pending.length === 0) return
  const left: typeof pending = []
  for (const body of pending) {
    try {
      await record(body)
    } catch {
      left.push(body)
    }
  }
  write(PENDING_KEY, left)
}

export async function printTestLabel(printer: PrinterChoice, layout: LabelLayout): Promise<PrintOutcome> {
  const sample: LabelDocument = {
    common: {
      service: "effy_driver",
      orderNumber: "EFY-TEST01",
      packedOn: null,
      recipientName: "Test label",
      line1: "1 Sample Street",
      line2: null,
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
      country: "AU",
      phone: null,
    },
    parcel: { code: "22222X", seq: 1, of: 1, zone: "ambient" },
  }
  const svg = renderLabelSvg(sample, layout, printer.dpi)
  if (printer.kind === "zebra" && layout !== "a4x4") {
    try {
      await sendZebra(printer.device, await svgsToZpl([svg], layout, printer.dpi))
      return { ok: true, printed: 1, path: "zpl" }
    } catch {
      return {
        ok: false,
        reason: "printer_unreachable",
        detail: `The label printer "${printer.device.name}" didn't answer.`,
      }
    }
  }
  return printBrowser([svg], layout) === 0
    ? {
        ok: false,
        reason: "blocked",
        detail: "The browser blocked the print window. Allow pop-ups for this site and try again.",
      }
    : { ok: true, printed: 1, path: "browser" }
}
