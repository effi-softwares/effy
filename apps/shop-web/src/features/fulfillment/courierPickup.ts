import type { CourierPickupDTO } from "@effy/shared-types"

function pickupDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y!, m! - 1, d!)))
    .replace(",", "")
}

function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const suffix = h! >= 12 ? "pm" : "am"
  const hour = h! % 12 === 0 ? 12 : h! % 12
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`
}

export function pickupWhen(p: CourierPickupDTO): string | null {
  if (!p.pickupDate) return null
  const day = pickupDay(p.pickupDate)
  if (!p.pickupFrom || !p.pickupTo) return day
  const from = clock12(p.pickupFrom)
  const to = clock12(p.pickupTo)
  // "1–3 pm", not "1 pm–3 pm", when both ends share the half of the day.
  const sameHalf = from.slice(-2) === to.slice(-2)
  return `${day}, ${sameHalf ? from.slice(0, -3) : from}–${to}`
}

export function courierPickupLine(p: CourierPickupDTO): string {
  switch (p.state) {
    case "handed_over":
      return "Handed over to courier"
    case "booked": {
      const when = pickupWhen(p)
      return when ? `Courier pickup · ${when}` : "Courier pickup booked"
    }
    default:
      // arranging, or a booking staff cancelled and have not replaced yet.
      return "Courier pickup · being arranged"
  }
}

export const canHandOver = (p: CourierPickupDTO | undefined, status: string): boolean =>
  p?.state === "booked" && status === "ready_for_pickup"
