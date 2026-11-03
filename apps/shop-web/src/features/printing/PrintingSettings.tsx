import { useEffect, useMemo, useState, type ReactNode } from "react"

import { AppWindow, ChevronDown, CircleCheck, Info, Printer, RefreshCw, TriangleAlert } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui"

import { PageHeader } from "@effy/web-kit/patterns"

import { Page } from "@/components/console/primitives"
import { SettingsIcon, SettingsList, SettingsPage, SettingsRow, SettingsSection } from "@/components/console/Settings"

import { GEOMETRY, renderLabelSvg, type LabelLayout, type PrinterDpi } from "@/features/fulfillment/labels/render"
import {
  BROWSER_PRINT_URL,
  discoverZebraPrinters,
  printTestLabel,
  rememberedLayout,
  rememberedPrinter,
  rememberLayout,
  rememberPrinter,
  TEST_LABEL,
  type PrinterChoice,
  type ZebraDevice,
} from "@/features/fulfillment/labels/printer"

type Discovery = ZebraDevice[] | null | "looking"

const SIZES: ReadonlyArray<{ id: LabelLayout; name: string; detail: string }> = [
  { id: "a6", name: "4 × 6 in (A6)", detail: "Thermal label printers" },
  { id: "a4x4", name: "A4 sheet, 4 labels", detail: "Office printers, on A4 label sheets" },
  { id: "roll62", name: "62 mm roll", detail: "Compact roll label printers" },
]

const sizeName = (l: LabelLayout) => SIZES.find((s) => s.id === l)?.name ?? l

export function PrintingSettingsScreen() {
  const [choice, setChoice] = useState<PrinterChoice>(rememberedPrinter)
  const [layout, setLayout] = useState<LabelLayout>(rememberedLayout)
  const [zebras, setZebras] = useState<Discovery>("looking")

  const look = () => {
    setZebras("looking")
    void discoverZebraPrinters().then(setZebras)
  }
  useEffect(look, [])

  const save = (next: PrinterChoice) => {
    setChoice(next)
    rememberPrinter(next)
  }
  const saveLayout = (next: LabelLayout) => {
    setLayout(next)
    rememberLayout(next)
  }

  return (
    <Page>
      <PageHeader
        title="Printing"
        description="How this computer prints bag labels. Each computer keeps its own setting."
      />
      <SettingsPage>
        <SettingsSection
          title="Printer"
          description="Labels go straight to a Zebra label printer when Zebra Browser Print runs on this computer. Otherwise they open in the print window."
        >
          <PrinterPicker choice={choice} zebras={zebras} onChange={save} onLook={look} />
        </SettingsSection>

        <SettingsSection title="Label size" description="Match the labels loaded in the printer.">
          <SizePicker value={layout} onChange={saveLayout} />
          {choice.kind === "zebra" && layout === "a4x4" ? (
            <Alert role="status" variant="info">
              <Info aria-hidden="true" />
              <AlertDescription>
                A Zebra printer can't print A4 sheets, so A4 labels open in the print window instead.
              </AlertDescription>
            </Alert>
          ) : null}
        </SettingsSection>

        <SettingsSection
          title="Resolution"
          description="On the printer's own label or in its manual. Most label printers are 203 dpi."
        >
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Printer resolution"
            value={String(choice.dpi)}
            onValueChange={(v) => (v ? save({ ...choice, dpi: Number(v) as PrinterDpi }) : undefined)}
          >
            <ToggleGroupItem value="203" className="px-4">
              203 dpi
            </ToggleGroupItem>
            <ToggleGroupItem value="300" className="px-4">
              300 dpi
            </ToggleGroupItem>
          </ToggleGroup>
        </SettingsSection>

        <SettingsSection
          title="Test label"
          description="Prints this sample with the settings above. Nothing is recorded against an order."
        >
          {/* Keyed by the settings, so a result never describes settings that have since changed. */}
          <TestLabel key={`${valueOf(choice)}|${layout}|${choice.dpi}`} choice={choice} layout={layout} />
        </SettingsSection>
      </SettingsPage>
    </Page>
  )
}

const valueOf = (c: PrinterChoice) => (c.kind === "zebra" ? `zebra:${c.device.uid}` : "browser")

function PrinterPicker({
  choice,
  zebras,
  onChange,
  onLook,
}: {
  choice: PrinterChoice
  zebras: Discovery
  onChange: (c: PrinterChoice) => void
  onLook: () => void
}) {
  const found = Array.isArray(zebras) ? zebras : []
  const remembered =
    choice.kind === "zebra" && !found.some((z) => z.uid === choice.device.uid) ? choice.device : undefined
  const devices = remembered ? [remembered, ...found] : found

  return (
    <SettingsList>
      <RadioGroup
        aria-label="Printer"
        value={valueOf(choice)}
        className="gap-0 divide-y"
        onValueChange={(v) => {
          if (v === "browser") return onChange({ kind: "browser", dpi: choice.dpi })
          const device = devices.find((z) => `zebra:${z.uid}` === v)
          if (device) onChange({ kind: "zebra", dpi: choice.dpi, device })
        }}
      >
        <PrinterOption
          value="browser"
          icon={<AppWindow />}
          name="Print window"
          detail="Your computer's print dialog. Works with any printer."
        />
        {devices.map((z) => (
          <PrinterOption
            key={z.uid}
            value={`zebra:${z.uid}`}
            icon={<Printer />}
            name={z.name}
            detail={["Zebra label printer", connectionWord(z.connection)].filter(Boolean).join(" · ")}
            badge={z === remembered && zebras !== "looking" ? <Badge variant="warning">Not found now</Badge> : null}
          />
        ))}
      </RadioGroup>
      <Discovery zebras={zebras} onLook={onLook} />
    </SettingsList>
  )
}

function PrinterOption({
  value,
  icon,
  name,
  detail,
  badge,
}: {
  value: string
  icon: ReactNode
  name: string
  detail: string
  badge?: ReactNode
}) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/50 has-[[data-state=checked]]:bg-primary-muted/40">
      <RadioGroupItem value={value} />
      <SettingsIcon>{icon}</SettingsIcon>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {name}
          {badge}
        </span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </span>
    </label>
  )
}

function connectionWord(c: string | undefined): string | null {
  if (!c) return null
  const k = c.toLowerCase()
  if (k === "usb") return "USB"
  if (k === "network") return "Network"
  if (k === "bluetooth" || k === "bluetooth_le") return "Bluetooth"
  if (k === "driver") return "Installed driver"
  return null
}

function Discovery({ zebras, onLook }: { zebras: Discovery; onLook: () => void }) {
  const looking = zebras === "looking"
  const [open, setOpen] = useState(false)

  const lookAgain = (
    <Button variant="outline" onClick={onLook} disabled={looking}>
      <RefreshCw aria-hidden="true" className={looking ? "animate-spin" : undefined} />
      Look again
    </Button>
  )

  if (looking) {
    return (
      <SettingsRow
        className="bg-muted/30"
        label={
          <span role="status" className="inline-flex items-center gap-2 font-normal text-muted-foreground">
            <Spinner className="size-4" />
            Looking for Zebra label printers on this computer
          </span>
        }
      >
        {lookAgain}
      </SettingsRow>
    )
  }

  if (Array.isArray(zebras)) {
    return (
      <SettingsRow
        className="bg-muted/30"
        label={<span className="font-normal text-muted-foreground">Zebra Browser Print is running</span>}
        hint={
          zebras.length === 0
            ? "It sees no printer. Check the printer is switched on and connected, then look again."
            : undefined
        }
      >
        {lookAgain}
      </SettingsRow>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="bg-muted/30">
      <SettingsRow
        label={<span className="font-normal text-muted-foreground">No Zebra Browser Print on this computer</span>}
      >
        <CollapsibleTrigger asChild>
          <Button variant="ghost" aria-expanded={open}>
            How to connect a Zebra printer
            <ChevronDown
              aria-hidden="true"
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
            />
          </Button>
        </CollapsibleTrigger>
        {lookAgain}
      </SettingsRow>
      <CollapsibleContent>
        <ol className="grid list-decimal gap-2 pr-4 pb-4 pl-12 text-sm text-muted-foreground marker:text-foreground">
          <li>Install Zebra Browser Print from Zebra's website.</li>
          <li>Start it, and connect the printer to this computer.</li>
          <li>
            Open{" "}
            <a className="text-primary underline" href={BROWSER_PRINT_URL} target="_blank" rel="noreferrer">
              {BROWSER_PRINT_URL}
            </a>{" "}
            once and accept its certificate.
          </li>
          <li>Come back here and press Look again.</li>
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Three tiles, each with the label drawn to scale: a size is easier to recognise by its shape than by its name.
 * (A card is the right pattern here: it is a radio choice with a picture, not a layout container.)
 */
function SizePicker({ value, onChange }: { value: LabelLayout; onChange: (l: LabelLayout) => void }) {
  return (
    <RadioGroup
      aria-label="Label size"
      value={value}
      onValueChange={(v) => onChange(v as LabelLayout)}
      className="grid gap-2 sm:grid-cols-3"
    >
      {SIZES.map((s) => (
        <label
          key={s.id}
          className="grid cursor-pointer gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-muted/40"
        >
          <span className="flex items-start justify-between gap-2">
            <SizeShape layout={s.id} />
            <RadioGroupItem value={s.id} />
          </span>
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{s.name}</span>
            <span className="text-sm text-muted-foreground">{s.detail}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  )
}

/** The paper, 64px tall, in proportion. A4 shows its four labels. */
function SizeShape({ layout }: { layout: LabelLayout }) {
  const g = GEOMETRY[layout]
  const [w, h] = layout === "a4x4" ? [210, 297] : [g.widthMm, g.heightMm]
  return (
    <span
      aria-hidden="true"
      className="grid h-16 shrink-0 rounded-sm border-2 border-muted-foreground/50 bg-background"
      style={{ aspectRatio: `${w} / ${h}`, ...(layout === "a4x4" ? { gridTemplate: "1fr 1fr / 1fr 1fr" } : {}) }}
    >
      {layout === "a4x4"
        ? Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className={
                (i % 2 === 0 ? "border-r " : "") +
                (i < 2 ? "border-b " : "") +
                "border-dashed border-muted-foreground/50"
              }
            />
          ))
        : null}
    </span>
  )
}

function TestLabel({ choice, layout }: { choice: PrinterChoice; layout: LabelLayout }) {
  const [result, setResult] = useState<{ ok: true; text: string } | { ok: false; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Our own drawing of a fixed sample, never outside input, shown as a picture.
  const src = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderLabelSvg(TEST_LABEL, layout, choice.dpi))}`,
    [layout, choice.dpi],
  )
  const g = GEOMETRY[layout]
  const viaZebra = choice.kind === "zebra" && layout !== "a4x4"
  const where = viaZebra ? choice.device.name : "the print window"

  return (
    <SettingsList>
      <div className="grid gap-6 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="grid place-items-center rounded-md bg-muted p-5">
          <img
            src={src}
            alt={`Sample bag label, ${sizeName(layout)}`}
            className="h-56 w-auto rounded-xs ring-1 ring-border"
            style={{ aspectRatio: `${g.widthMm} / ${g.heightMm}` }}
          />
        </div>
        <div className="grid content-center gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Prints to</dt>
            <dd className="font-medium">{viaZebra ? choice.device.name : "Print window"}</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd className="font-medium">{sizeName(layout)}</dd>
            <dt className="text-muted-foreground">Resolution</dt>
            <dd className="font-medium">{choice.dpi} dpi</dd>
          </dl>
          <div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setResult(null)
                setBusy(true)
                void printTestLabel(choice, layout)
                  .then((r) =>
                    setResult(
                      r.ok
                        ? { ok: true, text: r.path === "zpl" ? `Sent to ${where}.` : "The print window is open." }
                        : { ok: false, text: r.detail },
                    ),
                  )
                  .finally(() => setBusy(false))
              }}
            >
              <Printer aria-hidden="true" />
              Print a test label
            </Button>
          </div>
          {result?.ok ? (
            <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium">
              <CircleCheck aria-hidden="true" className="size-4 text-success" />
              {result.text}
            </p>
          ) : result ? (
            <Alert role="status" variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>It didn't print</AlertTitle>
              <AlertDescription>{result.text}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </SettingsList>
  )
}
