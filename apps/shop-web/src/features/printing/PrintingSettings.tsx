import { useEffect, useState } from "react"

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui"

import { PageHeader } from "@effy/web-kit/patterns"
import { Printer, RefreshCw } from "lucide-react"

import { Page } from "@/components/console/primitives"

import { LABEL_LAYOUTS, type LabelLayout, type PrinterDpi } from "@/features/fulfillment/labels/render"
import {
  BROWSER_PRINT_URL,
  discoverZebraPrinters,
  printTestLabel,
  rememberedLayout,
  rememberedPrinter,
  rememberLayout,
  rememberPrinter,
  type PrinterChoice,
  type ZebraDevice,
} from "@/features/fulfillment/labels/printer"

/**
 * Settings → Printing: which printer this computer prints bag labels on,
 * its resolution, and the label size. Remembered on this computer only — each shop PC drives its own
 * printer.
 *
 * Direct printing (no print dialog) is for Zebra label printers through Zebra Browser Print, Zebra's free
 * helper installed on this computer. Without it, labels print through the browser at their exact size.
 *
 * Sectioned rows, not cards (Principle V).
 */
export function PrintingSettingsScreen() {
  const [choice, setChoice] = useState<PrinterChoice>(rememberedPrinter)
  const [layout, setLayout] = useState<LabelLayout>(rememberedLayout)
  const [zebras, setZebras] = useState<ZebraDevice[] | null | "looking">("looking")
  const [result, setResult] = useState<string | null>(null)

  const look = () => {
    setZebras("looking")
    void discoverZebraPrinters().then(setZebras)
  }
  useEffect(look, [])

  const save = (next: PrinterChoice) => {
    setChoice(next)
    rememberPrinter(next)
  }

  const value = choice.kind === "zebra" ? `zebra:${choice.device.uid}` : "browser"

  return (
    <Page>
      <PageHeader title="Printing" description="How this computer prints bag labels. Every shop computer keeps its own setting." />
      <section className="bo-panel max-w-3xl">
        <div>
          <Row label="Printer" hint="Labels go straight to a Zebra label printer when Zebra Browser Print is running on this computer.">
            <Select
              value={value}
              onValueChange={(v) => {
                if (v === "browser") return save({ kind: "browser", dpi: choice.dpi })
                const device = Array.isArray(zebras) ? zebras.find((z) => `zebra:${z.uid}` === v) : undefined
                if (device) save({ kind: "zebra", dpi: choice.dpi, device })
              }}
            >
              <SelectTrigger aria-label="Printer" className="w-[280px] max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="browser">The browser's print window</SelectItem>
                {choice.kind === "zebra" && !(Array.isArray(zebras) && zebras.some((z) => z.uid === choice.device.uid)) ? (
                  <SelectItem value={value}>{choice.device.name} (not found now)</SelectItem>
                ) : null}
                {Array.isArray(zebras)
                  ? zebras.map((z) => (
                      <SelectItem key={z.uid} value={`zebra:${z.uid}`}>
                        {z.name}
                      </SelectItem>
                    ))
                  : null}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={look} disabled={zebras === "looking"}>
              <RefreshCw aria-hidden="true" className={zebras === "looking" ? "animate-spin" : undefined} />
              {zebras === "looking" ? "Looking…" : "Look again"}
            </Button>
          </Row>
          {zebras === null ? (
            <p className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
              No Zebra Browser Print on this computer. To print straight to a Zebra label printer, install Zebra Browser Print
              from Zebra's website, start it, then open{" "}
              <a className="text-primary underline" href={BROWSER_PRINT_URL} target="_blank" rel="noreferrer">
                {BROWSER_PRINT_URL}
              </a>{" "}
              once and accept its certificate. Until then, labels print through the browser.
            </p>
          ) : null}

          <Row label="Printer resolution" hint="Printed on the printer's own label or in its manual. Most label printers are 203 dpi.">
            <Select value={String(choice.dpi)} onValueChange={(v) => save({ ...choice, dpi: Number(v) as PrinterDpi })}>
              <SelectTrigger aria-label="Printer resolution" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="203">203 dpi</SelectItem>
                <SelectItem value="300">300 dpi</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row label="Label size" hint="4 × 6 in (A6) for label printers; A4 prints four labels per sheet on an office printer.">
            <Select
              value={layout}
              onValueChange={(v) => {
                setLayout(v as LabelLayout)
                rememberLayout(v as LabelLayout)
              }}
            >
              <SelectTrigger aria-label="Label size" className="w-[280px] max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_LAYOUTS.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Check" hint="Prints one sample label. Nothing is recorded against an order.">
            <Button
              variant="outline"
              onClick={() => {
                setResult(null)
                void printTestLabel(choice, layout).then((r) => setResult(r.ok ? "Test label sent." : r.detail))
              }}
            >
              <Printer aria-hidden="true" />
              Print a test label
            </Button>
            {result ? <span role="status" className="text-sm font-medium">{result}</span> : null}
          </Row>
        </div>
      </section>
    </Page>
  )
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-2 border-b border-border px-5 py-4 last:border-b-0 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center max-md:px-4">
      <div className="grid gap-0.5">
        <div className="font-medium">{label}</div>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
