import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import type { DeliveryDaysDTO } from "@effy/shared-types"
import { Switch, toast } from "@effy/design-system/ui"
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
import { daysInput } from "./days-input"
import { deliveryMutationError, fieldErrors, HUB_NOT_SET } from "./errorText"
import { deliveryDaysQuery, usePutDeliveryDays } from "./queries"

const SECTION = {
  open: {
    title: "When work opens",
    description:
      "Work is given to a driver as soon as they can take it, and opens a little before it starts. Until then the driver app shows it but refuses every step.",
  },
  plan: {
    title: "Planning a round",
    description: "The time the planner allows at each stop when it works out how many deliveries a round can make.",
  },
  alerts: {
    title: "Telling dispatch",
    description: "When work runs late it is listed on Exceptions until it is done.",
  },
  vehicle: {
    title: "Vehicle check",
    description: "A daily safety check in the driver app before any work is given.",
  },
} as const

/** Settings › Hub and drivers › Driver work. */
export function DriverWorkScreen() {
  const canManage = canManageDelivery(useSessionRoles())
  const days = useQuery(deliveryDaysQuery())
  useTourPage("driver-work", { status: tourStatus(days) })

  const head = (
    <PageHeader
      title="Driver work"
      description="When drivers' rounds open, how rounds are planned, when dispatch is told about late work, and the vehicle check."
    />
  )
  if (days.isError) return <ErrorState error={days.error} onRetry={() => void days.refetch()} />
  return (
    <>
      {head}
      {days.isPending ? <DriverWorkSkeleton /> : <DriverWorkForm value={days.data} canManage={canManage} />}
    </>
  )
}

type Draft = { lead: string; perStop: string; load: string; checkin: string; vehicle: boolean }

function DriverWorkForm({ value, canManage }: { value: DeliveryDaysDTO; canManage: boolean }) {
  const save = usePutDeliveryDays()
  const form = useSettingsDraft<Draft>({
    lead: String(value.planningLeadMin ?? 45),
    perStop: String(value.perStopAllowanceMin ?? 12),
    load: String(value.loadOverdueMin ?? 20),
    checkin: String(value.checkinOverdueMin ?? 30),
    vehicle: value.vehicleCheckRequired ?? false,
  })
  const d = form.value!
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setErrors({})
    setError(null)
    try {
      await save.mutateAsync({
        ...daysInput(value),
        planningLeadMin: toWhole(d.lead),
        perStopAllowanceMin: toWhole(d.perStop),
        loadOverdueMin: toWhole(d.load),
        checkinOverdueMin: toWhole(d.checkin),
        vehicleCheckRequired: d.vehicle,
      })
      form.discard()
      toast.success("Saved. Drivers' work follows these from now on.")
    } catch (err) {
      const named = fieldErrors(err)
      setErrors(named)
      if (Object.keys(named).length === 0) setError(deliveryMutationError(err, HUB_NOT_SET))
    }
  }

  const minutes = (id: string, field: keyof Draft, server: string) => (
    <UnitInput
      id={id}
      unit="min"
      value={d[field] as string}
      disabled={!canManage}
      invalid={Boolean(errors[server])}
      onChange={(e) => form.set(field, e.target.value)}
    />
  )

  return (
    <SettingsPage>
      {canManage ? null : (
        <SettingsReadOnly>Only an administrator or manager can change drivers' work.</SettingsReadOnly>
      )}
      <SettingsSection tour="drivers.open" {...SECTION.open}>
        <SettingsList>
          <SettingsRow
            htmlFor="work-lead"
            label="Open a round before it starts by"
            hint="Before a collection run's time, or a delivery window's start. Between 5 and 240 minutes."
            error={errors.planningLeadMin}
          >
            {minutes("work-lead", "lead", "planningLeadMin")}
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection tour="drivers.plan" {...SECTION.plan}>
        <SettingsList>
          <SettingsRow
            htmlFor="work-per-stop"
            label="Time at each stop"
            hint="Parking, the walk and the hand-over. Between 1 and 60 minutes."
            error={errors.perStopAllowanceMin}
          >
            {minutes("work-per-stop", "perStop", "perStopAllowanceMin")}
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection tour="drivers.alerts" {...SECTION.alerts}>
        <SettingsList>
          <SettingsRow
            htmlFor="work-load"
            label="A van isn't loaded after"
            hint="From when its delivery round opens."
            error={errors.loadOverdueMin}
          >
            {minutes("work-load", "load", "loadOverdueMin")}
          </SettingsRow>
          <SettingsRow
            htmlFor="work-checkin"
            label="Collected parcels aren't checked in after"
            hint="From the collection run's last shop."
            error={errors.checkinOverdueMin}
          >
            {minutes("work-checkin", "checkin", "checkinOverdueMin")}
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection tour="drivers.vehicle" {...SECTION.vehicle}>
        <SettingsList>
          <SettingsRow
            htmlFor="work-vehicle"
            label="Drivers check their vehicle before taking work"
            hint={
              <>
                Once a day. Anything unsafe and the driver gets no work until you clear it on{" "}
                <Link to="/exceptions" className="text-primary underline underline-offset-4">
                  Exceptions
                </Link>
                . Turn on only once every driver has the app version that asks.
              </>
            }
          >
            <Switch
              id="work-vehicle"
              checked={d.vehicle}
              disabled={!canManage}
              onCheckedChange={(v) => form.set("vehicle", v)}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      {canManage ? (
        <SettingsSaveBar
          dirty={form.dirty}
          saving={save.isPending}
          canSave={allWhole(d.lead, d.perStop, d.load, d.checkin)}
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

function DriverWorkSkeleton() {
  const row = (label: string, control = <Bone kind="control" className="w-24" />) => (
    <SettingsRow label={label}>{control}</SettingsRow>
  )
  return (
    <Loading label="Loading drivers' work">
      <SettingsPage>
        <SettingsSection {...SECTION.open}>
          <SettingsList>{row("Open a round before it starts by")}</SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.plan}>
          <SettingsList>{row("Time at each stop")}</SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.alerts}>
          <SettingsList>
            {row("A van isn't loaded after")}
            {row("Collected parcels aren't checked in after")}
          </SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.vehicle}>
          <SettingsList>
            {row("Drivers check their vehicle before taking work", <Bone className="h-5 w-9 rounded-full" />)}
          </SettingsList>
        </SettingsSection>
      </SettingsPage>
    </Loading>
  )
}
