import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { DeliveryDaysDTO } from "@effy/shared-types";
import { Button, Input, Label } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { deliveryMutationError, fieldErrors, HUB_NOT_SET } from "../errorText";
import {
  deliveryDaysQuery, useAddNonDeliveryDate, usePutDeliveryDays, useRemoveNonDeliveryDate,
} from "../queries";

const WEEKDAYS = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"],
] as const;

/**
 * Which days Effy delivers, how far ahead a customer may choose, and the timings the window rules
 * rest on (069, 078).
 *
 * ⚠ THE HUB TURNAROUND IS AN ASSUMPTION, AND THE SCREEN SAYS SO. It has never been measured — there
 * is no timed round — and it decides what a customer is offered today, so it is labelled an estimate
 * rather than presented as a fact an operator might assume someone verified.
 *
 * Sectioned rows and a list — no cards (Principle V).
 */
export function DeliveryDaysPanel({ canManage }: { canManage: boolean }) {
  const days = useQuery(deliveryDaysQuery());

  if (days.isError) return <ErrorState error={days.error} onRetry={() => void days.refetch()} />;
  if (days.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-10">
      <SettingsForm value={days.data} canManage={canManage} />
      <ClosedDates value={days.data} canManage={canManage} />
    </div>
  );
}

function SettingsForm({ value, canManage }: { value: DeliveryDaysDTO; canManage: boolean }) {
  const save = usePutDeliveryDays();
  const [effyLookahead, setEffyLookahead] = useState(String(value.effyLookaheadDays));
  const [closed, setClosed] = useState<number[]>(value.noDeliveryWeekdays);
  const [hold, setHold] = useState(String(value.slotHoldMin));
  const [turnaround, setTurnaround] = useState(String(value.hubTurnaroundMin));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The server's values replace the form's after a save or a refetch.
  useEffect(() => {
    setEffyLookahead(String(value.effyLookaheadDays));
    setClosed(value.noDeliveryWeekdays);
    setHold(String(value.slotHoldMin));
    setTurnaround(String(value.hubTurnaroundMin));
  }, [value]);

  function toggle(day: number) {
    setSaved(false);
    setClosed((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({
        effyLookaheadDays: Number(effyLookahead),
        noDeliveryWeekdays: closed,
        slotHoldMin: Number(hold),
        hubTurnaroundMin: Number(turnaround),
      });
      setSaved(true);
    } catch (err) {
      const named = fieldErrors(err);
      setErrors(named);
      if (Object.keys(named).length === 0) setError(deliveryMutationError(err, HUB_NOT_SET));
    }
  }

  const number = (id: string, label: string, hint: string, v: string, set: (s: string) => void) => (
    <div className="space-y-2">
      <Label htmlFor={`days-${id}`}>{label}</Label>
      <Input
        id={`days-${id}`}
        className="w-28"
        inputMode="numeric"
        value={v}
        disabled={!canManage}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={`days-${id}-hint`}
        onChange={(e) => {
          setSaved(false);
          set(e.target.value);
        }}
      />
      <p id={`days-${id}-hint`} className={errors[id] ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {errors[id] ?? hint}
      </p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Delivery days</h2>
        {number(
          "effyLookaheadDays",
          "Days offered after today",
          "A customer chooses a delivery window today or on this many delivery days after it. Days with no delivery are skipped and don't count.",
          effyLookahead,
          setEffyLookahead,
        )}

        <fieldset disabled={!canManage}>
          <legend className="text-sm font-medium">No delivery on</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map(([day, name]) => {
              const pressed = closed.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => toggle(day)}
                  className={
                    "min-h-9 rounded-md border px-3 text-sm font-medium transition-colors " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 " +
                    (pressed ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
          {errors.noDeliveryWeekdays ? (
            <p className="mt-2 text-sm text-destructive">{errors.noDeliveryWeekdays}</p>
          ) : null}
        </fieldset>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-base font-semibold">Timings</h2>
        {number(
          "hubTurnaroundMin",
          "Hub turnaround (minutes)",
          "Estimate — not yet timed. Collection run to ready to leave the hub. A window today is offered only while a run can still make it.",
          turnaround,
          setTurnaround,
        )}
        {number(
          "slotHoldMin",
          "Hold a place in a window for (minutes)",
          "From when a customer continues to payment. An unpaid place is offered to others after this.",
          hold,
          setHold,
        )}
      </section>

      {canManage ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
          {saved ? (
            <p role="status" className="text-sm text-muted-foreground">
              Saved. The next checkout uses these.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

function ClosedDates({ value, canManage }: { value: DeliveryDaysDTO; canManage: boolean }) {
  const add = useAddNonDeliveryDate();
  const remove = useRemoveNonDeliveryDate();
  const [day, setDay] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const added = await add.mutateAsync({ day, label: label.trim() || null });
      setDay("");
      setLabel("");
      // ⚠ FR-043: said plainly. Closing a date moves no placed order — the customer was promised that
      // day and paid for it — so the operator has to know there are orders to deal with.
      if (added.affectedOrders > 0) {
        setNotice(
          `${added.affectedOrders} placed ${added.affectedOrders === 1 ? "order is" : "orders are"} already promised ${added.day}. ` +
            "They have not been changed.",
        );
      }
    } catch (err) {
      setError(fieldErrors(err).day ?? deliveryMutationError(err));
    }
  }

  return (
    <section className="space-y-4 border-t pt-6">
      <h2 className="text-base font-semibold">Dates with no delivery</h2>
      {value.dates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dates are closed.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {value.dates.map((d) => (
            <li key={d.day} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-mono font-medium tabular-nums">{d.day}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label ?? ""}</span>
              {d.affectedOrders > 0 ? (
                <span className="text-warning">
                  {d.affectedOrders} placed {d.affectedOrders === 1 ? "order" : "orders"}
                </span>
              ) : null}
              {canManage ? (
                <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => void remove.mutateAsync(d.day)}>
                  Reopen
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={submit} className="flex items-end gap-2" noValidate>
          <div className="space-y-2">
            <Label htmlFor="closed-day">Date</Label>
            <Input id="closed-day" type="date" className="w-44" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="closed-label">Reason (optional)</Label>
            <Input id="closed-label" placeholder="Public holiday" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button type="submit" disabled={add.isPending || !day}>
            Close date
          </Button>
        </form>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
