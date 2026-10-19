import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { CourierView, HandoverRowDTO } from "@effy/shared-types";
import { CircleAlert, CircleCheck, Clock, Forward, PackageOpen, Settings2, Store, Truck, Warehouse } from "lucide-react";

import { cn } from "@effy/design-system";
import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { EmptyState } from "@/components/patterns/States";
import { StatusWord } from "@/components/patterns/StatusWord";

import { CONSIGNMENT_STATE_LABEL } from "./components/ConsignmentBlock";
import { courierParcelsQuery } from "./queries";

/**
 * Courier parcels (080): everything a courier takes that is not finished, in five views.
 *
 *   At the hub, due   collected (or still to collect), not handed over, due by the next pickup
 *   At the hub, late  the pickup it was due for has gone
 *   Supplier pickups  a courier collects from the supplier — booked or still to arrange
 *   With the courier  handed over, not delivered; overdue first
 *   Problems          failed, lost, damaged or returned, until resolved
 *
 * ⚠ A TABLE WITH VIEWS, NO METRIC TILES (Principle V). Read-only for every role; bookings and steps
 * are recorded on the order.
 */
const VIEWS: { value: CourierView; label: string; empty: string }[] = [
  { value: "hub_due", label: "At the hub", empty: "No courier parcels are waiting at the hub." },
  { value: "hub_late", label: "Late at the hub", empty: "Nothing has missed its pickup." },
  { value: "supplier", label: "Supplier pickups", empty: "No pickups from suppliers are waiting." },
  { value: "with_courier", label: "With the courier", empty: "Nothing is with a courier right now." },
  { value: "problems", label: "Problems", empty: "No problems reported." },
];

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Melbourne" }).format(new Date(iso));

/**
 * Courier parcels (080; redesign, board "Courier parcels"): parcels a courier takes to customers
 * outside Effy's area, by stage. Open an order to book its consignment and record each step.
 */
export function CourierScreen() {
  const [view, setView] = useState<CourierView>("hub_due");
  const { data, error, isPending, isError, refetch } = useQuery(courierParcelsQuery(view));
  const current = VIEWS.find((v) => v.value === view)!;
  return (
    <>
      <PageHeader
        title="Courier parcels"
        description="Parcels a courier takes to customers outside Effy's area. Open an order to book its consignment and record each step."
        actions={
          <Button variant="outline" asChild>
            <Link to="/delivery" search={{ tab: "coverage" }}>
              <Settings2 aria-hidden="true" />
              Courier services
            </Link>
          </Button>
        }
      />
      <div className="bo-tabs" role="tablist" aria-label="Courier stages">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={v.value === view}
            className={cn("bo-tabs__tab", v.value === view && "is-active")}
            onClick={() => setView(v.value)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="bo-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Truck} title={current.empty} />
      ) : (
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Courier service</th>
                  <th>Due</th>
                  <th>Where it is</th>
                  <th>
                    <span className="sr-only">Late</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.fulfillmentId}>
                    <td data-m="primary">
                      <Link to="/orders/$orderId" params={{ orderId: r.orderId }} className="bo-link bo-code">
                        {r.orderNumber}
                      </Link>
                    </td>
                    <td data-m="meta">{r.service ?? <span className="text-muted-foreground">Not set</span>}</td>
                    <td data-m="meta" data-label="Due" className="whitespace-nowrap">
                      {dueText(r)}
                    </td>
                    <td data-m="badge">{whereWord(r)}</td>
                    <td data-m="meta">
                      {r.atRisk ? (
                        <span className="bo-late">
                          <Clock aria-hidden="true" />
                          Late
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bo-pager">
            <span>
              {data.length} {data.length === 1 ? "parcel" : "parcels"} · {current.label}
            </span>
            <span>Labels open through a short-lived link — never shared publicly</span>
          </div>
        </div>
      )}
    </>
  );
}

function dueText(r: HandoverRowDTO) {
  if (r.pickup) return <span className="tabular-nums">Pickup {r.pickup.date}{r.pickup.from ? `, ${r.pickup.from}–${r.pickup.to}` : ""}</span>;
  if (r.collection === "supplier") return <span className="text-muted-foreground">Pickup to arrange</span>;
  return <span className="tabular-nums">{r.dueOut ? when(r.dueOut) : r.handoverDueOn}</span>;
}

/** Where the parcel is, in one word with its tone: with the courier → blue, a problem → black. */
function whereWord(r: HandoverRowDTO) {
  if (r.consignmentState) {
    const problem = ["failed", "lost", "damaged", "returned"].includes(r.consignmentState);
    const done = r.consignmentState === "delivered";
    return (
      <StatusWord tone={problem ? "problem" : done ? "done" : "moving"} icon={problem ? CircleAlert : done ? CircleCheck : Forward}>
        {CONSIGNMENT_STATE_LABEL[r.consignmentState]}
      </StatusWord>
    );
  }
  if (r.collection === "supplier") return <StatusWord tone="waiting" icon={Store}>At the supplier</StatusWord>;
  return r.atHub ? (
    <StatusWord tone="moving" icon={Warehouse}>
      At the hub
    </StatusWord>
  ) : (
    <StatusWord tone="muted" icon={PackageOpen}>
      Not at the hub yet
    </StatusWord>
  );
}
