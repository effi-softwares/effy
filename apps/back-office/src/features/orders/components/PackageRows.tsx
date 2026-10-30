import { useState } from "react"

import { PARCEL_CUSTODY_WORDS, PARCEL_ZONE_WORDS, type AdminParcelDTO, type OrderAssignment } from "@effy/shared-types"
import { AssignmentLine } from "./AssignmentLine"
import { ConsignmentBlock } from "./ConsignmentBlock"
import { PackageJourney } from "./PackageJourney"
import { PackageStatusPill } from "@effy/web-kit/console"
import { Button, Input } from "@effy/design-system/ui"
import { Box, Snowflake, Store, Thermometer } from "lucide-react"

import {
  type OrderPackage,
  journeyOf,
  nextActionFor,
  packageDeliveryText,
  PROMISE_FLAG_LABEL,
  promiseFlagsFor,
  promiseTextFor,
  formatDeliveryDay,
} from "../model"

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-"
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
    <div className="divide-y divide-border [&>*:first-child]:pt-0">
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
        <p className="text-sm text-muted-foreground">This order has no packages yet.</p>
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
      className={`grid scroll-mt-20 gap-6 py-7 ${lit ? "ef-flash" : ""}`}
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

      <PackageJourney steps={journeyOf(pkg, courierCollection)} />

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

      {bags.length > 0 ? <BagList bags={bags} highlightParcelId={highlight?.parcelId} /> : null}

      {/* Its hand-overs, bag by bag, are in the order's activity (104). */}
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
          {pkg.late ? " - late" : ""}
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

const ZONE_ICON = { ambient: Box, chilled: Thermometer, frozen: Snowflake } as const

/** Its bags: each with its code, its temperature, whether its label is printed, and where it is. */
function BagList({ bags, highlightParcelId }: { bags: AdminParcelDTO[]; highlightParcelId?: string }) {
  return (
    <ul aria-label="Bags" className="m-0 list-none divide-y divide-border overflow-hidden rounded-lg border p-0">
      {bags.map((b) => {
        const Zone = ZONE_ICON[b.zone]
        const lit = b.parcelId === highlightParcelId
        return (
          <li
            key={b.parcelId}
            id={`parcel-${b.parcelId}`}
            aria-current={lit ? "true" : undefined}
            className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 ${lit ? "bg-primary-muted" : ""} ${b.voided ? "text-muted-foreground" : ""}`}
          >
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
              <Zone />
            </span>
            <span className="min-w-0">
              <span className="block font-medium tabular-nums">
                {b.voided ? <s>Bag {b.seq}</s> : `${b.seq} of ${b.of}`} · {PARCEL_ZONE_WORDS[b.zone]}
              </span>
              <span className="block text-[13px] text-muted-foreground">
                {b.voided
                  ? "Removed"
                  : b.printedCount === 0
                    ? "Not printed"
                    : b.printedCount === 1
                      ? "Printed"
                      : `Printed ${b.printedCount}×`}
              </span>
            </span>
            <span className="flex items-center gap-3 text-[13px]">
              <span className="font-mono">{b.voided ? <s>{b.code}</s> : b.code}</span>
              <span className="text-muted-foreground">{b.voided ? "—" : PARCEL_CUSTODY_WORDS[b.custody]}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
