import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { isDomainError } from "@effy/api-client"
import type { NotificationSettingsDTO, NotificationSettingsUpdate } from "@effy/shared-types"
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
import { api } from "@/lib/api"
import { allWhole, toWhole, UnitInput } from "@/features/settings/fields"

import { getNotificationSettings, updateNotificationSettings } from "./repo"

const KEY = ["settings", "notifications"] as const
export const notificationSettingsQuery = queryOptions({ queryKey: KEY, queryFn: getNotificationSettings })

type Field = "promoPushPerDay" | "promoPushPerWeek" | "maxRecipientsPerMessage"

const SECTION = {
  title: "Promotional notifications",
  description:
    "Offers and news reach only customers who said yes. These limits keep them rare. Any over a limit still reach the customer's inbox, without a notification. None are sent between 9 pm and 8 am.",
}

const RULES: { key: Field; label: string; hint: string; unit: string }[] = [
  { key: "promoPushPerDay", label: "Per day", hint: "The most a customer gets in one day, on Effy's clock.", unit: "a day" },
  { key: "promoPushPerWeek", label: "Per week", hint: "The most a customer gets in any seven days. At least the daily limit.", unit: "a week" },
]

const LARGEST = {
  title: "Messages",
  description: "The most people one message from Messages may reach. A bigger message is refused, so a mistake can't reach everyone.",
  label: "Largest message",
  hint: "Only an administrator can change it.",
}

/** Admin and manager change the promotion limits (FR-020); everyone else reads. */
export const canEditNotificationSettings = (roles: readonly string[]) => roles.includes("admin") || roles.includes("manager")
/** Only an administrator changes the largest message (112 FR-021). */
export const canEditLargestMessage = (roles: readonly string[]) => roles.includes("admin")

/** Settings › Notifications (111 US3): the promotion limits, and every change to them in the activity drawer. */
export function NotificationSettingsScreen() {
  const roles = useSessionRoles()
  const editable = canEditNotificationSettings(roles)
  const largestEditable = canEditLargestMessage(roles)
  const settings = useQuery(notificationSettingsQuery)
  useTourPage("notification-settings", { status: tourStatus(settings) })

  return (
    <>
      <PageHeader
        title="Notification limits"
        description="How often customers who said yes to offers and news get one on their phone, and how many people one message may reach. Order updates, points and important messages are never limited."
        actions={<ActivityButton />}
      />
      {settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : settings.isPending ? (
        <NotificationSettingsSkeleton />
      ) : (
        <LimitsForm value={settings.data} editable={editable} largestEditable={largestEditable} />
      )}
      <ActivityLogDrawer
        app="back-office"
        log="bo-notification-settings"
        title="Rule changes"
        description="Every change to the promotion limits and the largest message, and who made it."
        api={api}
        path="/orders/v1/notifications/settings/activity"
        queryKey={[...KEY, "activity"]}
        fileName="notification-limits-activity"
      />
    </>
  )
}

function saveError(err: unknown): string {
  if (isDomainError(err)) {
    if (err.type?.endsWith("/invalid-notification-settings")) return err.detail ?? "One of those values is out of range."
    if (err.kind === "forbidden") return "Only an administrator or manager can change these."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."
  }
  return "That didn't work. Try again."
}

function LimitsForm({ value, editable, largestEditable }: { value: NotificationSettingsDTO; editable: boolean; largestEditable: boolean }) {
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (body: NotificationSettingsUpdate) => updateNotificationSettings(body),
    onSuccess: (next) => qc.setQueryData(KEY, next),
  })
  const form = useSettingsDraft<Record<Field, string>>({
    promoPushPerDay: String(value.promoPushPerDay),
    promoPushPerWeek: String(value.promoPushPerWeek),
    maxRecipientsPerMessage: String(value.maxRecipientsPerMessage),
  })
  const d = form.value!
  const largest = toWhole(d.maxRecipientsPerMessage)
  const whole = allWhole(d.promoPushPerDay, d.promoPushPerWeek, d.maxRecipientsPerMessage) && largest >= 1 && largest <= 200_000
  const weekBelowDay = whole && toWhole(d.promoPushPerWeek) < toWhole(d.promoPushPerDay)

  function submit() {
    save.mutate(
      { promoPushPerDay: toWhole(d.promoPushPerDay), promoPushPerWeek: toWhole(d.promoPushPerWeek), maxRecipientsPerMessage: largest },
      {
        onSuccess: () => {
          form.discard()
          toast("Notification limits saved.")
        },
        onError: (err) => toast(saveError(err)),
      },
    )
  }

  return (
    <SettingsPage>
      {editable ? null : <SettingsReadOnly>Only an administrator or manager can change these.</SettingsReadOnly>}
      <SettingsSection tour="notifications.limits" title={SECTION.title} description={SECTION.description}>
        <SettingsList>
          {RULES.map((r) => (
            <SettingsRow key={r.key} htmlFor={`ns-${r.key}`} label={r.label} hint={r.hint}>
              <UnitInput id={`ns-${r.key}`} unit={r.unit} value={d[r.key]} disabled={!editable} onChange={(e) => form.set(r.key, e.target.value)} />
            </SettingsRow>
          ))}
        </SettingsList>
        {weekBelowDay ? <p className="text-sm text-destructive">The weekly limit can't be lower than the daily limit.</p> : null}
      </SettingsSection>
      <SettingsSection tour="notifications.message-limit" title={LARGEST.title} description={LARGEST.description}>
        <SettingsList>
          <SettingsRow htmlFor="ns-largest" label={LARGEST.label} hint={LARGEST.hint}>
            <UnitInput
              id="ns-largest"
              unit="people"
              value={d.maxRecipientsPerMessage}
              disabled={!largestEditable}
              onChange={(e) => form.set("maxRecipientsPerMessage", e.target.value)}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>
      {editable ? (
        <SettingsSaveBar dirty={form.dirty} saving={save.isPending} canSave={whole && !weekBelowDay} onSave={submit} onDiscard={form.discard} />
      ) : null}
    </SettingsPage>
  )
}

function NotificationSettingsSkeleton() {
  return (
    <Loading label="Loading notification settings">
      <SettingsPage>
        <SettingsSection title={SECTION.title} description={SECTION.description}>
          <SettingsList>
            {RULES.map((r) => (
              <SettingsRow key={r.key} label={r.label} hint={r.hint}>
                <Bone kind="control" className="w-24" />
              </SettingsRow>
            ))}
          </SettingsList>
        </SettingsSection>
        <SettingsSection title={LARGEST.title} description={LARGEST.description}>
          <SettingsList>
            <SettingsRow label={LARGEST.label} hint={LARGEST.hint}>
              <Bone kind="control" className="w-24" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>
      </SettingsPage>
    </Loading>
  )
}
