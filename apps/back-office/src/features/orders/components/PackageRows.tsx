import { useState } from "react"

import {
  PARCEL_CUSTODY_WORDS,
  PARCEL_ZONE_WORDS,
  type AdminPackageHandoverDTO,
  type AdminParcelDTO,
  type HandoverMethod,
  type OrderAssignment,
  type RecordedHandoverStep,
} from "@effy/shared-types"
import { AssignmentLine } from "./AssignmentLine"
import { ConsignmentBlock } from "./ConsignmentBlock"
import { PackageStatusPill } from "@effy/web-kit/console"
import { Timeline, TimelineItem } from "@effy/web-kit/patterns"
import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
import { CircleCheck, Package, PackageCheck, Store, Truck, Undo2, Warehouse } from "lucide-react"

import { clockAt } from "@/lib/format"

import {
  type OrderPackage,
  nextActionFor,
  packageDeliveryText,
  PROMISE_FLAG_LABEL,
  promiseFlagsFor,
  promiseTextFor,
  formatDeliveryDay,
} from "../model"

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
}

type AssignmentActions = (
  pkg: OrderPackage,
  stage: "collection" | "delivery",
  assignment: OrderAssignment,
) => React.ReactNode

interface Props {
  orderId?: string
  courierCollection?: "hub" | "supplier" | null
  renderActions?: AssignmentActions
  packages: OrderPackage[]
  canRecord: boolean
  busy: boolean
  onHandoff(fulfillmentId: string, reference: string, carrierName: string): void
  onArrival(fulfillmentId: string): void
  highlight?: { parcelId?: string; packageId?: string }
}

export function PackageRows({
  packages,
  canRecord,
  busy,
  onHandoff,
  onArrival,
  renderActions,
  orderId,
  courierCollection = null,
  highlight,
}: Props) {
  return (
    <div className="divide-y divide-border">
      {packages.map((pkg) => (
        <PackageRow
          key={pkg.fulfillmentId}
          pkg={pkg}
          canRecord={canRecord}
          busy={busy}
          onHandoff={onHandoff}
          onArrival={onArrival}
          renderActions={renderActions}
          orderId={orderId}
          courierCollection={courierCollection}
          highlight={highlight}
        />
      ))}
      {packages.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">This order has no packages yet.</p>
      ) : null}
    </div>
  )
}

function PackageRow({
  pkg,
  canRecord,
  busy,
  onHandoff,
  onArrival,
  renderActions,
  orderId,
  courierCollection,
  highlight,
}: {
  highlight?: { parcelId?: string; packageId?: string }
  orderId?: string
  courierCollection: "hub" | "supplier" | null
  renderActions?: AssignmentActions
  pkg: OrderPackage
  canRecord: boolean
  busy: boolean
  onHandoff(fulfillmentId: string, reference: string, carrierName: string): void
  onArrival(fulfillmentId: string): void
}) {
  const [reference, setReference] = useState("")
  const [carrierName, setCarrierName] = useState("")
  const action = nextActionFor(pkg)
  const promise = promiseTextFor(pkg)
  const flags = promiseFlagsFor(pkg)

  const bags = pkg.parcels ?? []
  const lit = highlight?.packageId === pkg.fulfillmentId || bags.some((b) => b.parcelId === highlight?.parcelId)
  return (
    <div
      id={`package-${pkg.fulfillmentId}`}
      className={`space-y-4 px-5 py-4 ${lit ? "bg-primary-muted/40" : ""}`}
      data-highlighted={lit || undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-9 flex-none place-items-center rounded-lg bg-muted text-foreground [&_svg]:size-4"
            aria-hidden="true"
          >
            <Store />
          </span>
          <div className="min-w-0">
            <div className="font-semibold">{pkg.shopName}</div>
            <div className="mt-0.5 block text-sm text-muted-foreground">
              {pkg.packageCode ? (
                <>
                  <span className="font-mono" aria-label="Package code">
                    {pkg.packageCode}
                  </span>{" "}
                  ·{" "}
                </>
              ) : null}
              {pkg.itemCount} item{pkg.itemCount === 1 ? "" : "s"} · {packageDeliveryText(pkg)}
            </div>
          </div>
        </div>
        {pkg.statusView ? <PackageStatusPill view={pkg.statusView} icons /> : null}
      </div>

      {pkg.collect || pkg.deliver ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {pkg.collect ? (
            <AssignmentLine
              label="Collect"
              assignment={pkg.collect}
              actions={renderActions?.(pkg, "collection", pkg.collect)}
            />
          ) : null}
          {pkg.deliver ? (
            <AssignmentLine
              label="Deliver"
              assignment={pkg.deliver}
              actions={renderActions?.(pkg, "delivery", pkg.deliver)}
            />
          ) : null}
        </div>
      ) : null}

      {bags.length > 0 ? <BagTable bags={bags} highlightParcelId={highlight?.parcelId} /> : null}

      {promise || (pkg.handovers && pkg.handovers.length > 0) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {promise ? (
            <dl className="ef-dl ef-dl--tight">
              <div className="ef-dl__row">
                <dt>Promised</dt>
                <dd className="tabular-nums">{promise}</dd>
              </div>
              {pkg.handoverDueOn && !pkg.handoff ? (
                <div className="ef-dl__row">
                  <dt>Hand over by</dt>
                  <dd className="tabular-nums">{formatDeliveryDay(pkg.handoverDueOn)}</dd>
                </div>
              ) : null}
              {flags.length > 0 ? (
                <div className="ef-dl__row">
                  <dt>Note</dt>
                  <dd className="flex flex-wrap gap-x-3">
                    {flags.map((f) => (
                      <span key={f} className={f === "on_time" ? "text-muted-foreground" : "font-medium"}>
                        {PROMISE_FLAG_LABEL[f]}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <div />
          )}
          {pkg.handovers && pkg.handovers.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Hand-overs</div>
              <Timeline aria-label="Hand-overs">
                {pkg.handovers.map((h, i) => (
                  <TimelineItem
                    key={i}
                    icon={<StepIcon step={h.step} />}
                    tone={h.step === "deliver" ? "done" : "primary"}
                    title={
                      <>
                        {HANDOVER_STEP_WORDS[h.step]}
                        {h.parcelCode && bags.length > 1 ? (
                          <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                            {" "}
                            · {bagWord(bags, h.parcelCode)}
                          </span>
                        ) : null}
                      </>
                    }
                    time={clockAt(h.at)}
                  >
                    {byWords(h)} · <Badge variant="outline">{HANDOVER_METHOD_WORDS[h.method]}</Badge>
                    <span className="sr-only">
                      {" "}
                      {HANDOVER_STEP_WORDS[h.step]} · {HANDOVER_METHOD_WORDS[h.method]} · {byWords(h)}
                    </span>
                  </TimelineItem>
                ))}
              </Timeline>
            </div>
          ) : null}
        </div>
      ) : null}

      {pkg.handoff ? (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Handed over</dt>
          <dd className="tabular-nums">{formatDate(pkg.handoff.handedOverAt)}</dd>
          {pkg.handoff.carrierName ? (
            <>
              <dt className="text-muted-foreground">Carrier</dt>
              <dd>{pkg.handoff.carrierName}</dd>
            </>
          ) : null}
          {pkg.handoff.reference ? (
            <>
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="font-mono">{pkg.handoff.reference}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {pkg.arrival ? (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Arrived</dt>
          <dd className="tabular-nums">{formatDate(pkg.arrival.arrivedAt)}</dd>
          <dt className="text-muted-foreground">Recorded</dt>
          <dd>
            {pkg.arrival.source === "driver_proof"
              ? "By an Effy driver, with proof"
              : pkg.arrival.source === "staff_recorded"
                ? "By back-office"
                : "Reported by the carrier"}
          </dd>
        </dl>
      ) : null}

      {pkg.dueOut || pkg.late ? (
        <p className={`text-sm ${pkg.late ? "text-warning" : "text-muted-foreground"}`}>
          {pkg.dueOut
            ? `Due out ${new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Melbourne" }).format(new Date(pkg.dueOut))}`
            : "Pickup day has passed"}
          {pkg.late ? " — late" : ""}
        </p>
      ) : null}

      {orderId && pkg.deliveredBy === "courier" && (courierCollection !== null || pkg.consignment) ? (
        <ConsignmentBlock orderId={orderId} pkg={pkg} canRecord={canRecord} collection={courierCollection} />
      ) : null}

      {canRecord && action === "handoff" && courierCollection !== "supplier" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Carrier (optional)</span>
            <Input
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              className="w-44"
              placeholder="e.g. Australia Post"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Consignment reference (optional)</span>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-56"
              placeholder="Leave blank if none"
            />
          </label>
          <Button disabled={busy} onClick={() => onHandoff(pkg.fulfillmentId, reference, carrierName)}>
            Record handover
          </Button>
        </div>
      ) : null}

      {canRecord && action === "arrival" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy} onClick={() => onArrival(pkg.fulfillmentId)}>
            Record arrival
          </Button>
          <p className="text-sm text-muted-foreground">
            Only record this once you know the package reached the customer.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function BagTable({ bags, highlightParcelId }: { bags: AdminParcelDTO[]; highlightParcelId?: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">Bags</div>
      <Table className="rounded-lg border border-border [&_td]:py-2" aria-label="Bags">
        <TableHeader>
          <TableRow>
            <TableHead>Bag</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Zone</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Where</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bags.map((b) => (
            <TableRow
              key={b.parcelId}
              id={`parcel-${b.parcelId}`}
              className={
                b.parcelId === highlightParcelId
                  ? "bg-primary-muted font-medium"
                  : b.voided
                    ? "text-muted-foreground"
                    : ""
              }
              aria-current={b.parcelId === highlightParcelId ? "true" : undefined}
            >
              <TableCell className="tabular-nums">{b.voided ? <s>Bag {b.seq}</s> : `${b.seq} of ${b.of}`}</TableCell>
              <TableCell className="font-mono">{b.voided ? <s>{b.code}</s> : b.code}</TableCell>
              <TableCell>{PARCEL_ZONE_WORDS[b.zone]}</TableCell>
              <TableCell>
                {b.voided
                  ? "Removed"
                  : b.printedCount === 0
                    ? "Not printed"
                    : b.printedCount === 1
                      ? "Printed"
                      : `Printed ${b.printedCount}×`}
              </TableCell>
              <TableCell>{b.voided ? "—" : PARCEL_CUSTODY_WORDS[b.custody]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function bagWord(bags: AdminParcelDTO[], code: string): string {
  const b = bags.find((x) => x.code === code)
  return b ? `Bag ${b.seq}` : code
}

function byWords(h: AdminPackageHandoverDTO): string {
  if (h.actor === "shop_staff") return "Shop staff"
  if (h.actor === "admin_staff") return "Hub staff"
  return h.driverName ?? "Driver"
}

function StepIcon({ step }: { step: RecordedHandoverStep }) {
  const Icon =
    step === "deliver"
      ? CircleCheck
      : step === "checkin"
        ? Warehouse
        : step === "load"
          ? Truck
          : step === "return"
            ? Undo2
            : step === "pack"
              ? PackageCheck
              : Package
  return <Icon />
}

const HANDOVER_STEP_WORDS: Record<RecordedHandoverStep, string> = {
  pack: "Packed at the shop",
  courier_handover: "Handed to the courier",
  shop_pickup: "Collected from the shop",
  collect: "Collected",
  checkin: "Checked in at hub",
  load: "Loaded",
  deliver: "Delivered",
  return: "Returned to hub",
}
const HANDOVER_METHOD_WORDS: Record<HandoverMethod, string> = {
  scan: "scanned",
  typed: "code typed",
  manual: "by hand",
}
