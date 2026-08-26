import { useState } from "react";

import { Button, Input } from "@effy/design-system/ui";

import type { OrderPackage } from "../model";
import { nextActionFor, packagePositionFor } from "../model";

/**
 * One row per package — a detail row, NOT a card (Principle V).
 *
 * ⚠ THE CARD INSTINCT IS STRONGEST HERE. Each package has a shop, a status, a count, a subtotal, a
 * handover and an arrival — six facts that beg to be tiled in a bordered box. Rows keep them
 * scannable down a column, which is what an operator comparing three packages actually does.
 */

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

interface Props {
  packages: OrderPackage[];
  canRecord: boolean;
  busy: boolean;
  onHandoff(fulfillmentId: string, reference: string, carrierName: string): void;
  onArrival(fulfillmentId: string): void;
}

export function PackageRows({ packages, canRecord, busy, onHandoff, onArrival }: Props) {
  return (
    <div className="divide-y rounded-lg border">
      {packages.map((pkg) => (
        <PackageRow
          key={pkg.fulfillmentId}
          pkg={pkg}
          canRecord={canRecord}
          busy={busy}
          onHandoff={onHandoff}
          onArrival={onArrival}
        />
      ))}
      {packages.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          This order has no packages yet.
        </p>
      ) : null}
    </div>
  );
}

function PackageRow({
  pkg,
  canRecord,
  busy,
  onHandoff,
  onArrival,
}: {
  pkg: OrderPackage;
  canRecord: boolean;
  busy: boolean;
  onHandoff(fulfillmentId: string, reference: string, carrierName: string): void;
  onArrival(fulfillmentId: string): void;
}) {
  const [reference, setReference] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const action = nextActionFor(pkg);

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="space-y-0.5">
          <p className="font-medium">{pkg.shopName}</p>
          <p className="text-sm text-muted-foreground">
            {pkg.itemCount} item{pkg.itemCount === 1 ? "" : "s"} ·{" "}
            {pkg.deliveryMethod === "same_day" ? "Same-day" : "Standard"}
          </p>
        </div>
        <p className="text-sm font-medium">{packagePositionFor(pkg)}</p>
      </div>

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
          {/*
            ⚠ FR-003 / SC-009. When there is NO reference, this block renders NOTHING — no row, no
            dash, no "(not recorded)", no warning styling. Effy has no carrier contract, so most
            handovers genuinely have none, and a handover without one is a COMPLETE record. An empty
            state that looks like missing data is how an operator starts chasing a number that was
            never going to exist.
          */}
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

      {canRecord && action === "handoff" ? (
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
            {/* ⚠ Labelled OPTIONAL in the UI, not merely permitted by the API. */}
            <span className="text-muted-foreground">Consignment reference (optional)</span>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-56"
              placeholder="Leave blank if none"
            />
          </label>
          <Button
            disabled={busy}
            onClick={() => onHandoff(pkg.fulfillmentId, reference, carrierName)}
          >
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
  );
}
