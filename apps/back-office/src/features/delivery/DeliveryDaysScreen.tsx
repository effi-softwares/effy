import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import type { DeliveryDaysDTO } from "@effy/shared-types"
import { Button, DateField, Input, Label, Toggle, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import {
  Bone,
  Loading,
  PageHeader,
  SettingsList,
  SettingsPage,
  SettingsReadOnly,
  SettingsRow,
  SettingsSaveBar,
  SettingsSection,
  useSettingsDraft,
} from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { allWhole, toWhole, UnitInput } from "@/features/settings/fields"

import { canManageDelivery } from "./access"
import { deliveryMutationError, fieldErrors, HUB_NOT_SET } from "./errorText"
import { daysInput } from "./days-input"
import { deliveryDaysQuery, useAddNonDeliveryDate, usePutDeliveryDays, useRemoveNonDeliveryDate } from "./queries"

export const WEEKDAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const

const HEAD = (
  <PageHeader
    title="Delivery days"
    description="Which days customers can choose for delivery by Effy, what an “as soon as possible” order is told, and the dates Effy is closed."
  />
)

const SECTION = {
  days: {
    title: "Days customers can choose",
    description:
      "A customer picks a window today, or on one of the delivery days after it. Days with no delivery are skipped and don't count.",
  },
  asap: {
    title: "As soon as possible",
    description: "Standard delivery with no day chosen. Customers are told this estimate - never a promised day.",
  },
  hold: {
    title: "Holding a place",
    description: "A window has room for a set number of deliveries. A customer's place is kept while they pay.",
  },
  closed: {
    title: "Dates with no delivery",
    description:
      "Public holidays and other days Effy is closed. Closing a date saves at once; orders already promised that day are not changed.",
  },
} as const

/** Settings › Delivery › Delivery days: the calendar a customer chooses from. */
export function DeliveryDaysScreen() {
  const canManage = canManageDelivery(useSessionRoles())
  const days = useQuery(deliveryDaysQuery())
  useTourPage("delivery-days", { status: tourStatus(days) })

  if (days.isError) return <ErrorState error={days.error} onRetry={() => void days.refetch()} />
  return (
    <>
      {HEAD}
      {days.isPending ? <DaysSkeleton /> : <DaysForm value={days.data} canManage={canManage} />}
    </>
  )
}

type Draft = { lookahead: string; closed: number[]; asap: string; hold: string }

function DaysForm({ value, canManage }: { value: DeliveryDaysDTO; canManage: boolean }) {
  const save = usePutDeliveryDays()
  const form = useSettingsDraft<Draft>({
    lookahead: String(value.effyLookaheadDays),
    closed: value.noDeliveryWeekdays,
    asap: value.asapEstimate ?? "",
    hold: String(value.slotHoldMin),
  })
  const d = form.value!
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function toggle(day: number) {
    form.set(
      "closed",
      d.closed.includes(day) ? d.closed.filter((x) => x !== day) : [...d.closed, day].sort((a, b) => a - b),
    )
  }

  async function submit() {
    setErrors({})
    setError(null)
    try {
      await save.mutateAsync({
        ...daysInput(value),
        effyLookaheadDays: toWhole(d.lookahead),
        noDeliveryWeekdays: d.closed,
        asapEstimate: d.asap.trim(),
        slotHoldMin: toWhole(d.hold),
      })
      form.discard()
      toast.success("Saved. The next checkout uses these.")
    } catch (err) {
      const named = fieldErrors(err)
      setErrors(named)
      if (Object.keys(named).length === 0) setError(deliveryMutationError(err, HUB_NOT_SET))
    }
  }

  const ready = allWhole(d.lookahead, d.hold) && d.asap.trim() !== "" && d.closed.length < 7

  return (
    <SettingsPage>
      {canManage ? null : (
        <SettingsReadOnly>Only an administrator or manager can change delivery days.</SettingsReadOnly>
      )}
      <SettingsSection tour="days.days" {...SECTION.days}>
        <SettingsList>
          <SettingsRow
            htmlFor="days-lookahead"
            label="Delivery days offered after today"
            hint="Between 1 and 14."
            error={errors.effyLookaheadDays}
          >
            <UnitInput
              id="days-lookahead"
              unit="days"
              value={d.lookahead}
              disabled={!canManage}
              invalid={Boolean(errors.effyLookaheadDays)}
              onChange={(e) => form.set("lookahead", e.target.value)}
            />
          </SettingsRow>
          <SettingsRow
            tour="days.weekdays"
            label="No delivery on"
            hint="Every week. At least one day must have delivery."
            error={errors.noDeliveryWeekdays}
          >
            <div role="group" aria-label="No delivery on" className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(([day, name]) => (
                <Toggle
                  key={day}
                  variant="outline"
                  size="sm"
                  className="w-12"
                  pressed={d.closed.includes(day)}
                  disabled={!canManage}
                  onPressedChange={() => toggle(day)}
                >
                  {name}
                </Toggle>
              ))}
            </div>
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection tour="days.asap" {...SECTION.asap}>
        <SettingsList>
          <SettingsRow
            htmlFor="days-asap"
            label="What customers are told"
            hint="Shown under “Standard” at checkout, and as “As soon as possible - …” on the order and receipt."
            error={errors.asapEstimate}
          >
            <Input
              id="days-asap"
              className="w-72 max-sm:w-full"
              maxLength={80}
              placeholder="usually within 2–3 days"
              value={d.asap}
              disabled={!canManage}
              aria-invalid={errors.asapEstimate ? true : undefined}
              onChange={(e) => form.set("asap", e.target.value)}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection tour="days.hold" {...SECTION.hold}>
        <SettingsList>
          <SettingsRow
            htmlFor="days-hold"
            label="Hold a place in a window for"
            hint="From when the customer continues to payment. An unpaid place is offered to others after this."
            error={errors.slotHoldMin}
          >
            <UnitInput
              id="days-hold"
              unit="min"
              value={d.hold}
              disabled={!canManage}
              invalid={Boolean(errors.slotHoldMin)}
              onChange={(e) => form.set("hold", e.target.value)}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <ClosedDates value={value} canManage={canManage} />

      {canManage ? (
        <SettingsSaveBar
          dirty={form.dirty}
          saving={save.isPending}
          canSave={ready}
          message={error}
          onSave={() => void submit()}
          onDiscard={() => {
            form.discard()
            setErrors({})
            setError(null)
          }}
        />
      ) : null}
    </SettingsPage>
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
    <SettingsSection tour="days.closed" {...SECTION.closed}>
      <SettingsList>
        {value.dates.length === 0 ? (
          <SettingsRow label="No dates are closed" hint="Every delivery day ahead is open." />
        ) : (
          value.dates.map((d) => (
            <SettingsRow
              key={d.day}
              label={<span className="font-mono tabular-nums">{d.day}</span>}
              hint={
                <>
                  {d.label ?? "No reason given"}
                  {d.affectedOrders > 0 ? (
                    <span className="text-warning">
                      {" "}
                      · {d.affectedOrders} placed {d.affectedOrders === 1 ? "order" : "orders"}
                    </span>
                  ) : null}
                </>
              }
            >
              {canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => void remove.mutateAsync(d.day)}
                >
                  Reopen
                </Button>
              ) : null}
            </SettingsRow>
          ))
        )}
      </SettingsList>

      {canManage ? (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="closed-day">Date</Label>
            <DateField id="closed-day" className="w-44" value={day} onChange={(v) => setDay(v)} />
          </div>
          <div className="grid min-w-48 flex-1 gap-2">
            <Label htmlFor="closed-label">Reason (optional)</Label>
            <Input
              id="closed-label"
              placeholder="Public holiday"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={add.isPending || !day}>
            Close date
          </Button>
        </form>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  )
}

function DaysSkeleton() {
  const row = (label: string) => (
    <SettingsRow label={label}>
      <Bone kind="control" className="w-24" />
    </SettingsRow>
  )
  return (
    <Loading label="Loading delivery days">
      <SettingsPage>
        <SettingsSection {...SECTION.days}>
          <SettingsList>
            {row("Delivery days offered after today")}
            {row("No delivery on")}
          </SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.asap}>
          <SettingsList>{row("What customers are told")}</SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.hold}>
          <SettingsList>{row("Hold a place in a window for")}</SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.closed}>
          <SettingsList>{row("Closed dates")}</SettingsList>
        </SettingsSection>
      </SettingsPage>
    </Loading>
  )
}
