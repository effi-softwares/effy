import type { CollectionDriver, ShopCollectionRunDTO, ShopOrderCollectionDTO } from "@effy/shared-types"

/**
 * How the console words an Effy collection run (099). One place, so Today, the queue, the list and an
 * order's page say the same thing. Never a window, a delivery day or a driver's name — only the run's
 * time, its day, and where its driver is.
 */

const timeOf = (iso: string, timezone?: string) =>
  new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: timezone })

/** "12:30 pm", "Tomorrow 9:00 am", "Thursday 9:00 am". */
export function runTime(run: Pick<ShopOrderCollectionDTO, "runAt" | "dayOffset">, timezone?: string): string {
  const time = timeOf(run.runAt, timezone)
  if (run.dayOffset <= 0) return time
  if (run.dayOffset === 1) return `Tomorrow ${time}`
  const day = new Date(run.runAt).toLocaleDateString("en-AU", { weekday: "long", timeZone: timezone })
  return `${day} ${time}`
}

/** "collected on the 12:30 pm run". */
export function collectionLine(c: ShopOrderCollectionDTO, timezone?: string): string {
  return `collected on the ${runTime(c, timezone)} run`
}

/**
 * Where the run's driver is, re-worded on the screen's own clock: a driver given the run turns "on the
 * way" at the round's opening time without a re-read, once on duty (the server says so).
 */
export function driverWord(run: Pick<ShopCollectionRunDTO, "driver" | "opensAt" | "driverOnDuty">, now: number): CollectionDriver {
  if (run.driver === "assigned" && run.driverOnDuty && run.opensAt && Date.parse(run.opensAt) <= now) return "on_the_way"
  return run.driver
}

export const DRIVER_WORDS: Record<CollectionDriver, string> = {
  none: "No driver given the run yet",
  assigned: "A driver is assigned",
  on_the_way: "Driver on the way",
  collected: "Collected",
}
