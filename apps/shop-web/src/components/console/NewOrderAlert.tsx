import { useEffect, useMemo, useRef, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { ArrowRight, BellRing } from "lucide-react"

import { Button } from "@effy/design-system/ui"

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
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-primary py-4 pr-4 pl-5 text-primary-foreground"
    >
      <span
        className="grid size-11 flex-none animate-[sh-ring_1.6s_var(--ease-move)_infinite] place-items-center rounded-full bg-primary-foreground/16 motion-reduce:animate-none [&_svg]:size-6"
        aria-hidden="true"
      >
        <BellRing />
      </span>
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="text-lg leading-6 font-semibold">
          New order · <span className="font-mono">{first.orderNumber}</span>
          {more > 0 ? ` and ${more} more` : ""}
        </p>
        <p className="text-sm leading-5 opacity-90">
          {items} · {who}
          {soundOn ? " · the chime repeats until someone opens it" : ""}
        </p>
      </div>
      <Button
        variant="ghost"
        onClick={() =>
          setSnoozed((s) => ({ ...s, ...Object.fromEntries(waiting.map((o) => [o.id, Date.now() + SNOOZE_MS])) }))
        }
      >
        Later
      </Button>
      <Button
        variant="secondary"
        onClick={() => void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: first.id } })}
      >
        Open order
        <ArrowRight aria-hidden="true" />
      </Button>
    </div>
  )
}
