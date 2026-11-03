import { useQuery } from "@tanstack/react-query"

import type { PointsSettingsDTO } from "@effy/shared-types"
import { toast } from "@effy/design-system/ui"
import { ActivityButton, ActivityLogDrawer } from "@effy/web-kit/activity-log"
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
import { api } from "@/lib/api"

import { canEditPointsSettings } from "./access"
import { pointsActionError } from "./errorText"
import { pointsSettingsQuery, useUpdatePointsSettings } from "./queries"

type Field = "centsPerPoint" | "expiryMonths" | "csaCreditLimitPoints" | "warningDays" | "holdMinutes"

interface Rule {
  key: Field
  label: string
  help: string
  unit: string
  /** Guided-tour key (107). */
  tour?: string
}

/** The rules, in the sections a person looks for them under. */
const SECTIONS: { title: string; description: string; rules: Rule[] }[] = [
  {
    title: "What a point is worth",
    description: "Points are a way of paying, not a discount: the order's total is unchanged and the card pays less.",
    rules: [
      {
        key: "centsPerPoint",
        label: "Value of a point",
        help: "Applies to new orders. Orders already paid keep the value they were paid at.",
        unit: "cents",
        tour: "points.value",
      },
    ],
  },
  {
    title: "When points expire",
    description: "Each credit lasts on its own clock, from the day it was credited.",
    rules: [
      {
        key: "expiryMonths",
        label: "Points last",
        help: "Applies to points credited from now on.",
        unit: "months",
        tour: "points.expiry",
      },
      {
        key: "warningDays",
        label: "Expiry warning",
        help: "Customers are emailed once, this many days before points expire.",
        unit: "days",
      },
    ],
  },
  {
    title: "Customer service",
    description: "Customer-support agents can credit points to say sorry. Managers and administrators have no limit.",
    rules: [
      {
        key: "csaCreditLimitPoints",
        label: "Customer-service credit limit",
        help: "The most a customer-service agent can credit at once.",
        unit: "points",
        tour: "points.credit-limit",
      },
    ],
  },
  {
    title: "At checkout",
    description: "Points a customer chooses to spend are set aside until the payment goes through.",
    rules: [
      {
        key: "holdMinutes",
        label: "Checkout hold",
        help: "How long points chosen at checkout are set aside while the customer pays.",
        unit: "min",
        tour: "points.hold",
      },
    ],
  },
]

const FIELDS = SECTIONS.flatMap((s) => s.rules.map((r) => r.key))

/** Settings › Checkout › Points. */
export function PointsSettingsScreen() {
  const editable = canEditPointsSettings(useSessionRoles())
  const settings = useQuery(pointsSettingsQuery)
  useTourPage("points-settings", { status: tourStatus(settings) })

  return (
    <>
      <PageHeader
        title="Points settings"
        description="How customers earn points, what they are worth, and when they expire."
        actions={<ActivityButton />}
      />
      {settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : settings.isPending ? (
        <PointsSkeleton />
      ) : (
        <PointsForm value={settings.data} editable={editable} />
      )}
      <ActivityLogDrawer
        app="back-office"
        log="bo-points-settings"
        title="Rule changes"
        description="Every change to the points rules, and who made it."
        api={api}
        path="/orders/v1/points/settings/activity"
        queryKey={["customers", "points-settings"]}
        fileName="points-rules-activity"
      />
    </>
  )
}

function PointsForm({ value, editable }: { value: PointsSettingsDTO; editable: boolean }) {
  const save = useUpdatePointsSettings()
  const form = useSettingsDraft<Record<Field, string>>(
    Object.fromEntries(FIELDS.map((f) => [f, String(value[f])])) as Record<Field, string>,
  )
  const d = form.value!

  function submit() {
    const patch: Partial<PointsSettingsDTO> = {}
    for (const f of form.changed) patch[f] = toWhole(d[f])
    save.mutate(patch, {
      onSuccess: () => {
        form.discard()
        toast("Points settings saved.")
      },
      onError: (err) => toast(pointsActionError(err)),
    })
  }

  return (
    <SettingsPage>
      {editable ? null : <SettingsReadOnly>Only an administrator can change these.</SettingsReadOnly>}
      {SECTIONS.map((section) => (
        <SettingsSection key={section.title} title={section.title} description={section.description}>
          <SettingsList>
            {section.rules.map((r) => (
              <SettingsRow key={r.key} tour={r.tour} htmlFor={`ps-${r.key}`} label={r.label} hint={r.help}>
                <UnitInput
                  id={`ps-${r.key}`}
                  unit={r.unit}
                  value={d[r.key]}
                  disabled={!editable}
                  onChange={(e) => form.set(r.key, e.target.value)}
                />
              </SettingsRow>
            ))}
          </SettingsList>
        </SettingsSection>
      ))}
      {editable ? (
        <SettingsSaveBar
          dirty={form.dirty}
          saving={save.isPending}
          canSave={allWhole(...FIELDS.map((f) => d[f]))}
          onSave={submit}
          onDiscard={form.discard}
        />
      ) : null}
    </SettingsPage>
  )
}

function PointsSkeleton() {
  return (
    <Loading label="Loading points settings">
      <SettingsPage>
        {SECTIONS.map((section) => (
          <SettingsSection key={section.title} title={section.title} description={section.description}>
            <SettingsList>
              {section.rules.map((r) => (
                <SettingsRow key={r.key} label={r.label} hint={r.help}>
                  <Bone kind="control" className="w-24" />
                </SettingsRow>
              ))}
            </SettingsList>
          </SettingsSection>
        ))}
      </SettingsPage>
    </Loading>
  )
}
