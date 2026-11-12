import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { isDomainError } from "@effy/api-client"
import {
  abandonWords,
  HOUSEKEEPING_JOBS,
  housekeepingJob,
  runWords,
  type HousekeepingDTO,
  type HousekeepingJobDTO,
} from "@effy/shared-types"
import { toast } from "@effy/design-system/ui"
import { ActivityButton, ActivityLogDrawer } from "@effy/web-kit/activity-log"
import { ErrorState } from "@effy/web-kit/console"
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
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
  StatusWord,
  useSettingsDraft,
} from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { toWhole, UnitInput } from "@/features/settings/fields"
import { api } from "@/lib/api"

import { HOUSEKEEPING_ROOT, housekeepingQuery } from "./queries"
import { updateHousekeepingSettings } from "./repo"
import { ABANDON_HOURS, resultWord, STOCK_HOLD_MINUTES, whenWords } from "./words"

const JOBS_SECTION = {
  title: "The clean-ups",
  description: "Each one runs by itself. One that failed, partly worked or hasn't run when it should is marked, and the operator is alerted.",
}

const ABANDON_SECTION = {
  title: "Unpaid orders",
  description:
    "An order nobody paid for is closed after this long. Its points, promotion codes and delivery place are freed, and the customer's cart is kept.",
  label: "Abandon time",
  hint: "From 1 hour to 7 days. Only an administrator can change it.",
}

// 114: the words come from specs/107-backoffice-guided-tours (HK) and specs/114-checkout-stock-holds (FR-019).
const STOCK_HOLD_SECTION = {
  title: "Stock at checkout",
  description:
    "When a shopper presses Pay, the stock in their order is held for them this long, so nobody else can buy it. If they don't pay in time, it goes back on sale by itself.",
  label: "Hold time",
  hint: "From 5 to 60 minutes. Only an administrator can change it.",
}

const columns: EffyColumnDef<HousekeepingJobDTO>[] = [
  {
    id: "job",
    header: "Clean-up",
    cell: ({ row }) => {
      const spec = housekeepingJob(row.original.job)
      return (
        <>
          {spec.title}
          <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{spec.summary}</span>
        </>
      )
    },
    meta: { label: "Clean-up", identifying: true, phone: "primary" },
  },
  {
    id: "result",
    header: "Result",
    cell: ({ row }) => {
      const r = resultWord(row.original.lastRun?.outcome ?? null, row.original.attention)
      return <StatusWord tone={r.tone}>{r.word}</StatusWord>
    },
    meta: { label: "Result", phone: "badge" },
  },
  {
    id: "did",
    header: "What it did",
    cell: ({ row }) => {
      const run = row.original.lastRun
      if (!run) return <span className="text-muted-foreground">-</span>
      return (
        <>
          {runWords(row.original.job, run.counts)}
          {run.problem ? <span className="mt-0.5 block text-sm text-muted-foreground">{run.problem}</span> : null}
        </>
      )
    },
    meta: { label: "What it did" },
  },
  {
    id: "last",
    header: "Last ran",
    cell: ({ row }) => <span className="text-muted-foreground">{whenWords(row.original.lastRun?.startedAt ?? null)}</span>,
    meta: { label: "Last ran", priority: 2 },
  },
  {
    id: "next",
    header: "Runs next",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.nextRunAt ? whenWords(row.original.nextRunAt) : housekeepingJob(row.original.job).everyWords}
      </span>
    ),
    meta: { label: "Runs next", priority: 3 },
  },
]

/** Settings › Clean-ups (113 US5): the jobs that run by themselves, the abandon time, how long checkout holds stock (114), and their activity. */
export function HousekeepingScreen() {
  const q = useQuery(housekeepingQuery)
  useTourPage("housekeeping", { status: tourStatus(q) })

  return (
    <>
      <PageHeader
        title="Clean-ups"
        description="Jobs that close unpaid orders, erase deleted accounts on the date customers were told, and remove phones that have gone quiet."
        actions={<ActivityButton />}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <HousekeepingSkeleton />
      ) : (
        <Loaded value={q.data} />
      )}
      <ActivityLogDrawer
        app="back-office"
        log="bo-housekeeping"
        title="Clean-up activity"
        description="Every run, every payment refunded because it arrived after its order was closed, and every change to the abandon time or the stock hold time."
        api={api}
        path="/orders/v1/housekeeping/activity"
        queryKey={[...HOUSEKEEPING_ROOT, "activity"]}
        fileName="clean-ups-activity"
      />
    </>
  )
}

function saveError(err: unknown): string {
  if (isDomainError(err)) {
    if (err.type?.endsWith("/settings-changed")) return "Someone else changed these settings. The page now shows theirs."
    if (err.type?.endsWith("/invalid-settings")) {
      return "The abandon time must be from 1 hour to 7 days, and the hold time from 5 to 60 minutes."
    }
    if (err.kind === "forbidden") return "Only an administrator can change these settings."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."
  }
  return "That didn't work. Try again."
}

function Loaded({ value }: { value: HousekeepingDTO }) {
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: updateHousekeepingSettings,
    onSuccess: (next) => qc.setQueryData(HOUSEKEEPING_ROOT, next),
    onError: () => void qc.invalidateQueries({ queryKey: HOUSEKEEPING_ROOT }),
  })
  const form = useSettingsDraft<{ hours: string; holdMinutes: string }>({
    hours: String(Math.round(value.abandonAfterMinutes / 60)),
    holdMinutes: String(value.stockHoldMinutes),
  })
  const hours = toWhole(form.value!.hours)
  const holdMinutes = toWhole(form.value!.holdMinutes)
  const hoursValid = Number.isInteger(hours) && hours >= ABANDON_HOURS.min && hours <= ABANDON_HOURS.max
  const holdValid = Number.isInteger(holdMinutes) && holdMinutes >= STOCK_HOLD_MINUTES.min && holdMinutes <= STOCK_HOLD_MINUTES.max
  const valid = hoursValid && holdValid

  function submit() {
    save.mutate(
      // Both go; the server records only the ones that moved.
      { abandonAfterMinutes: hours * 60, stockHoldMinutes: holdMinutes, version: value.version },
      {
        onSuccess: (next) => {
          form.discard()
          const said: string[] = []
          if (next.abandonAfterMinutes !== value.abandonAfterMinutes) said.push(`Unpaid orders now close after ${abandonWords(next.abandonAfterMinutes)}.`)
          if (next.stockHoldMinutes !== value.stockHoldMinutes) said.push(`Checkout now holds stock for ${next.stockHoldMinutes} minutes.`)
          toast(said.join(" ") || "Saved.")
        },
        onError: (err) => toast(saveError(err)),
      },
    )
  }

  return (
    <SettingsPage>
      <SettingsSection tour="housekeeping.jobs" title={JOBS_SECTION.title} description={JOBS_SECTION.description}>
        <StaticTable label="Clean-ups" columns={columns} rows={value.jobs} getRowId={(j) => j.job} />
      </SettingsSection>
      <SettingsSection tour="housekeeping.abandon" title={ABANDON_SECTION.title} description={ABANDON_SECTION.description}>
        {value.mayEdit ? null : <SettingsReadOnly>Only an administrator can change the abandon time.</SettingsReadOnly>}
        <SettingsList>
          <SettingsRow htmlFor="hk-abandon" label={ABANDON_SECTION.label} hint={ABANDON_SECTION.hint}>
            <UnitInput
              id="hk-abandon"
              unit="hours"
              value={form.value!.hours}
              disabled={!value.mayEdit}
              invalid={!hoursValid}
              onChange={(e) => form.set("hours", e.target.value)}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>
      <SettingsSection tour="housekeeping.stockHold" title={STOCK_HOLD_SECTION.title} description={STOCK_HOLD_SECTION.description}>
        {value.mayEdit ? null : <SettingsReadOnly>Only an administrator can change the hold time.</SettingsReadOnly>}
        <SettingsList>
          <SettingsRow htmlFor="hk-stock-hold" label={STOCK_HOLD_SECTION.label} hint={STOCK_HOLD_SECTION.hint}>
            <UnitInput
              id="hk-stock-hold"
              unit="minutes"
              value={form.value!.holdMinutes}
              disabled={!value.mayEdit}
              invalid={!holdValid}
              onChange={(e) => form.set("holdMinutes", e.target.value)}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>
      {value.mayEdit ? (
        <SettingsSaveBar dirty={form.dirty} saving={save.isPending} canSave={valid} onSave={submit} onDiscard={form.discard} />
      ) : null}
    </SettingsPage>
  )
}

function HousekeepingSkeleton() {
  return (
    <Loading label="Loading clean-ups">
      <SettingsPage>
        <SettingsSection title={JOBS_SECTION.title} description={JOBS_SECTION.description}>
          <StaticTable label="Clean-ups" columns={columns} rows={[]} getRowId={(j) => j.job} loading loadingRows={HOUSEKEEPING_JOBS.length} />
        </SettingsSection>
        <SettingsSection title={ABANDON_SECTION.title} description={ABANDON_SECTION.description}>
          <SettingsList>
            <SettingsRow label={ABANDON_SECTION.label} hint={ABANDON_SECTION.hint}>
              <Bone kind="control" className="w-24" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>
        <SettingsSection title={STOCK_HOLD_SECTION.title} description={STOCK_HOLD_SECTION.description}>
          <SettingsList>
            <SettingsRow label={STOCK_HOLD_SECTION.label} hint={STOCK_HOLD_SECTION.hint}>
              <Bone kind="control" className="w-24" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>
      </SettingsPage>
    </Loading>
  )
}
