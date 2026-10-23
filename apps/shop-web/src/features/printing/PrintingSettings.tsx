import { useEffect, useState } from "react"

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui"

import { DetailSection, Page } from "@/components/console/primitives"

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
      <DetailSection title="Printing" subtitle="How this computer prints bag labels. Every shop computer keeps its own setting.">
        <div className="grid gap-6 pt-4">
          <Row label="Printer" hint="Labels go straight to a Zebra label printer when Zebra Browser Print is running on this computer.">
            <Select
              value={value}
              onValueChange={(v) => {
                if (v === "browser") return save({ kind: "browser", dpi: choice.dpi })
                const device = Array.isArray(zebras) ? zebras.find((z) => `zebra:${z.uid}` === v) : undefined
                if (device) save({ kind: "zebra", dpi: choice.dpi, device })
              }}
            >
              <SelectTrigger aria-label="Printer" className="w-[300px]">
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
            <Button variant="outline" size="sm" onClick={look} disabled={zebras === "looking"}>
              {zebras === "looking" ? "Looking…" : "Look again"}
            </Button>
          </Row>
          {zebras === null ? (
            <p className="text-muted-foreground max-w-[70ch] text-[13px] leading-[1.6]">
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
              <SelectTrigger aria-label="Label size" className="w-[300px]">
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
              Print a test label
            </Button>
            {result ? <span className="text-[13px]">{result}</span> : null}
          </Row>
        </div>
      </DetailSection>
    </Page>
  )
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="border-border grid gap-2 border-b pb-5">
      <div className="text-[13.5px] font-medium">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <p className="text-muted-foreground text-[12.5px]">{hint}</p>
    </div>
  )
}
