import { useQuery } from "@tanstack/react-query"
import { Bell } from "lucide-react"

import { categoriesFor, type ConsentStateDTO, type PreferenceCategoryDTO } from "@effy/shared-types"
import { DetailRowsSkeleton, Panel, PanelSkeleton } from "@effy/web-kit/patterns"

import { customerNotificationsQuery } from "../queries"
import { formatDay } from "./points-format"

const LABELS = categoriesFor("customer").map((p) => p.label)
const DESCRIPTION = "What this customer chose. Only they can change it; every yes and no to offers is under Consent history."

/** 111 US7 - a customer's notification choices and their current yes or no to offers and news. Read only. */
export function NotificationsPanel({ customerId }: { customerId: string }) {
  const prefs = useQuery(customerNotificationsQuery(customerId))
  if (prefs.isPending) {
    return (
      <PanelSkeleton title="Notifications" icon={<Bell aria-hidden="true" />} description>
        <DetailRowsSkeleton labels={LABELS} />
      </PanelSkeleton>
    )
  }
  return (
    <Panel tour="customer.notifications" title="Notifications" icon={<Bell aria-hidden="true" />} description={DESCRIPTION}>
      {prefs.isError ? (
        <p className="text-sm text-muted-foreground">We couldn't load their notification choices.</p>
      ) : (
        <dl className="ef-dl">
          {categoriesFor("customer").map((policy) => {
            const choice = prefs.data.categories.find((c) => c.category === policy.category)
            const consent = policy.marketing ? prefs.data.consent[policy.category as "offers" | "news"] : null
            return (
              <div key={policy.category} className="ef-dl__row">
                <dt>{policy.label}</dt>
                <dd>{policy.required ? "Always on" : consent ? consentWords(consent, choice) : channelWords(choice)}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </Panel>
  )
}

function channelWords(choice: PreferenceCategoryDTO | undefined): string {
  if (!choice) return "-"
  return `App ${choice.push ? "on" : "off"} · Email ${choice.email ? "on" : "off"}`
}

function consentWords(consent: ConsentStateDTO, choice: PreferenceCategoryDTO | undefined): string {
  if (!consent.answeredAt) return "Not asked yet - off"
  const when = formatDay(consent.answeredAt.slice(0, 10))
  if (!consent.granted) return `Said no on ${when}`
  return `Said yes on ${when} · App ${choice?.push ? "on" : "off"}`
}
