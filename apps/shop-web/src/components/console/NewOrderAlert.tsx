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

/** How often the chime repeats while an order nobody has opened is waiting. */
const REPEAT_MS = 20_000
/** "Later" quiets one order for this long; then it asks again. */
const SNOOZE_MS = 5 * 60_000

/**
 * "A new order can't be missed" (Today board 02): a pinned blue strip above every screen, a chime
 * that repeats until someone opens the order, and the word "New order". Opening the order IS the
 * acknowledgement — the server moves it out of `pending` and the live update takes the strip away.
 *
 * It reads the Orders list's own query for orders awaiting pick (re-read by the live channel, never
 * on a timer) and keeps only the ones nobody has opened. The repeating timer only re-plays a sound;
 * it reads nothing.
 */
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

  // Chime at once for an order not seen before, then every REPEAT_MS while any is waiting.
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
    <div role="alert" className="sh-alert">
      <span className="sh-alert__icon" aria-hidden="true">
        <BellRing />
      </span>
      <div className="sh-alert__text">
        <p className="sh-alert__title">
          New order · <span className="font-mono">{first.orderNumber}</span>
          {more > 0 ? ` and ${more} more` : ""}
        </p>
        <p className="sh-alert__desc">
          {items} · {who}
          {soundOn ? " · the chime repeats until someone opens it" : ""}
        </p>
      </div>
      <Button
        variant="ghost"
        onClick={() => setSnoozed((s) => ({ ...s, ...Object.fromEntries(waiting.map((o) => [o.id, Date.now() + SNOOZE_MS])) }))}
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
