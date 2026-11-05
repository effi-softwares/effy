import { describe, expect, it } from "vitest"

import type { DeliverySlotDTO, DispatchWindowDTO, PackageStatus } from "@effy/shared-types"

import {
  ageWords,
  axisOf,
  briefOf,
  clockWords,
  comingUp,
  tiersOf,
  windowLines,
  type AttentionRow,
  type BriefInput,
  type WindowLine,
} from "./model"

// 2026-11-05 is a Thursday; Melbourne is UTC+11 in November.
const at = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00+11:00`).getTime()
const iso = (hhmm: string) => new Date(at(hhmm)).toISOString()

const slot = (start: string, end: string, cutoff: string, over: Partial<DeliverySlotDTO> = {}): DeliverySlotDTO => ({
  id: `${start}-${end}`,
  startTime: `${start}:00`,
  endTime: `${end}:00`,
  cutoffTime: `${cutoff}:00`,
  capacity: 50,
  status: "active",
  bookedToday: 0,
  overCapacityToday: 0,
  updatedAt: iso("08:00"),
  ...over,
})

const parcel = (status: PackageStatus) => ({
  packageId: Math.random().toString(36),
  orderId: "o",
  orderNumber: "EF-1",
  status: { status, word: status, detail: null, driverName: null },
  collectLate: false,
  coldOvernight: false,
  group: null,
})

const win = (start: string, end: string, statuses: PackageStatus[], driver?: string): DispatchWindowDTO => ({
  windowStart: iso(start),
  windowEnd: iso(end),
  label: "",
  rounds: driver ? [{ roundId: "r", driver: { id: "d", name: driver }, opensAt: null, parcels: statuses.length }] : [],
  parcels: statuses.map(parcel),
})

describe("words for time", () => {
  it("says the clock the customer's way", () => {
    expect(clockWords(14)).toBe("2 pm")
    expect(clockWords(14.5)).toBe("2:30 pm")
    expect(clockWords(0)).toBe("12 am")
    expect(clockWords(12)).toBe("12 pm")
  })
  it("says an age in minutes, hours or days", () => {
    expect(ageWords(34)).toBe("34 min")
    expect(ageWords(72)).toBe("1 h 12 min")
    expect(ageWords(180)).toBe("3 h")
    expect(ageWords(60 * 49)).toBe("2 days")
  })
})

describe("windowLines", () => {
  const slots = [slot("09", "11", "07", { bookedToday: 40, capacity: 40 }), slot("14", "16", "12", { bookedToday: 12 })]

  it("joins each window to its parcels and counts them by where they are", () => {
    const lines = windowLines({
      slots,
      windows: [win("09:00", "11:00", ["delivered", "delivered", "out_for_delivery", "problem", "cancelled"], "Ann")],
      date: "2026-11-05",
      isToday: true,
      now: at("10:00"),
    })
    expect(lines).toHaveLength(2)
    const [first, second] = lines
    expect(first!.counts).toEqual({ delivered: 2, out: 1, atHub: 0, earlier: 0, problem: 1 })
    expect(first!.packages).toBe(4)
    expect(first!.full).toBe(true)
    expect(first!.round?.driverName).toBe("Ann")
    expect(first!.state?.status).toBe("problem")
    expect(first!.cutoff).toBe(7)
    expect(second!.booked).toBe(12)
    expect(second!.packages).toBe(0)
  })

  it("says a window is behind only once its end has passed with packages not delivered", () => {
    const run = (now: string) =>
      windowLines({
        slots,
        windows: [win("09:00", "11:00", ["delivered", "at_hub"])],
        date: "2026-11-05",
        isToday: true,
        now: at(now),
      })[0]!
    expect(run("10:30").lateMin).toBeNull()
    expect(run("11:42").lateMin).toBe(42)
  })

  it("reads a later day's bookings from that day's load", () => {
    const later = windowLines({
      slots: [slot("09", "11", "07", { load: [{ date: "2026-11-06", booked: 9, overCapacity: 0 }] })],
      windows: [],
      date: "2026-11-06",
      isToday: false,
      now: at("10:00"),
    })
    expect(later[0]!.booked).toBe(9)
    expect(later[0]!.lateMin).toBeNull()
  })

  it("keeps a window that has parcels but no active slot", () => {
    const lines = windowLines({
      slots: [],
      windows: [win("18:00", "20:00", ["preparing"])],
      date: "2026-11-05",
      isToday: true,
      now: at("10:00"),
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.start).toBe(18)
    expect(lines[0]!.capacity).toBeNull()
  })
})

describe("axisOf", () => {
  it("runs from 7 am to the last window, earlier when now is earlier", () => {
    expect(axisOf([], 10).from).toBe(7)
    expect(axisOf([], 5.5).from).toBe(5)
    expect(axisOf([], 10).to).toBe(21)
  })
})

const line = (over: Partial<WindowLine>): WindowLine => ({
  key: "k",
  anyTime: false,
  start: 14,
  end: 16,
  cutoff: 12,
  cutoffWords: "12 pm",
  booked: 10,
  capacity: 50,
  full: false,
  counts: { delivered: 0, out: 0, atHub: 0, earlier: 10, problem: 0 },
  packages: 10,
  state: null,
  round: null,
  lateMin: null,
  ...over,
})

const base: BriefInput = {
  onDuty: 3,
  needDriver: 0,
  unsafeDrivers: [],
  failedOpen: 0,
  runsWaiting: 0,
  windows: [line({})],
  nextRunH: 14.5,
  firstRunH: 8.5,
  nowH: 13.7,
  failed: [],
}
const text = (b: ReturnType<typeof briefOf>) => [...b.lead, ...b.rest].map((p) => p.text).join("")

describe("briefOf", () => {
  it("keeps the old callout's words when nobody is on duty and work is waiting", () => {
    const b = briefOf({ ...base, onDuty: 0, needDriver: 12 })
    expect(b.tone).toBe("bad")
    expect(b.stopped).toBe(true)
    expect(text(b)).toBe(
      "Nobody is on duty, and 12 packages are waiting for a driver.Nothing will move until someone goes on duty in the driver app. Back-office can’t put a driver on duty.",
    )
    expect(b.lead[1]).toEqual({ text: "12 packages", to: "/orders/assignments" })
  })

  it("leads with the windows behind, then what stops work, each figure a link", () => {
    const b = briefOf({
      ...base,
      needDriver: 7,
      unsafeDrivers: ["Ben Okafor"],
      windows: [line({ lateMin: 42 }), line({}), line({})],
    })
    expect(b.tone).toBe("bad")
    expect(text(b)).toBe(
      "One of three windows is behind.7 packages have no driver before the 2:30 pm run and Ben Okafor’s vehicle failed its check.",
    )
    expect(b.rest.filter((p) => p.to).map((p) => p.to)).toEqual(["/orders/assignments", "/exceptions"])
  })

  it("counts the things that need a person when no window is behind", () => {
    expect(text(briefOf({ ...base, failedOpen: 1 }))).toBe(
      "One thing needs you now.1 failed delivery needs a decision.",
    )
  })

  it("is quiet before the first window with nobody on duty yet", () => {
    const b = briefOf({ ...base, onDuty: 0, nowH: 6.8, windows: [line({ start: 9, end: 11 })] })
    expect(b.tone).toBe("quiet")
    expect(text(b)).toBe(
      "A quiet start.10 packages are booked for today. The first collection run is at 8:30 am. Nobody is on duty yet.",
    )
  })

  it("says the day is on track when nothing needs anyone", () => {
    const b = briefOf({
      ...base,
      windows: [line({ counts: { delivered: 4, out: 0, atHub: 0, earlier: 6, problem: 0 } })],
    })
    expect(b.tone).toBe("good")
    expect(text(b)).toBe("Nothing needs you right now.4 of 10 packages delivered, and every window is on track.")
  })

  it("never says all is well when a read failed: it names what could not be checked", () => {
    const b = briefOf({ ...base, failed: ["refunds", "courier parcels"] })
    expect(b.tone).toBe("warn")
    expect(b.label).toBe("Part of this page couldn’t load")
    expect(text(b)).toContain("Refunds and courier parcels couldn’t be checked just now.")
  })
})

describe("comingUp", () => {
  it("lists the next three things on the clock: window starts, last orders and runs", () => {
    const items = comingUp({
      windows: [
        line({ start: 14, end: 16, cutoff: 12, round: { driverName: "Dev Patel", more: 0, opensAt: null } }),
        line({ start: 16, end: 18, cutoff: 14.5, booked: 34 }),
      ],
      runs: [
        { at: 8.5, next: false },
        { at: 14.5, next: true },
      ],
      nextRun: { shops: 5, packages: 26 },
      nowH: 13.7,
    })
    expect(items.map((i) => i.title)).toEqual([
      "2 pm – 4 pm window starts",
      "Last orders for 4 pm – 6 pm",
      "Next collection run",
    ])
    expect(items[0]!.detail).toBe("Dev Patel has the round")
    expect(items[1]!.detail).toBe("34 of 50 booked")
    expect(items[2]!.detail).toBe("2:30 pm · 5 shops, 26 packages")
  })
})

describe("tiersOf", () => {
  const row = (id: string, tier: AttentionRow["tier"], n: number | undefined, failed = false): AttentionRow => ({
    id,
    tier,
    n,
    failed,
    title: id,
    desc: "",
    age: null,
    old: false,
    items: [],
  })
  it("splits each tier into rows with something, all-clear rows and rows still reading", () => {
    const [stop, soon] = tiersOf([
      row("a", "stop", 2),
      row("b", "stop", 0),
      row("c", "stop", undefined),
      row("d", "soon", 0, true),
    ])
    expect(stop!.live.map((r) => r.id)).toEqual(["a"])
    expect(stop!.clear.map((r) => r.id)).toEqual(["b"])
    expect(stop!.loading.map((r) => r.id)).toEqual(["c"])
    // A failed read is never "all clear".
    expect(soon!.live.map((r) => r.id)).toEqual(["d"])
    expect(soon!.clear).toEqual([])
  })
})
