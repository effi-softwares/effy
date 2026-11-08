"use client"

import { useState } from "react"

import { MARKETING_CONSENT } from "@effy/legal-content/consent"
import { categoriesFor, type NotificationCategoryPolicy, type NotificationPreferencesDTO, type PreferenceCategoryDTO } from "@effy/shared-types"

import { Switch } from "@/components/ui/form"
import { capture } from "@/lib/telemetry"
import { toast } from "@/lib/toast-store"

type Channel = "push" | "email"
type Change = { changes?: { category: string; channel: Channel; enabled: boolean }[]; consent?: Record<string, boolean>; via?: "settings"; wordingVersion?: string }

/**
 * Notification settings on the website (111 US1), at parity with the app: a switch per way each kind of message can
 * reach the customer, Offers and News off until they say yes (in Effy's words), Important and Support fixed with the
 * reason. A switch moves at once and comes back if Effy refuses. The words are the shared policy and consent wording.
 */
export function NotificationSettingsForm({ initial }: { initial: NotificationPreferencesDTO }) {
  const [prefs, setPrefs] = useState(initial)

  async function save(before: NotificationPreferencesDTO, optimistic: NotificationPreferencesDTO, change: Change) {
    setPrefs(optimistic)
    const res = await fetch("/api/notification-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(change),
    }).catch(() => null)
    if (res?.ok) {
      setPrefs((await res.json()) as NotificationPreferencesDTO)
      return
    }
    setPrefs(before)
    if (res?.status === 409) {
      toast("Our wording has changed. Refresh the page to see it, then try again.")
    } else {
      toast("We couldn't save that. Check your connection and try again.")
    }
  }

  function setChannel(category: string, channel: Channel, enabled: boolean) {
    const optimistic = { ...prefs, categories: prefs.categories.map((c) => (c.category === category ? { ...c, [channel]: enabled } : c)) }
    capture({ name: "notification_setting_changed", props: { category, channel, enabled: enabled ? "true" : "false", surface: "web" } })
    void save(prefs, optimistic, { changes: [{ category, channel, enabled }] })
  }

  function setConsent(category: "offers" | "news", granted: boolean) {
    const answer = { granted, answeredAt: prefs.consent[category].answeredAt }
    const optimistic = { ...prefs, askForOffers: false, consent: { ...prefs.consent, [category]: answer } }
    capture({ name: "notification_setting_changed", props: { category, channel: "consent", enabled: granted ? "true" : "false", surface: "web" } })
    void save(prefs, optimistic, { consent: { [category]: granted }, via: "settings", wordingVersion: MARKETING_CONSENT.version })
  }

  return (
    <div className="space-y-6">
      {categoriesFor("customer").map((policy) => {
        const choice = prefs.categories.find((c) => c.category === policy.category)
        if (!choice) return null
        return (
          <div key={policy.category} className="space-y-6">
            <Group policy={policy}>
              {policy.required ? (
                <Fixed policy={policy} />
              ) : policy.marketing ? (
                <Marketing
                  policy={policy}
                  choice={choice}
                  granted={prefs.consent[policy.category as "offers" | "news"].granted}
                  onConsent={(g) => setConsent(policy.category as "offers" | "news", g)}
                  onPush={(e) => setChannel(policy.category, "push", e)}
                />
              ) : (
                <Channels policy={policy} choice={choice} onChange={(ch, e) => setChannel(policy.category, ch, e)} />
              )}
            </Group>
            {policy.category === "news" ? <p className="text-xs text-muted-foreground">{MARKETING_CONSENT.footnote}</p> : null}
          </div>
        )
      })}
    </div>
  )
}

function Group({ policy, children }: { policy: NotificationCategoryPolicy; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`pref-${policy.category}`}>
      <h3 id={`pref-${policy.category}`} className="mb-2 text-sm font-medium text-muted-foreground">
        {policy.label}
      </h3>
      <div className="divide-y rounded-lg border">{children}</div>
    </section>
  )
}

function SwitchRow({ id, label, supporting, checked, onChange }: { id: string; label: string; supporting?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-14 items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {supporting ? <p className="text-sm text-muted-foreground">{supporting}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function Channels({ policy, choice, onChange }: { policy: NotificationCategoryPolicy; choice: PreferenceCategoryDTO; onChange: (ch: Channel, enabled: boolean) => void }) {
  return (
    <>
      <p className="px-4 py-3 text-sm text-muted-foreground">{policy.description}</p>
      <SwitchRow id={`${policy.category}-push`} label="App notifications" checked={choice.push} onChange={(v) => onChange("push", v)} />
      {choice.changeable.includes("email") ? (
        <SwitchRow id={`${policy.category}-email`} label="Email" checked={choice.email} onChange={(v) => onChange("email", v)} />
      ) : null}
    </>
  )
}

function Marketing({
  policy,
  choice,
  granted,
  onConsent,
  onPush,
}: {
  policy: NotificationCategoryPolicy
  choice: PreferenceCategoryDTO
  granted: boolean
  onConsent: (granted: boolean) => void
  onPush: (enabled: boolean) => void
}) {
  return (
    <>
      <SwitchRow id={`${policy.category}-consent`} label={`Hear about ${policy.label.toLowerCase()}`} supporting={policy.description} checked={granted} onChange={onConsent} />
      {granted ? <SwitchRow id={`${policy.category}-push`} label="App notifications" checked={choice.push} onChange={onPush} /> : null}
    </>
  )
}

function Fixed({ policy }: { policy: NotificationCategoryPolicy }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p>{policy.description}</p>
        {policy.reason ? <p className="text-sm text-muted-foreground">{policy.reason}</p> : null}
      </div>
      <span className="text-sm text-muted-foreground">Always on</span>
    </div>
  )
}
