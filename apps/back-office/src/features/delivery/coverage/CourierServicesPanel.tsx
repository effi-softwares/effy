import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { CourierServiceDTO, CourierServiceInput } from "@effy/shared-types";
import { Badge, Button, Checkbox, Input, Label } from "@effy/design-system/ui";

import { courierServiceError, courierServiceFieldErrors } from "../errorText";
import { courierServicesQuery, useCreateCourierService, useUpdateCourierService } from "../queries";

const WEEKDAYS = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"],
] as const;

export const weekdaysText = (days: number[]): string =>
  days.length === 7 ? "Every day" : WEEKDAYS.filter(([d]) => days.includes(d)).map(([, w]) => w).join(", ");

type Draft = Required<Omit<CourierServiceInput, "status" | "isDefault">>;
const EMPTY: Draft = {
  courierName: "", serviceName: "", estimateText: "", maxBusinessDays: 5, pickupWeekdays: [1, 2, 3, 4, 5],
  pickupCutoff: "14:00", collectsFromSupplier: false,
};

/**
 * The courier services Effy uses (080 US6), on the Coverage tab's courier section.
 *
 * ⚠ NOTHING IS SEEDED. A courier's name is a real-world identifier: the operator types it. Until one
 * service is active and the default, courier delivery cannot be switched on (`no_service`).
 *
 * ⚠ The DEFAULT's timeframe is what checkout tells a courier customer; an order keeps what it was told.
 * Its pickup days and cutoff decide when a parcel at the hub is due out — and when it is late.
 */
export function CourierServicesPanel({ canManage }: { canManage: boolean }) {
  const services = useQuery(courierServicesQuery());
  const create = useCreateCourierService();
  const update = useUpdateCourierService();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const items = services.data?.items ?? [];

  function open(s: CourierServiceDTO | null) {
    setError(null);
    setFields({});
    setEditing(s ? s.id : "new");
    setDraft(s ? {
      courierName: s.courierName, serviceName: s.serviceName, estimateText: s.estimateText, maxBusinessDays: s.maxBusinessDays,
      pickupWeekdays: s.pickupWeekdays, pickupCutoff: s.pickupCutoff, collectsFromSupplier: s.collectsFromSupplier,
    } : EMPTY);
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setFields({});
    try {
      await fn();
      setEditing(null);
    } catch (err) {
      setFields(courierServiceFieldErrors(err));
      setError(courierServiceError(err));
    }
  }

  const save = () => run(() =>
    editing === "new"
      ? create.mutateAsync({ ...draft, isDefault: items.every((s) => !s.isDefault) })
      : update.mutateAsync({ id: editing as string, body: draft }));
  const busy = create.isPending || update.isPending;

  return (
    <section className="space-y-3" aria-labelledby="courier-services">
      <div className="space-y-1">
        <h3 id="courier-services" className="text-sm font-medium">Courier services</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The courier services Effy books. Checkout tells a courier customer the default's timeframe; each service's pickup days decide when a parcel at the hub is due out.
        </p>
      </div>

      {services.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="courier-services-empty">
          No courier services yet. Add the one Effy uses — courier delivery can't be switched on until there is a default.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" data-testid="courier-services">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Customers are told</th>
                <th className="px-3 py-2 font-medium">Pickups</th>
                <th className="px-3 py-2 font-medium">From suppliers</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {canManage ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((s) => (
                <tr key={s.id} className={s.status === "retired" ? "text-muted-foreground" : undefined}>
                  <td className="px-3 py-2">
                    {s.courierName} · {s.serviceName}
                    {s.isDefault ? <Badge variant="secondary" className="ml-2">Default</Badge> : null}
                  </td>
                  <td className="px-3 py-2">{s.estimateText}</td>
                  <td className="px-3 py-2 tabular-nums">{weekdaysText(s.pickupWeekdays)}, by {s.pickupCutoff}</td>
                  <td className="px-3 py-2">{s.collectsFromSupplier ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{s.status === "active" ? "Active" : "Retired"}</td>
                  {canManage ? (
                    <td className="space-x-1 px-3 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => open(s)}>Edit</Button>
                      {!s.isDefault && s.status === "active" ? (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => update.mutateAsync({ id: s.id, body: { isDefault: true } }))}>
                          Make default
                        </Button>
                      ) : null}
                      {!s.isDefault ? (
                        <Button variant="ghost" size="sm" disabled={busy}
                          onClick={() => void run(() => update.mutateAsync({ id: s.id, body: { status: s.status === "active" ? "retired" : "active" } }))}>
                          {s.status === "active" ? "Retire" : "Reinstate"}
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && editing === null ? (
        <Button variant="outline" size="sm" onClick={() => open(null)}>Add a courier service</Button>
      ) : null}

      {canManage && editing !== null ? (
        <form className="space-y-3 border-t pt-3" aria-label={editing === "new" ? "New courier service" : "Edit courier service"}
          onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="flex flex-wrap items-start gap-3">
            <Field id="cs-courier" label="Courier" error={fields.courierName}>
              <Input id="cs-courier" className="w-48" value={draft.courierName} onChange={(e) => setDraft({ ...draft, courierName: e.target.value })} />
            </Field>
            <Field id="cs-service" label="Service" error={fields.serviceName}>
              <Input id="cs-service" className="w-48" placeholder="Parcel" value={draft.serviceName} onChange={(e) => setDraft({ ...draft, serviceName: e.target.value })} />
            </Field>
            <Field id="cs-estimate" label="Customers are told it usually arrives in" error={fields.estimateText}>
              <Input id="cs-estimate" className="w-56" placeholder="2–4 business days" maxLength={60} value={draft.estimateText}
                onChange={(e) => setDraft({ ...draft, estimateText: e.target.value })} />
            </Field>
            <Field id="cs-max" label="Late after (business days)" error={fields.maxBusinessDays}>
              <Input id="cs-max" type="number" min={1} max={30} className="w-24" value={draft.maxBusinessDays}
                onChange={(e) => setDraft({ ...draft, maxBusinessDays: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Pickup days</legend>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map(([d, w]) => (
                  <label key={d} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={draft.pickupWeekdays.includes(d)} onCheckedChange={(on) => setDraft({
                      ...draft,
                      pickupWeekdays: on === true ? [...draft.pickupWeekdays, d].sort() : draft.pickupWeekdays.filter((x) => x !== d),
                    })} />
                    {w}
                  </label>
                ))}
              </div>
              {fields.pickupWeekdays ? <p className="text-sm text-destructive">{fields.pickupWeekdays}</p> : null}
            </fieldset>
            <Field id="cs-cutoff" label="Pickup by" error={fields.pickupCutoff}>
              <Input id="cs-cutoff" type="time" className="w-28" value={draft.pickupCutoff} onChange={(e) => setDraft({ ...draft, pickupCutoff: e.target.value })} />
            </Field>
            <label className="flex items-center gap-1.5 self-end pb-2 text-sm">
              <Checkbox checked={draft.collectsFromSupplier} onCheckedChange={(on) => setDraft({ ...draft, collectsFromSupplier: on === true })} />
              Collects from suppliers
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{editing === "new" ? "Add" : "Save"}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
