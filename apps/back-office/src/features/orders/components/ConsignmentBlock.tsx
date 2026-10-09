import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { ConsignmentDTO, ConsignmentEventInput, ConsignmentState } from "@effy/shared-types";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui";

import { courierServicesQuery } from "../../delivery/queries";
import { consignmentError } from "../errorText";
import type { OrderPackage } from "../model";
import { useConsignmentStep, useSaveConsignment } from "../queries";
import { uploadConsignmentLabel } from "../repo";

/** What a person reads for each state. */
export const CONSIGNMENT_STATE_LABEL: Record<ConsignmentState, string> = {
  booked: "Booked",
  handed_over: "With the courier",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Delivery failed",
  lost: "Lost",
  damaged: "Damaged",
  returned: "Returned to sender",
  cancelled: "Cancelled",
};

/** The steps a person may record from each state — the same rules the server enforces. */
export function nextSteps(state: ConsignmentState | null): ConsignmentEventInput["kind"][] {
  if (state === "booked") return ["cancelled"];
  if (state === "handed_over" || state === "in_transit") {
    return [...(state === "handed_over" ? (["in_transit"] as const) : []), "delivered", "failed", "lost", "damaged", "returned"];
  }
  if (state === "failed" || state === "lost" || state === "damaged" || state === "returned") return ["resolved", "delivered"];
  return [];
}

const STEP_LABEL: Record<ConsignmentEventInput["kind"], string> = {
  handed_over: "Handed over", in_transit: "In transit", delivered: "Delivered", failed: "Delivery failed",
  lost: "Lost", damaged: "Damaged", returned: "Returned to sender", resolved: "Resolved", cancelled: "Cancel booking",
};

/**
 * One courier parcel's consignment, on the order page (080 US1, US5).
 *
 * ⚠ ROWS, NOT A CARD (Principle V): what was booked, where it is, and the steps — then the controls.
 * Booking is manual in this feature: staff book with the courier outside the platform and record the
 * service, reference, tracking link and label here.
 *
 * ⚠ The label carries the customer's address. It is uploaded straight to private storage and read
 * back only through a short-lived link.
 */
export function ConsignmentBlock({ orderId, pkg, canRecord, collection }: {
  orderId: string;
  pkg: OrderPackage;
  canRecord: boolean;
  collection: "hub" | "supplier" | null;
}) {
  const c: ConsignmentDTO | null = pkg.consignment;
  const save = useSaveConsignment(orderId);
  const step = useConsignmentStep(orderId);
  const services = useQuery({ ...courierServicesQuery(), enabled: canRecord });
  const [editing, setEditing] = useState(false);
  const [serviceId, setServiceId] = useState(c?.service.id ?? "");
  const [reference, setReference] = useState(c?.reference ?? "");
  const [trackingUrl, setTrackingUrl] = useState(c?.trackingUrl ?? "");
  const [pickupDate, setPickupDate] = useState(c?.pickup?.date ?? "");
  const [pickupFrom, setPickupFrom] = useState(c?.pickup?.from ?? "");
  const [pickupTo, setPickupTo] = useState(c?.pickup?.to ?? "");
  const [label, setLabel] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supplier = (c?.collection ?? collection) === "supplier";
  const handedOver = c !== null && c.state !== "booked";
  const choosable = (services.data?.items ?? []).filter((s) => s.status === "active" && (!supplier || s.collectsFromSupplier));

  async function book() {
    setError(null);
    setBusy(true);
    try {
      const labelKey = label ? await uploadConsignmentLabel(pkg.fulfillmentId, label) : undefined;
      await save.mutateAsync({
        fulfillmentId: pkg.fulfillmentId,
        body: {
          serviceId, reference: reference || null, trackingUrl: trackingUrl || null, labelKey,
          pickup: supplier && pickupDate ? { date: pickupDate, from: pickupFrom || null, to: pickupTo || null } : null,
        },
      });
      setEditing(false);
      setLabel(null);
    } catch (err) {
      setError(consignmentError(err));
    } finally {
      setBusy(false);
    }
  }

  async function record(kind: ConsignmentEventInput["kind"]) {
    setError(null);
    try {
      await step.mutateAsync({ fulfillmentId: pkg.fulfillmentId, body: { kind, note: note || null } });
      setNote("");
    } catch (err) {
      setError(consignmentError(err));
    }
  }

  return (
    <div className="space-y-2 border-t pt-3" data-testid="consignment">
      <p className="text-sm font-medium">Courier consignment</p>
      {c ? (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Service</dt>
          <dd>{c.service.label}</dd>
          <dt className="text-muted-foreground">Where it is</dt>
          <dd>{CONSIGNMENT_STATE_LABEL[c.state]}</dd>
          <dt className="text-muted-foreground">Reaches the courier</dt>
          <dd>{c.collection === "supplier" ? "Picked up from the supplier" : "Via the hub"}</dd>
          {c.pickup ? (
            <>
              <dt className="text-muted-foreground">Pickup</dt>
              <dd className="tabular-nums">{c.pickup.date}{c.pickup.from ? `, ${c.pickup.from}–${c.pickup.to}` : ""}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="font-mono">{c.reference ?? <span className="font-sans text-muted-foreground">None recorded</span>}</dd>
          {c.trackingUrl ? (
            <>
              <dt className="text-muted-foreground">Tracking</dt>
              <dd><a className="text-primary hover:underline" href={c.trackingUrl} target="_blank" rel="noreferrer">Open tracking</a></dd>
            </>
          ) : null}
          {c.labelUrl ? (
            <>
              <dt className="text-muted-foreground">Label</dt>
              <dd><a className="text-primary hover:underline" href={c.labelUrl} target="_blank" rel="noreferrer">Open label</a></dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          {supplier ? "Not booked yet — the supplier sees that a courier pickup is being arranged." : "Not booked yet. Recording the handover at the hub books it with the order's courier service."}
        </p>
      )}

      {c && c.events.length > 0 ? (
        <ol className="space-y-0.5 text-sm text-muted-foreground" aria-label="Consignment history">
          {c.events.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="tabular-nums">{new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(e.at))}</span>
              {" · "}{STEP_LABEL[e.kind as ConsignmentEventInput["kind"]] ?? "Booked"}
              {e.actor.kind === "shop" ? " (supplier)" : ""}
              {e.note ? ` — ${e.note}` : ""}
            </li>
          ))}
        </ol>
      ) : null}

      {canRecord && (editing || !c) && !(c && handedOver && !editing) ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`svc-${pkg.fulfillmentId}`}>Courier service</Label>
            <Select value={serviceId} onValueChange={setServiceId} disabled={handedOver}>
              <SelectTrigger id={`svc-${pkg.fulfillmentId}`} className="w-60" aria-label="Courier service">
                <SelectValue placeholder="Choose a service" />
              </SelectTrigger>
              <SelectContent>
                {choosable.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.courierName} · {s.serviceName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ref-${pkg.fulfillmentId}`}>Reference (optional)</Label>
            <Input id={`ref-${pkg.fulfillmentId}`} className="w-44" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`trk-${pkg.fulfillmentId}`}>Tracking link (optional)</Label>
            <Input id={`trk-${pkg.fulfillmentId}`} className="w-64" placeholder="https://…" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
          </div>
          {supplier && !handedOver ? (
            <>
              <div className="space-y-1">
                <Label htmlFor={`day-${pkg.fulfillmentId}`}>Pickup day</Label>
                <Input id={`day-${pkg.fulfillmentId}`} type="date" className="w-40" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`from-${pkg.fulfillmentId}`}>From</Label>
                <Input id={`from-${pkg.fulfillmentId}`} type="time" className="w-28" value={pickupFrom} onChange={(e) => setPickupFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`to-${pkg.fulfillmentId}`}>To</Label>
                <Input id={`to-${pkg.fulfillmentId}`} type="time" className="w-28" value={pickupTo} onChange={(e) => setPickupTo(e.target.value)} />
              </div>
            </>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor={`label-${pkg.fulfillmentId}`}>Label (PDF or PNG)</Label>
            <Input id={`label-${pkg.fulfillmentId}`} type="file" accept="application/pdf,image/png" className="w-56"
              onChange={(e) => setLabel(e.target.files?.[0] ?? null)} />
          </div>
          <Button disabled={busy || serviceId === ""} onClick={() => void book()}>{c ? "Save" : "Book"}</Button>
          {c ? <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button> : null}
        </div>
      ) : null}

      {canRecord && c && !editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit booking</Button>
          {nextSteps(c.state).length > 0 ? (
            <>
              <Input aria-label="Note (optional)" placeholder="Note (optional)" className="w-56" value={note} onChange={(e) => setNote(e.target.value)} />
              {nextSteps(c.state).map((k) => (
                <Button key={k} variant={k === "cancelled" ? "ghost" : "outline"} size="sm" disabled={step.isPending} onClick={() => void record(k)}>
                  {STEP_LABEL[k]}
                </Button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
