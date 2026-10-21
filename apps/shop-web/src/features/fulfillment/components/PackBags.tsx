import { Minus, Plus, Printer } from "lucide-react";
import { useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import {
  PARCEL_CUSTODY_WORDS,
  PARCEL_ZONE_WORDS,
  judgeRead,
  type LabelReadDTO,
  type ParcelZone,
  type ShopOrderDetailDTO,
  type ShopParcelLabelDTO,
} from "@effy/shared-types";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from "@effy/design-system/ui";
import { ScanField } from "@effy/web-kit/scanner";

import { MicroLabel } from "@/components/console/primitives";
import { DesignSheet } from "@/components/console/DesignSheet";
import { track } from "@/lib/telemetry";

import { bagRefusalText } from "../errorText";
import { LABEL_LAYOUTS, renderLabelSvg, type LabelLayout } from "../labels/render";
import { printLabels, rememberedLayout, rememberedPrinter, rememberLayout } from "../labels/printer";
import { invalidateOrders, useDeclareParcels, usePackScan, useVoidParcel } from "../queries";
import { recordParcelPrints } from "../repo";

const ZONES: readonly ParcelZone[] = ["ambient", "chilled", "frozen"];
const TOKEN = /^EFY1:[2-9A-HJKMNP-TV-Z]{6}$/;

function countsOf(parcels: readonly ShopParcelLabelDTO[]): Record<ParcelZone, number> {
  const c = { ambient: 0, chilled: 0, frozen: 0 };
  for (const p of parcels) c[p.zone] += 1;
  return c;
}

/**
 * 096 — "Bags & labels" (spec US1, US2, US4, US10): say how many bags of each temperature the portion was
 * packed in, print one label per bag, and scan each label as it goes on its bag.
 *
 * ⚠ A label that is printed must stay true: once any is printed, only the LAST bag can be removed, and a
 * new count means printing every label again (the server enforces both; this only offers what it allows).
 * The order cannot be marked ready until every bag's label is printed (FR-016).
 */
export function PackBags({ detail }: { detail: ShopOrderDetailDTO }) {
  const queryClient = useQueryClient();
  const declare = useDeclareParcels(detail.id);
  const voidBag = useVoidParcel(detail.id);
  const packScan = usePackScan(detail.id);

  const current = useMemo(() => countsOf(detail.parcels), [detail.parcels]);
  const [counts, setCounts] = useState<Record<ParcelZone, number> | null>(null);
  const shown = counts ?? current;
  const dirty = counts !== null && ZONES.some((z) => counts[z] !== current[z]);
  const total = ZONES.reduce((a, z) => a + shown[z], 0);
  const missingZone = detail.zonesNeeded.find((z) => shown[z] === 0) ?? null;

  const [layout, setLayout] = useState<LabelLayout>(rememberedLayout);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ShopParcelLabelDTO | null>(null);

  const left = detail.parcels.some((p) => p.custody === "with_driver" || p.custody === "with_courier" || p.custody === "beyond");
  const anyPrinted = detail.parcels.some((p) => p.printed.count > 0);
  const unprinted = detail.parcels.filter((p) => !p.printed.current);
  const packed = detail.parcels.filter((p) => p.packScanned !== null).length;
  const last = detail.parcels[detail.parcels.length - 1];
  const printer = rememberedPrinter();

  async function print(parcels: readonly ShopParcelLabelDTO[]) {
    setPrinting(true);
    setPrintError(null);
    try {
      const out = await printLabels([{ common: detail.labelCommon, parcels }], layout, recordParcelPrints);
      if (!out.ok) {
        setPrintError(out.detail);
        return;
      }
      track({ name: "labels_printed", orders: 1, count: out.printed, layout, path: out.path });
      toast.success(`${out.printed} ${out.printed === 1 ? "label" : "labels"} sent to the printer`);
      invalidateOrders(queryClient);
    } finally {
      setPrinting(false);
    }
  }

  function onRead(read: { raw: string; method: "scan" | "typed" }) {
    const counted = detail.parcels.filter((p) => p.packScanned !== null).map((p) => p.code);
    const j = judgeRead(read.raw, read.method, { expected: detail.parcels, counted });
    setLastRead(j.words);
    if (j.outcome === "not_a_label") return;
    const dto: LabelReadDTO = {
      clientReadId: crypto.randomUUID(),
      raw: read.raw,
      method: read.method,
      outcome: j.outcome,
      deviceAt: new Date().toISOString(),
      parcelCode: j.code,
    };
    packScan.mutate([dto]);
  }

  const previewSvg = useMemo(() => {
    const p = detail.parcels.find((x) => x.parcelId === preview) ?? unprinted[0] ?? detail.parcels[0];
    return p ? renderLabelSvg({ common: detail.labelCommon, parcel: p }, layout) : null;
  }, [detail.parcels, detail.labelCommon, preview, unprinted, layout]);

  const step = (z: ParcelZone, d: number) =>
    setCounts({ ...shown, [z]: Math.max(0, Math.min(50, shown[z] + d)) });

  return (
    <section aria-labelledby="bags-heading">
      <div className="border-border flex flex-wrap items-baseline gap-2.5 border-b pb-3">
        <h2 id="bags-heading" className="text-[15px] font-semibold tracking-[-.01em]">
          Bags &amp; labels
        </h2>
        <span className="text-muted-foreground text-[12.5px]">
          {detail.parcels.length} {detail.parcels.length === 1 ? "bag" : "bags"} · {detail.parcels.length - unprinted.length} printed
          {packed > 0 ? ` · ${packed} packed` : ""}
        </span>
      </div>

      {/* How many bags of each temperature. */}
      <div className="border-border grid gap-3 border-b py-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {ZONES.map((z) => (
            <div key={z} className="grid gap-1.5">
              <MicroLabel>
                {PARCEL_ZONE_WORDS[z]}
                {detail.zonesNeeded.includes(z) ? " · needed" : ""}
              </MicroLabel>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={`One less ${PARCEL_ZONE_WORDS[z].toLowerCase()} bag`}
                  disabled={left || shown[z] === 0}
                  onClick={() => step(z, -1)}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-7 text-center text-[15px] font-semibold tabular-nums" aria-live="polite">
                  {shown[z]}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={`One more ${PARCEL_ZONE_WORDS[z].toLowerCase()} bag`}
                  disabled={left || total >= 50}
                  onClick={() => step(z, 1)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {dirty ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
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
            <Button size="sm" variant="ghost" onClick={() => setCounts(null)}>
              Undo
            </Button>
            {missingZone ? (
              <span className="text-muted-foreground text-[12.5px]">This order needs at least one {missingZone} bag.</span>
            ) : anyPrinted ? (
              <span className="text-muted-foreground text-[12.5px]">Every label will need printing again.</span>
            ) : null}
          </div>
        ) : null}
        {left ? <p className="text-muted-foreground text-[12.5px]">These bags have left the shop, so they can't be changed.</p> : null}
      </div>

      {/* Print. */}
      <div className="border-border flex flex-wrap items-center gap-2 border-b py-4">
        <Select
          value={layout}
          onValueChange={(v) => {
            setLayout(v as LabelLayout);
            rememberLayout(v as LabelLayout);
          }}
        >
          <SelectTrigger aria-label="Label size" className="w-[260px]">
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
        <Button disabled={printing || dirty || detail.parcels.length === 0} onClick={() => print(unprinted.length > 0 ? unprinted : detail.parcels)}>
          <Printer className="size-4" />
          {unprinted.length > 0 && unprinted.length < detail.parcels.length
            ? `Print ${unprinted.length} new ${unprinted.length === 1 ? "label" : "labels"}`
            : `Print ${detail.parcels.length === 1 ? "label" : `all ${detail.parcels.length} labels`}`}
        </Button>
        <span className="text-muted-foreground text-[12.5px]">
          {printer.kind === "zebra" && layout !== "a4x4" ? `To ${printer.device.name}` : "Through the browser"}
        </span>
        {printError ? <p className="text-destructive w-full text-[12.5px]">{printError}</p> : null}
      </div>

      {/* Scan each label as it goes on its bag. */}
      <div className="border-border grid gap-2 border-b py-4">
        <MicroLabel>Scan each bag as you pack it</MicroLabel>
        <ScanField accept={(t) => TOKEN.test(t)} onRead={onRead} placeholder="Scan a bag label, or type its code" />
        {lastRead ? (
          <p className="text-[13px] font-medium" role="status">
            {lastRead}
          </p>
        ) : null}
      </div>

      {/* The bags. */}
      <div className="grid gap-6 py-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-left text-[11.5px] tracking-[.04em] uppercase">
              <th className="py-2 pr-3 font-medium">Bag</th>
              <th className="py-2 pr-3 font-medium">Code</th>
              <th className="py-2 pr-3 font-medium">Zone</th>
              <th className="py-2 pr-3 font-medium">Label</th>
              <th className="py-2 pr-3 font-medium">Where</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {detail.parcels.map((p) => (
              <tr key={p.parcelId} className="border-border border-b">
                <td className="py-2.5 pr-3 tabular-nums">
                  {p.seq} of {p.of}
                </td>
                <td className="py-2.5 pr-3 font-mono">{p.code}</td>
                <td className="py-2.5 pr-3">{PARCEL_ZONE_WORDS[p.zone]}</td>
                <td className="py-2.5 pr-3">{p.printed.current ? "Printed" : p.printed.count > 0 ? "Reprint needed" : "Not printed"}</td>
                <td className="py-2.5 pr-3">{PARCEL_CUSTODY_WORDS[p.custody]}</td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setPreview(p.parcelId)}>
                    Preview
                  </Button>
                  <Button variant="ghost" size="sm" disabled={printing} onClick={() => print([p])}>
                    {p.printed.count > 0 ? "Reprint" : "Print"}
                  </Button>
                  {/* Bag 1 never; once printed, only the last bag (the server refuses anything else). */}
                  {p.seq !== 1 && !left && (!anyPrinted || p.parcelId === last?.parcelId) ? (
                    <Button variant="destructive-ghost" size="sm" onClick={() => setRemoving(p)}>
                      Remove
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {previewSvg ? (
          <figure className="grid justify-items-center gap-1.5">
            {/* The label exactly as it prints (FR-012b); the SVG is our own renderer's, black and white. */}
            <div
              className="border-border w-[220px] overflow-hidden rounded-[var(--radius)] border bg-white [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
            <figcaption className="text-muted-foreground text-[12px]">Preview</figcaption>
          </figure>
        ) : null}
      </div>

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
        <p className="text-[13px]">
          Bag {removing?.seq} ({removing ? PARCEL_ZONE_WORDS[removing.zone].toLowerCase() : ""}) · <span className="font-mono">{removing?.code}</span>
        </p>
      </DesignSheet>
    </section>
  );
}
