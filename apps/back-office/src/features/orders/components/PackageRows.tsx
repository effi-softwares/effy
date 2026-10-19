import { useState } from "react";

import type { HandoverMethod, HandoverStep, OrderAssignment } from "@effy/shared-types";
import { AssignmentLine } from "./AssignmentLine";
import { ConsignmentBlock } from "./ConsignmentBlock";
import { PackageStatusPill } from "@effy/web-kit/console";
import { Button, Input } from "@effy/design-system/ui";
import { CircleCheck, Package, Store, Truck, Undo2, Warehouse } from "lucide-react";

import { clockAt } from "@/lib/format";

import type { OrderPackage } from "../model";
import {
  nextActionFor, packageDeliveryText, PROMISE_FLAG_LABEL, promiseFlagsFor, promiseTextFor,
  formatDeliveryDay,
} from "../model";

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

/** 073 — the Assign to… / Unassign controls for one stage of one package; absent for a CSA. */
export type AssignmentActions = (
  pkg: OrderPackage,
  stage: "collection" | "delivery",
  assignment: OrderAssignment,
) => React.ReactNode;

interface Props {
  /** 080 — the order, and how its courier parcels reach the courier (null unless a courier delivers). */
  orderId?: string;
  courierCollection?: "hub" | "supplier" | null;
  renderActions?: AssignmentActions;
  packages: OrderPackage[];
  canRecord: boolean;
  busy: boolean;
  onHandoff(fulfillmentId: string, reference: string, carrierName: string): void;
  onArrival(fulfillmentId: string): void;
}

export function PackageRows({ packages, canRecord, busy, onHandoff, onArrival, renderActions, orderId, courierCollection = null }: Props) {
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
        />
      ))}
      {packages.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
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
  renderActions,
  orderId,
  courierCollection,
}: {
  orderId?: string;
  courierCollection: "hub" | "supplier" | null;
  renderActions?: AssignmentActions;
  pkg: OrderPackage;
  canRecord: boolean;
  busy: boolean;
  onHandoff(fulfillmentId: string, reference: string, carrierName: string): void;
  onArrival(fulfillmentId: string): void;
}) {
  const [reference, setReference] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const action = nextActionFor(pkg);
  const promise = promiseTextFor(pkg);
  const flags = promiseFlagsFor(pkg);

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bo-icon-tile" aria-hidden="true">
            <Store />
          </span>
          <div className="min-w-0">
            <div className="font-semibold">{pkg.shopName}</div>
            <div className="bo-sub">
              {/* 089 — the code on the package's label; what a driver will scan. */}
              {pkg.packageCode ? (
                <>
                  <span className="bo-code" aria-label="Package code">
                    {pkg.packageCode}
                  </span>{" "}
                  ·{" "}
                </>
              ) : null}
              {pkg.itemCount} item{pkg.itemCount === 1 ? "" : "s"} · {packageDeliveryText(pkg)}
            </div>
          </div>
        </div>
        {/* 073 — where it REALLY is, from the shared derivation; the old guess from the shop's status
            said "At hub" the moment a driver picked a package up. */}
        {pkg.statusView ? <PackageStatusPill view={pkg.statusView} icons /> : null}
      </div>

      {/* 073 — who has it. One row per stage; nothing when the stage has nothing to say yet. */}
      {pkg.collect || pkg.deliver ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {pkg.collect ? (
            <AssignmentLine label="Collect" assignment={pkg.collect} actions={renderActions?.(pkg, "collection", pkg.collect)} />
          ) : null}
          {pkg.deliver ? (
            <AssignmentLine label="Deliver" assignment={pkg.deliver} actions={renderActions?.(pkg, "delivery", pkg.deliver)} />
          ) : null}
        </div>
      ) : null}

      {promise || (pkg.handovers && pkg.handovers.length > 0) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {/*
            069 — what the customer was promised. ⚠ Rendered ONLY when there is a promise: an order
            placed before 069 was promised no day, and a "Promised: —" row would read as data that went
            missing rather than data that never existed.
          */}
          {promise ? (
            <dl className="bo-dl bo-dl--tight">
              <div className="bo-dl__row">
                <dt>Promised</dt>
                <dd className="tabular-nums">{promise}</dd>
              </div>
              {pkg.handoverDueOn && !pkg.handoff ? (
                <div className="bo-dl__row">
                  <dt>Hand over by</dt>
                  <dd className="tabular-nums">{formatDeliveryDay(pkg.handoverDueOn)}</dd>
                </div>
              ) : null}
              {flags.length > 0 ? (
                <div className="bo-dl__row">
                  <dt>Note</dt>
                  {/* ⚠ WORDS, never colour alone. */}
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
          {/* 091 — how it was handed over at each step, as recorded. Nothing is shown — never "by hand"
              by assumption — when nothing was recorded. */}
          {pkg.handovers && pkg.handovers.length > 0 ? (
            <div>
              <div className="bo-eyebrow mb-2">Hand-overs</div>
              <ol className="bo-tl" aria-label="Hand-overs">
                {pkg.handovers.map((h, i) => (
                  <li key={i} className="bo-tl__item pb-2.5">
                    <span className={`bo-tl__mark ${h.step === "deliver" ? "bo-tl__mark--done" : "bo-tl__mark--primary"}`} aria-hidden="true">
                      <StepIcon step={h.step} />
                    </span>
                    <div>
                      <div className="text-sm font-medium">{HANDOVER_STEP_WORDS[h.step]}</div>
                      <div className="bo-tl__body">
                        {h.driverName} · <span className="bo-tag">{HANDOVER_METHOD_WORDS[h.method]}</span>
                        <span className="sr-only">
                          {" "}
                          {HANDOVER_STEP_WORDS[h.step]} · {HANDOVER_METHOD_WORDS[h.method]} · {h.driverName}
                        </span>
                      </div>
                    </div>
                    <span className="bo-tl__time">{clockAt(h.at)}</span>
                  </li>
                ))}
              </ol>
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

      {/* 080 — when it is due out by its courier service's next pickup, and whether that has gone. */}
      {pkg.dueOut || pkg.late ? (
        <p className={`text-sm ${pkg.late ? "text-warning" : "text-muted-foreground"}`}>
          {pkg.dueOut
            ? `Due out ${new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Melbourne" }).format(new Date(pkg.dueOut))}`
            : "Pickup day has passed"}
          {pkg.late ? " — late" : ""}
        </p>
      ) : null}

      {/* 080 — a courier order sold since courier services: its consignment. */}
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

/** 091 — the hand-over's step and method, in staff words. */
function StepIcon({ step }: { step: HandoverStep }) {
  const Icon = step === "deliver" ? CircleCheck : step === "checkin" ? Warehouse : step === "load" ? Truck : step === "return" ? Undo2 : Package;
  return <Icon />;
}

const HANDOVER_STEP_WORDS: Record<HandoverStep, string> = {
  collect: "Collected",
  checkin: "Checked in at hub",
  load: "Loaded",
  deliver: "Delivered",
  return: "Returned to hub",
};
const HANDOVER_METHOD_WORDS: Record<HandoverMethod, string> = {
  scan: "scanned",
  typed: "code typed",
  manual: "by hand",
};
