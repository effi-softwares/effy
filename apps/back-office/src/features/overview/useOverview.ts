import { useQuery } from "@tanstack/react-query"

import { HOLD_REASON_WORDS } from "@effy/shared-types"

import { deliverabilityListQuery } from "@/features/deliverability/queries"
import { slotGridQuery } from "@/features/delivery/queries"
import { dispatchDayQuery, dispatchWindowsQuery } from "@/features/dispatch/queries"
import { dutyQuery } from "@/features/drivers/queries"
import { exceptionsQuery } from "@/features/exceptions/queries"
import { reasonLabel } from "@/features/exceptions/model"
import { feedbackListQuery } from "@/features/feedback/queries"
import { orderViewCountsQuery } from "@/features/orders/queries"
import { reviewQueueQuery } from "@/features/product-review/queries"

import {
  ageWords,
  briefOf,
  clockWords,
  comingUp,
  localHours,
  minutesSince,
  plural,
  windowLines,
  type AttentionRow,
} from "./model"
import { courierCountsQuery, overviewRunsQuery } from "./queries"

const OLD_MIN = 30
const STEP_WORDS: Record<string, string> = {
  collect: "at collection",
  checkin: "at hub check-in",
  load: "at loading",
  deliver: "at the door",
  return: "at the return",
}

/** Every read the Overview makes, joined into the attention rows, the sentence and what is coming up. */
export function useOverview(now: number) {
  const exceptions = useQuery(exceptionsQuery())
  const day = useQuery(dispatchDayQuery())
  const duty = useQuery(dutyQuery())
  const views = useQuery(orderViewCountsQuery({}))
  const courier = useQuery(courierCountsQuery())
  const review = useQuery(reviewQueueQuery({}))
  const feedback = useQuery(feedbackListQuery({ status: "new" }))
  const deliverability = useQuery(deliverabilityListQuery({}))
  const runs = useQuery(overviewRunsQuery())
  const grid = useQuery(slotGridQuery())
  const todayWindows = useQuery(dispatchWindowsQuery(null))

  const nowH = localHours(now)
  const ex = exceptions.data
  const unsafe = ex?.vehicleChecks?.filter((c) => c.unsafe && c.clearedAt === null) ?? []
  const openFailed = ex?.exceptions.items.filter((e) => e.resolvedAt === null) ?? []
  const overdue = ex?.overdue ?? []
  const held = ex?.held ?? []
  const unassigned = day.data?.unassigned ?? []
  const atShops = unassigned.filter((u) => u.stage === "collection")
  const atHub = unassigned.filter((u) => u.stage === "delivery")
  const oldest = (isos: readonly string[]) => (isos.length ? Math.max(...isos.map((i) => minutesSince(i, now))) : null)
  const nextRunAt = runs.data?.nextRunAt ?? null

  const failedSplit = day.data?.failedParcels
  const rows: AttentionRow[] = [
    {
      id: "unsafe",
      tier: "stop",
      n: ex ? unsafe.length : undefined,
      failed: exceptions.isError,
      title: unsafe.length === 1 ? "Vehicle found unsafe" : "Vehicles found unsafe",
      desc: !ex
        ? "A driver whose vehicle check found something unsafe gets no work"
        : unsafe.length
          ? `${unsafe.map((c) => c.driverName).join(", ")} can’t be given work until it is cleared`
          : "Nothing waiting to be cleared",
      age: unsafe.length ? ageWords(oldest(unsafe.map((c) => c.createdAt))!) : null,
      old: false,
      items: unsafe.map((c) => ({
        primary: `${c.driverName} · ${c.vehicleLabel}`,
        secondary:
          c.answers
            .filter((a) => a.answer === "unsafe")
            .map((a) => a.item)
            .join(", ") || "Marked unsafe at the check",
        age: ageWords(minutesSince(c.createdAt, now)),
      })),
    },
    {
      id: "driver",
      tier: "stop",
      n: day.data ? unassigned.length : undefined,
      failed: day.isError,
      title: "Packages need a driver",
      desc: "Ready at a shop or waiting at the hub, and nobody can take them yet",
      age: nextRunAt ? `Next run ${clockWords(localHours(nextRunAt))}` : null,
      old: (oldest(unassigned.map((u) => u.readySince)) ?? 0) > OLD_MIN,
      items: [
        ...(atShops.length
          ? [
              {
                primary: `${atShops.length} at shops`,
                secondary: nextRunAt
                  ? `For the ${clockWords(localHours(nextRunAt))} collection run`
                  : "For the next collection run",
                age: ageWords(oldest(atShops.map((u) => u.readySince))!),
              },
            ]
          : []),
        ...(atHub.length
          ? [
              {
                primary: `${atHub.length} at the hub`,
                secondary: "For their delivery window",
                age: ageWords(oldest(atHub.map((u) => u.readySince))!),
              },
            ]
          : []),
      ],
    },
    {
      id: "runs",
      tier: "stop",
      n: ex ? overdue.length + held.length : undefined,
      failed: exceptions.isError,
      title: "Runs waiting on their next step",
      desc: ex
        ? `${plural(overdue.length, "overdue step")} · ${plural(held.length, "package")} a driver declared missing`
        : "Overdue steps, and packages a driver declared missing",
      age: overdue.length ? `Longest ${ageWords(Math.max(...overdue.map((o) => Number(o.minutes))))}` : null,
      old: overdue.some((o) => Number(o.minutes) > OLD_MIN),
      items: [
        ...overdue.map((o) => ({
          primary: `${o.driverName} · ${o.kind === "collection" ? "Collection run" : "Delivery round"}`,
          secondary: `${o.stageLabel} overdue`,
          age: ageWords(Number(o.minutes)),
        })),
        ...held.map((h) => ({
          primary: `${h.orderNumber} · ${h.shopName}`,
          secondary: `${HOLD_REASON_WORDS[h.reason] ?? "Missing"}, declared ${STEP_WORDS[h.step] ?? ""}`.trim(),
          age: ageWords(minutesSince(h.createdAt, now)),
        })),
      ],
    },
    {
      id: "failed",
      tier: "stop",
      // The board's own open count, not one page of the list: the sidebar badge reads the same.
      n: ex ? Number(ex.openCount) : undefined,
      failed: exceptions.isError,
      title: "Failed deliveries",
      desc: failedSplit
        ? `${failedSplit.withDrivers} still with drivers · ${failedSplit.returnedAwaitingDecision} back at the hub, waiting for a decision`
        : "Still with drivers, or back at the hub waiting for a decision",
      age: openFailed.length ? `Oldest ${ageWords(oldest(openFailed.map((e) => e.failedAt))!)}` : null,
      old: (oldest(openFailed.map((e) => e.failedAt)) ?? 0) > OLD_MIN,
      items: openFailed.slice(0, 5).map((e) => ({
        primary: `${e.orderNumber}${e.destinationSuburb ? ` · ${e.destinationSuburb}` : ""}`,
        secondary: `${reasonLabel(e.reason)} · ${e.packageLocation === "with_driver" ? e.driverName : "Back at the hub"}`,
        age: ageWords(minutesSince(e.failedAt, now)),
      })),
    },
    {
      id: "refund",
      tier: "soon",
      n: views.data ? Number(views.data.refundDecision) : undefined,
      failed: views.isError,
      title: "Refund decisions",
      desc: "Customers asked for a refund, or a shop recorded items as not supplied",
      age: null,
      old: false,
      items: [],
    },
    {
      id: "courier",
      tier: "soon",
      n: courier.data ? courier.data.hub_late + courier.data.problems : undefined,
      failed: courier.isError,
      title: "Courier parcels late or with a problem",
      desc: courier.data
        ? `${courier.data.hub_late} late out of the hub · ${plural(courier.data.problems, "open problem")}`
        : "Late out of the hub, or with an open problem",
      age: null,
      old: false,
      items: [],
    },
    {
      id: "review",
      tier: "later",
      n: review.data ? Number(review.data.total) : undefined,
      failed: review.isError,
      title: "Products waiting for review",
      desc: "New products and changes from shops, oldest first",
      age: review.data?.items.length
        ? `Oldest ${ageWords(Math.max(...review.data.items.map((i) => Number(i.waitingHours))) * 60)}`
        : null,
      old: false,
      items: [],
    },
    {
      id: "feedback",
      tier: "later",
      n: feedback.data ? Number(feedback.data.total) : undefined,
      failed: feedback.isError,
      title: "New feedback",
      desc: "Submitted by customers and not yet looked at",
      age: null,
      old: false,
      items: [],
    },
    {
      id: "email",
      tier: "later",
      n: deliverability.data ? Number(deliverability.data.total) : undefined,
      failed: deliverability.isError,
      title: "Email addresses having trouble",
      desc: "Bouncing or undeliverable: they get no sign-in codes until someone repairs them",
      age: null,
      old: false,
      items: [],
    },
  ]

  // Today's windows, for the sentence and what is coming up.
  const todayDate = todayWindows.data?.date
  const lines =
    grid.data && todayWindows.data && todayDate
      ? windowLines({ slots: grid.data.items, windows: todayWindows.data.windows, date: todayDate, isToday: true, now })
      : undefined

  const reads = [exceptions, day, duty, grid, todayWindows, runs]
  const ready = reads.every((r) => !r.isPending)
  const failedNames = [
    views.isError ? "refunds" : null,
    courier.isError ? "courier parcels" : null,
    exceptions.isError ? "failed deliveries and vehicle checks" : null,
    day.isError ? "packages without a driver" : null,
    duty.isError ? "who is on duty" : null,
    grid.isError || todayWindows.isError ? "the delivery windows" : null,
  ].filter((x): x is string => x !== null)

  const runList = (runs.data?.runs ?? []).map((r) => ({ at: localHours(r.at), next: r.state === "next" }))
  const brief = ready
    ? briefOf({
        onDuty: duty.data?.onDuty.length,
        needDriver: day.data ? unassigned.length : undefined,
        unsafeDrivers: ex ? unsafe.map((c) => c.driverName) : undefined,
        failedOpen: ex ? Number(ex.openCount) : undefined,
        runsWaiting: ex ? overdue.length + held.length : undefined,
        windows: lines,
        nextRunH: nextRunAt ? localHours(nextRunAt) : null,
        firstRunH: runList[0]?.at ?? null,
        nowH,
        failed: failedNames,
      })
    : null
  const coming = lines ? comingUp({ windows: lines, runs: runList, nextRun: runs.data?.nextRun ?? null, nowH }) : null

  return { rows, brief, coming, nowH, runs: runs.data, unsafe, waiting: day.data ? unassigned.length : undefined }
}
