import { OPERATING_CITY } from "@effy/shared-types"
import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { Button, Input, Label, toast } from "@effy/design-system/ui"
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
import {
  collectionRunsQuery,
  deliveryDaysQuery,
  settingsQuery,
  useCreateCollectionRun,
  useDeleteCollectionRun,
  usePutDeliveryDays,
  usePutSettings,
} from "./queries"

const SECTION = {
  hub: {
    title: "Where the hub is",
    description:
      "Every postcode's distance is measured from here. Moving it recalculates the distances the platform worked out, and flags the ones entered by hand for another look.",
  },
  timing: {
    title: "Getting parcels ready",
    description:
      "The time a shop needs before a collection run, and the time the hub needs before a delivery run can leave.",
  },
  runs: {
    title: "Collection runs",
    description: `The times Effy's drivers collect from shops (${OPERATING_CITY} time). A window today is offered only while a run can still reach the hub before it starts. Adding or removing a run saves at once.`,
  },
} as const

/** Settings › Hub and drivers › Hub and runs. */
export function HubScreen() {
  const canManage = canManageDelivery(useSessionRoles())
  const hub = useQuery(settingsQuery())
  const days = useQuery(deliveryDaysQuery())
  useTourPage("delivery-hub", {
    status: tourStatus({ isSuccess: hub.isSuccess && days.isSuccess, isError: hub.isError || days.isError }),
  })

  const head = (
    <PageHeader
      title="Hub and runs"
      description="Where the hub is, how long shops and the hub need to get parcels ready, and when drivers collect from shops."
    />
  )
  if (hub.isError) return <ErrorState error={hub.error} onRetry={() => void hub.refetch()} />
  if (days.isError) return <ErrorState error={days.error} onRetry={() => void days.refetch()} />
  if (hub.isPending || days.isPending) {
    return (
      <>
        {head}
        <HubSkeleton />
      </>
    )
  }
  return (
    <>
      {head}
      <SettingsPage>
        {canManage ? null : <SettingsReadOnly>Only an administrator or manager can change the hub.</SettingsReadOnly>}
        <HubForm
          hub={hub.data}
          turnaround={days.data.hubTurnaroundMin}
          days={() => daysInput(days.data)}
          canManage={canManage}
        >
          <CollectionRuns canManage={canManage} />
        </HubForm>
      </SettingsPage>
    </>
  )
}

type Draft = { lat: string; lng: string; buffer: string; turnaround: string }

function hubMoveSummary(d: { recomputed: number; unchanged: number; manualFlagged: number }): string {
  const parts = [`${d.recomputed} distance${d.recomputed === 1 ? "" : "s"} recalculated`]
  if (d.manualFlagged > 0) parts.push(`${d.manualFlagged} entered by hand flagged for review`)
  return `The hub moved: ${parts.join(", ")}.`
}

function HubForm({
  hub,
  turnaround,
  days,
  canManage,
  children,
}: {
  hub: { hubLatitude: string | null; hubLongitude: string | null; samedayPrepBufferMin: number | null }
  turnaround: number
  days: () => ReturnType<typeof daysInput>
  canManage: boolean
  /** The sections that save on their own (collection runs), drawn before the save bar's room. */
  children?: React.ReactNode
}) {
  const putHub = usePutSettings()
  const putDays = usePutDeliveryDays()
  const form = useSettingsDraft<Draft>({
    lat: hub.hubLatitude ?? "",
    lng: hub.hubLongitude ?? "",
    buffer: hub.samedayPrepBufferMin != null ? String(hub.samedayPrepBufferMin) : "",
    turnaround: String(turnaround),
  })
  const d = form.value!
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const saving = putHub.isPending || putDays.isPending
  const hubChanged = form.changed.some((k) => k !== "turnaround")

  async function submit() {
    setErrors({})
    setError(null)
    try {
      // The hub first: the delivery-day settings are saved on its row.
      const moved = hubChanged
        ? await putHub.mutateAsync({
            hubLatitude: d.lat.trim(),
            hubLongitude: d.lng.trim(),
            samedayPrepBufferMin: toWhole(d.buffer),
          })
        : null
      if (form.changed.includes("turnaround")) {
        await putDays.mutateAsync({ ...days(), hubTurnaroundMin: toWhole(d.turnaround) })
      }
      form.discard()
      toast.success(moved?.distances ? `Saved. ${hubMoveSummary(moved.distances)}` : "Saved.")
    } catch (err) {
      const named = fieldErrors(err)
      setErrors(named)
      if (Object.keys(named).length === 0) setError(deliveryMutationError(err, HUB_NOT_SET))
    }
  }

  const ready = d.lat.trim() !== "" && d.lng.trim() !== "" && allWhole(d.buffer, d.turnaround)

  return (
    <>
      <SettingsSection tour="hub-setup.location" {...SECTION.hub}>
        <SettingsList>
          <SettingsRow htmlFor="hub-lat" label="Latitude" hint="Decimal degrees, south is negative.">
            <Input
              id="hub-lat"
              inputMode="decimal"
              className="w-40 text-right tabular-nums"
              value={d.lat}
              onChange={(e) => form.set("lat", e.target.value)}
              placeholder="-37.8142"
              disabled={!canManage}
            />
          </SettingsRow>
          <SettingsRow htmlFor="hub-lng" label="Longitude" hint="Decimal degrees.">
            <Input
              id="hub-lng"
              inputMode="decimal"
              className="w-40 text-right tabular-nums"
              value={d.lng}
              onChange={(e) => form.set("lng", e.target.value)}
              placeholder="144.9632"
              disabled={!canManage}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection tour="hub-setup.timing" {...SECTION.timing}>
        <SettingsList>
          <SettingsRow
            tour="hub-setup.buffer"
            htmlFor="hub-buffer"
            label="Shop prep buffer"
            hint="How long a shop needs to pack before a collection run."
          >
            <UnitInput
              id="hub-buffer"
              unit="min"
              placeholder="60"
              value={d.buffer}
              disabled={!canManage}
              onChange={(e) => form.set("buffer", e.target.value)}
            />
          </SettingsRow>
          <SettingsRow
            tour="hub-setup.turnaround"
            htmlFor="hub-turnaround"
            label="Hub turnaround"
            hint="Estimate - not yet timed. From a collection run reaching the hub to its parcels being ready to leave."
            error={errors.hubTurnaroundMin}
          >
            <UnitInput
              id="hub-turnaround"
              unit="min"
              value={d.turnaround}
              disabled={!canManage}
              invalid={Boolean(errors.hubTurnaroundMin)}
              onChange={(e) => form.set("turnaround", e.target.value)}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      {children}
      {canManage ? (
        <SettingsSaveBar
          dirty={form.dirty}
          saving={saving}
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
    </>
  )
}

function CollectionRuns({ canManage }: { canManage: boolean }) {
  const runs = useQuery(collectionRunsQuery())
  const create = useCreateCollectionRun()
  const del = useDeleteCollectionRun()
  const [runTime, setRunTime] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await create.mutateAsync({ runTime: runTime.trim(), label: label.trim() || null })
      setRunTime("")
      setLabel("")
    } catch (err) {
      setError(deliveryMutationError(err))
    }
  }

  return (
    <SettingsSection tour="days.runs" {...SECTION.runs}>
      {runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
      ) : (
        <SettingsList>
          {runs.isPending ? (
            <Loading label="Loading collection runs">
              {[0, 1].map((i) => (
                <SettingsRow key={i} label={<Bone className="w-14" />}>
                  <Bone kind="control" className="w-20" />
                </SettingsRow>
              ))}
            </Loading>
          ) : runs.data.length === 0 ? (
            <SettingsRow label="No runs yet" hint="No delivery window today can be offered until one is added." />
          ) : (
            runs.data.map((r) => (
              <SettingsRow
                key={r.id}
                label={<span className="font-mono tabular-nums">{r.runTime}</span>}
                hint={r.label ?? "No label"}
              >
                {canManage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={del.isPending}
                    onClick={() => void del.mutateAsync(r.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </SettingsRow>
            ))
          )}
        </SettingsList>
      )}
      {canManage ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="run-time">Run time</Label>
            <Input
              id="run-time"
              className="w-28 tabular-nums"
              placeholder="14:00"
              value={runTime}
              onChange={(e) => setRunTime(e.target.value)}
            />
          </div>
          <div className="grid min-w-48 flex-1 gap-2">
            <Label htmlFor="run-label">Label (optional)</Label>
            <Input
              id="run-label"
              placeholder="Afternoon run"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={create.isPending || !runTime.trim()}>
            Add run
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  )
}

function HubSkeleton() {
  const row = (label: string) => (
    <SettingsRow label={label}>
      <Bone kind="control" className="w-24" />
    </SettingsRow>
  )
  return (
    <Loading label="Loading the hub">
      <SettingsPage>
        <SettingsSection {...SECTION.hub}>
          <SettingsList>
            {row("Latitude")}
            {row("Longitude")}
          </SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.timing}>
          <SettingsList>
            {row("Shop prep buffer")}
            {row("Hub turnaround")}
          </SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.runs}>
          <SettingsList>{row("Collection runs")}</SettingsList>
        </SettingsSection>
      </SettingsPage>
    </Loading>
  )
}
