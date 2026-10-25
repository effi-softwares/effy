import type { CollectionDriver, ShopCollectionRunDTO, ShopOrderCollectionDTO } from "@effy/shared-types"

const timeOf = (iso: string, timezone?: string) =>
  new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: timezone })

export function runTime(run: Pick<ShopOrderCollectionDTO, "runAt" | "dayOffset">, timezone?: string): string {
  const time = timeOf(run.runAt, timezone)
  if (run.dayOffset <= 0) return time
  if (run.dayOffset === 1) return `Tomorrow ${time}`
  const day = new Date(run.runAt).toLocaleDateString("en-AU", { weekday: "long", timeZone: timezone })
  return `${day} ${time}`
}

export function collectionLine(c: ShopOrderCollectionDTO, timezone?: string): string {
  return `collected on the ${runTime(c, timezone)} run`
}

export function driverWord(
  run: Pick<ShopCollectionRunDTO, "driver" | "opensAt" | "driverOnDuty">,
  now: number,
): CollectionDriver {
  if (run.driver === "assigned" && run.driverOnDuty && run.opensAt && Date.parse(run.opensAt) <= now)
    return "on_the_way"
  return run.driver
}

export const DRIVER_WORDS: Record<CollectionDriver, string> = {
  none: "No driver given the run yet",
  assigned: "A driver is assigned",
  on_the_way: "Driver on the way",
  collected: "Collected",
}
