import { Box, Check, Minus, Plus, Printer, RotateCcw, Snowflake, Thermometer } from "lucide-react"
import { useMemo, useState } from "react"

import { useQueryClient } from "@tanstack/react-query"

import {
  PARCEL_CUSTODY_WORDS,
  PARCEL_ZONE_WORDS,
  judgeRead,
  type LabelReadDTO,
  type ParcelZone,
  type ShopOrderDetailDTO,
  type ShopParcelLabelDTO,
} from "@effy/shared-types"
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toast,
} from "@effy/design-system/ui"
import { ScanField } from "@effy/web-kit/scanner"

import { MicroLabel } from "@/components/console/primitives"
import { DesignSheet } from "@/components/console/DesignSheet"
import { track } from "@/lib/telemetry"

import { bagRefusalText } from "../errorText"
import { LABEL_LAYOUTS, renderLabelSvg, type LabelLayout } from "../labels/render"
import { printLabels, rememberedLayout, rememberedPrinter, rememberLayout } from "../labels/printer"
import { invalidateOrders, useDeclareParcels, usePackScan, useVoidParcel } from "../queries"
import { recordParcelPrints } from "../repo"

const ZONES: readonly ParcelZone[] = ["ambient", "chilled", "frozen"]
const TOKEN = /^EFY1:[2-9A-HJKMNP-TV-Z]{6}$/

function countsOf(parcels: readonly ShopParcelLabelDTO[]): Record<ParcelZone, number> {
  const c = { ambient: 0, chilled: 0, frozen: 0 }
  for (const p of parcels) c[p.zone] += 1
  return c
}

export function PackBags({ detail }: { detail: ShopOrderDetailDTO }) {
  const queryClient = useQueryClient()
  const declare = useDeclareParcels(detail.id)
  const voidBag = useVoidParcel(detail.id)
  const packScan = usePackScan(detail.id)

  const current = useMemo(() => countsOf(detail.parcels), [detail.parcels])
  const [counts, setCounts] = useState<Record<ParcelZone, number> | null>(null)
  const shown = counts ?? current
  const dirty = counts !== null && ZONES.some((z) => counts[z] !== current[z])
  const total = ZONES.reduce((a, z) => a + shown[z], 0)
  const missingZone = detail.zonesNeeded.find((z) => shown[z] === 0) ?? null

  const [layout, setLayout] = useState<LabelLayout>(rememberedLayout)
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const [lastRead, setLastRead] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ShopParcelLabelDTO | null>(null)

  const left = detail.parcels.some(
    (p) => p.custody === "with_driver" || p.custody === "with_courier" || p.custody === "beyond",
  )
  const anyPrinted = detail.parcels.some((p) => p.printed.count > 0)
  const unprinted = detail.parcels.filter((p) => !p.printed.current)
  const packed = detail.parcels.filter((p) => p.packScanned !== null).length
  const last = detail.parcels[detail.parcels.length - 1]
  const printer = rememberedPrinter()

  async function print(parcels: readonly ShopParcelLabelDTO[]) {
    setPrinting(true)
    setPrintError(null)
    try {
      const out = await printLabels([{ common: detail.labelCommon, parcels }], layout, recordParcelPrints)
      if (!out.ok) {
        setPrintError(out.detail)
        return
      }
      track({ name: "labels_printed", orders: 1, count: out.printed, layout, path: out.path })
      toast.success(`${out.printed} ${out.printed === 1 ? "label" : "labels"} sent to the printer`)
      invalidateOrders(queryClient)
    } finally {
      setPrinting(false)
    }
  }

  function onRead(read: { raw: string; method: "scan" | "typed" }) {
    const counted = detail.parcels.filter((p) => p.packScanned !== null).map((p) => p.code)
    const j = judgeRead(read.raw, read.method, { expected: detail.parcels, counted })
    setLastRead(j.words)
    if (j.outcome === "not_a_label") return
    const dto: LabelReadDTO = {
      clientReadId: crypto.randomUUID(),
      raw: read.raw,
      method: read.method,
      outcome: j.outcome,
      deviceAt: new Date().toISOString(),
      parcelCode: j.code,
    }
    packScan.mutate([dto])
  }

  const previewSvg = useMemo(() => {
    const p = detail.parcels.find((x) => x.parcelId === preview)
    return p ? renderLabelSvg({ common: detail.labelCommon, parcel: p }, layout) : null
  }, [detail.parcels, detail.labelCommon, preview, unprinted, layout])

  const step = (z: ParcelZone, d: number) => setCounts({ ...shown, [z]: Math.max(0, Math.min(50, shown[z] + d)) })

  const ZoneIcon = { ambient: Box, chilled: Thermometer, frozen: Snowflake } as const
  const previewing = preview !== null ? detail.parcels.find((x) => x.parcelId === preview) : undefined

  return (
    <div role="region" aria-label="Bags & labels" className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[13px] text-muted-foreground tabular-nums">
          {detail.parcels.length} {detail.parcels.length === 1 ? "bag" : "bags"} ·{" "}
          {detail.parcels.length - unprinted.length} printed
          {packed > 0 ? ` · ${packed} packed` : ""}
        </p>
        <Select
          value={layout}
          onValueChange={(v) => {
            setLayout(v as LabelLayout)
            rememberLayout(v as LabelLayout)
          }}
        >
          <SelectTrigger aria-label="Label size" className="w-60">
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
        <Button
          disabled={printing || dirty || detail.parcels.length === 0}
          onClick={() => print(unprinted.length > 0 ? unprinted : detail.parcels)}
        >
          <Printer className="size-4" />
          {unprinted.length > 0 && unprinted.length < detail.parcels.length
            ? `Print ${unprinted.length} new ${unprinted.length === 1 ? "label" : "labels"}`
            : `Print ${detail.parcels.length === 1 ? "label" : `all ${detail.parcels.length} labels`}`}
        </Button>
        <span className="basis-full text-right text-xs text-muted-foreground">
          {printer.kind === "zebra" && layout !== "a4x4" ? `To ${printer.device.name}` : "Through the browser"}
        </span>
        {printError ? (
          <p role="alert" className="w-full text-sm font-medium">
            {printError}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <ul aria-label="Bags" className="m-0 list-none divide-y divide-border p-0">
          {detail.parcels.map((p) => {
            const Z = ZoneIcon[p.zone]
            return (
              <li
                key={p.parcelId}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 max-md:grid-cols-[auto_minmax(0,1fr)]"
              >
                <span
                  aria-hidden="true"
                  className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4"
                >
                  <Z />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium tabular-nums">
                    Bag {p.seq} of {p.of} · {PARCEL_ZONE_WORDS[p.zone]}
                    <span className="font-mono text-[12.5px] font-normal">{p.code}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    {p.printed.current ? (
                      <Badge variant="success">
                        <Check aria-hidden="true" />
                        Printed
                      </Badge>
                    ) : p.printed.count > 0 ? (
                      <Badge variant="destructive">
                        <RotateCcw aria-hidden="true" />
                        Reprint needed
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <Printer aria-hidden="true" />
                        Not printed
                      </Badge>
                    )}
                    <span>{p.packScanned ? "Scanned as packed" : PARCEL_CUSTODY_WORDS[p.custody]}</span>
                  </span>
                </span>
                <span className="flex justify-end gap-1 max-md:col-span-full">
                  <Button variant="ghost" size="sm" onClick={() => setPreview(p.parcelId)}>
                    Preview
                  </Button>
                  <Button variant="outline" size="sm" disabled={printing} onClick={() => print([p])}>
                    <Printer aria-hidden="true" />
                    {p.printed.count > 0 ? "Reprint" : "Print"}
                  </Button>
                  {p.seq !== 1 && !left && (!anyPrinted || p.parcelId === last?.parcelId) ? (
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(p)}>
                      Remove
                    </Button>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>

        {/* Bags are added and removed by temperature: one bag per zone the lines need, more when they don't fit. */}
        <div className="grid gap-3 border-t bg-sidebar px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-[13px] font-medium">Bags per temperature</span>
            {ZONES.map((z) => (
              <div key={z} className="flex items-center gap-2">
                <span className="text-[13px] text-muted-foreground">
                  {PARCEL_ZONE_WORDS[z]}
                  {detail.zonesNeeded.includes(z) ? " · needed" : ""}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`One less ${PARCEL_ZONE_WORDS[z].toLowerCase()} bag`}
                  disabled={left || shown[z] === 0}
                  onClick={() => step(z, -1)}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <output aria-live="polite" className="min-w-5 text-center font-semibold tabular-nums">
                  {shown[z]}
                </output>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`One more ${PARCEL_ZONE_WORDS[z].toLowerCase()} bag`}
                  disabled={left || total >= 50}
                  onClick={() => step(z, 1)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
          {dirty ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={declare.isPending || total === 0 || missingZone !== null}
                onClick={() =>
                  declare.mutate(shown, {
                    onSuccess: () => setCounts(null),
                    onError: (err) => toast.error(bagRefusalText(err)),
                  })
                }
              >
                Save {total} {total === 1 ? "bag" : "bags"}
              </Button>
              <Button variant="ghost" onClick={() => setCounts(null)}>
                Undo
              </Button>
              {missingZone ? (
                <span className="text-sm font-medium">This order needs at least one {missingZone} bag.</span>
              ) : anyPrinted ? (
                <span className="text-sm text-muted-foreground">Every label will need printing again.</span>
              ) : null}
            </div>
          ) : null}
          {left ? (
            <p className="text-sm text-muted-foreground">These bags have left the shop, so they can't be changed.</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <MicroLabel>Scan each bag as you pack it{detail.packScanRequired ? " · required" : ""}</MicroLabel>
          <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            Packed {packed} of {detail.parcels.length}
          </span>
        </div>
        <ScanField accept={(t) => TOKEN.test(t)} onRead={onRead} placeholder="Scan a bag label, or type its code" />
        {lastRead ? (
          <p className="flex items-center gap-2 text-sm font-medium" role="status">
            {lastRead}
          </p>
        ) : null}
      </div>

      <Dialog open={previewing !== undefined} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Bag {previewing?.seq} of {previewing?.of} · <span className="font-mono">{previewing?.code}</span>
            </DialogTitle>
            <DialogDescription>The label as it prints, at the size chosen.</DialogDescription>
          </DialogHeader>
          {previewSvg ? (
            <div
              className="mx-auto w-60 overflow-hidden rounded-lg border bg-white [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <DesignSheet
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Remove bag ${removing.seq}?` : "Remove bag"}
        description="Its label will no longer scan. Throw it away if it was printed."
        saveLabel="Remove bag"
        destructive
        saving={voidBag.isPending}
        onSave={() =>
          removing &&
          voidBag.mutate(removing.parcelId, {
            onSuccess: () => setRemoving(null),
            onError: (err) => toast.error(bagRefusalText(err)),
          })
        }
      >
        <p>
          Bag {removing?.seq} ({removing ? PARCEL_ZONE_WORDS[removing.zone].toLowerCase() : ""}) ·{" "}
          <span className="font-mono">{removing?.code}</span>
        </p>
      </DesignSheet>
    </div>
  )
}
