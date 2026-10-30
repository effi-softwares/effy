import { useEffect, useMemo, useRef, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { ArrowRight, BellRing } from "lucide-react"

import { Banner } from "@effy/web-kit/patterns"

import { courierPickupLine } from "@/features/fulfillment/courierPickup"
import { deliveredByText } from "@/features/fulfillment/orderConsole"
import { orderListQuery } from "@/features/fulfillment/queries"
import { playChime } from "@/lib/chime"
import { consoleStore } from "@/lib/console-store"

const REPEAT_MS = 20_000
const SNOOZE_MS = 5 * 60_000

export function NewOrderAlert() {
  const navigate = useNavigate()
  const soundOn = useStore(consoleStore, (s) => s.soundOn)
  const { data } = useQuery(orderListQuery({ tab: "new", dir: "asc" }))
  const [snoozed, setSnoozed] = useState<Record<string, number>>({})
  const [now, setNow] = useState(() => Date.now())

  const waiting = useMemo(
    () => (data?.items ?? []).filter((o) => o.status === "pending" && (snoozed[o.id] ?? 0) <= now),
    [data, snoozed, now],
  )
  const first = waiting[waiting.length - 1]

  const heard = useRef(new Set<string>())
  useEffect(() => {
    const fresh = waiting.some((o) => !heard.current.has(o.id))
    for (const o of waiting) heard.current.add(o.id)
    if (fresh && soundOn) playChime()
  }, [waiting, soundOn])

  useEffect(() => {
    if (waiting.length === 0) return
    const t = setInterval(() => {
      setNow(Date.now())
      if (soundOn) playChime()
    }, REPEAT_MS)
    return () => clearInterval(t)
  }, [waiting.length, soundOn])

  if (!first) return null

  const items = `${first.itemCount} ${first.itemCount === 1 ? "item" : "items"}`
  const who = first.courierPickup ? courierPickupLine(first.courierPickup) : deliveredByText(first.deliveredBy)
  const more = waiting.length - 1

  return (
    <Banner
      role="alert"
      icon={BellRing}
      iconClassName="animate-[sh-ring_1.6s_var(--ease-move)_infinite] motion-reduce:animate-none"
      title={
        <>
          New order · <span className="font-mono">{first.orderNumber}</span>
          {more > 0 ? ` and ${more} more` : ""}
        </>
      }
      actions={[
        {
          label: "Later",
          onClick: () =>
            setSnoozed((s) => ({ ...s, ...Object.fromEntries(waiting.map((o) => [o.id, Date.now() + SNOOZE_MS])) })),
        },
        {
          label: (
            <>
              Open order
              <ArrowRight aria-hidden="true" />
            </>
          ),
          primary: true,
          onClick: () => void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: first.id } }),
        },
      ]}
    >
      <p>
        {items} · {who}
        {soundOn ? " · the chime repeats until someone opens it" : ""}
      </p>
    </Banner>
  )
}
