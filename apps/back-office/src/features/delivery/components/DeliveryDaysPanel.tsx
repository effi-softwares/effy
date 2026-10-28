import { useEffect, useState } from "react"

import { useQuery } from "@tanstack/react-query"

import type { DeliveryDaysDTO } from "@effy/shared-types"
import { Button, Checkbox, Input, Label, Toggle } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { deliveryMutationError, fieldErrors, HUB_NOT_SET } from "../errorText"
import { deliveryDaysQuery, useAddNonDeliveryDate, usePutDeliveryDays, useRemoveNonDeliveryDate } from "../queries"

const WEEKDAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const

export function DeliveryDaysPanel({ canManage }: { canManage: boolean }) {
  const days = useQuery(deliveryDaysQuery())

  if (days.isError) return <ErrorState error={days.error} onRetry={() => void days.refetch()} />
  if (days.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SettingsForm value={days.data} canManage={canManage} />
      <ClosedDates value={days.data} canManage={canManage} />
    </div>
  )
}

function SettingsForm({ value, canManage }: { value: DeliveryDaysDTO; canManage: boolean }) {
  const save = usePutDeliveryDays()
  const [effyLookahead, setEffyLookahead] = useState(String(value.effyLookaheadDays))
  const [closed, setClosed] = useState<number[]>(value.noDeliveryWeekdays)
  const [hold, setHold] = useState(String(value.slotHoldMin))
  const [turnaround, setTurnaround] = useState(String(value.hubTurnaroundMin))
  const [asapEstimate, setAsapEstimate] = useState(value.asapEstimate ?? "")
  const [loadOverdue, setLoadOverdue] = useState(String(value.loadOverdueMin ?? 20))
  const [checkinOverdue, setCheckinOverdue] = useState(String(value.checkinOverdueMin ?? 30))
  const [vehicleCheck, setVehicleCheck] = useState(value.vehicleCheckRequired ?? false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // The server's values replace the form's after a save or a refetch.
  useEffect(() => {
    setEffyLookahead(String(value.effyLookaheadDays))
    setClosed(value.noDeliveryWeekdays)
    setHold(String(value.slotHoldMin))
    setTurnaround(String(value.hubTurnaroundMin))
    setAsapEstimate(value.asapEstimate ?? "")
    setLoadOverdue(String(value.loadOverdueMin ?? 20))
    setCheckinOverdue(String(value.checkinOverdueMin ?? 30))
    setVehicleCheck(value.vehicleCheckRequired ?? false)
  }, [value])

  function toggle(day: number) {
    setSaved(false)
    setClosed((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    setError(null)
    setSaved(false)
    try {
      await save.mutateAsync({
        effyLookaheadDays: Number(effyLookahead),
        noDeliveryWeekdays: closed,
        slotHoldMin: Number(hold),
        hubTurnaroundMin: Number(turnaround),
        asapEstimate: asapEstimate.trim(),
        loadOverdueMin: Number(loadOverdue),
        checkinOverdueMin: Number(checkinOverdue),
        vehicleCheckRequired: vehicleCheck,
      })
      setSaved(true)
    } catch (err) {
      const named = fieldErrors(err)
      setErrors(named)
      if (Object.keys(named).length === 0) setError(deliveryMutationError(err, HUB_NOT_SET))
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
          setSaved(false)
          set(e.target.value)
        }}
      />
      <p id={`days-${id}-hint`} className={errors[id] ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {errors[id] ?? hint}
      </p>
    </div>
  )

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

        <div className="space-y-2">
          <Label htmlFor="days-asapEstimate">“Standard” delivery tile — the timeframe customers are shown</Label>
          <Input
            id="days-asapEstimate"
            className="max-w-sm"
            maxLength={80}
            placeholder="usually within 2–3 days"
            value={asapEstimate}
            disabled={!canManage}
            aria-invalid={errors.asapEstimate ? true : undefined}
            aria-describedby="days-asapEstimate-hint"
            onChange={(e) => {
              setSaved(false)
              setAsapEstimate(e.target.value)
            }}
          />
          <p
            id="days-asapEstimate-hint"
            className={errors.asapEstimate ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          >
            {errors.asapEstimate ??
              "Shown under “Standard” at checkout, and as “As soon as possible — …” on the order and receipt. Always an estimate, never a promised day."}
          </p>
        </div>

        <fieldset disabled={!canManage}>
          <legend className="text-sm font-medium">No delivery on</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map(([day, name]) => {
              const pressed = closed.includes(day)
              return (
                <Toggle
                  key={day}
                  variant="outline"
                  size="sm"
                  pressed={pressed}
                  onPressedChange={() => toggle(day)}
                  className="px-3"
                >
                  {name}
                </Toggle>
              )
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

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-base font-semibold">Drivers&apos; work</h2>
        {number(
          "loadOverdueMin",
          "Tell dispatch when a van isn't loaded after (minutes)",
          "From when a delivery run opens. It is listed on Exceptions until it is loaded.",
          loadOverdue,
          setLoadOverdue,
        )}
        {number(
          "checkinOverdueMin",
          "Tell dispatch when collected parcels aren't checked in after (minutes)",
          "From the run's last shop. It is listed on Exceptions until the parcels are checked in at the hub.",
          checkinOverdue,
          setCheckinOverdue,
        )}
        <div className="flex items-start gap-3">
          <Checkbox
            id="days-vehicleCheckRequired"
            className="mt-1"
            checked={vehicleCheck}
            disabled={!canManage}
            onCheckedChange={(v) => {
              setSaved(false)
              setVehicleCheck(v === true)
            }}
          />
          <div className="space-y-1">
            <Label htmlFor="days-vehicleCheckRequired">Drivers check their vehicle before taking work</Label>
            <p className="text-sm text-muted-foreground">
              Once a day, in the driver app. Anything unsafe and the driver gets no work until you clear it on
              Exceptions. Turn on only once every driver has the app version that asks.
            </p>
          </div>
        </div>
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
  )
}

function ClosedDates({ value, canManage }: { value: DeliveryDaysDTO; canManage: boolean }) {
  const add = useAddNonDeliveryDate()
  const remove = useRemoveNonDeliveryDate()
  const [day, setDay] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    try {
      const added = await add.mutateAsync({ day, label: label.trim() || null })
      setDay("")
      setLabel("")
      if (added.affectedOrders > 0) {
        setNotice(
          `${added.affectedOrders} placed ${added.affectedOrders === 1 ? "order is" : "orders are"} already promised ${added.day}. ` +
            "They have not been changed.",
        )
      }
    } catch (err) {
      setError(fieldErrors(err).day ?? deliveryMutationError(err))
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
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => void remove.mutateAsync(d.day)}
                >
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
            <Input
              id="closed-label"
              placeholder="Public holiday"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
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
  )
}
