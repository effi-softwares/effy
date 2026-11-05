// The Overview's arithmetic, kept pure so it can be tested: where each window sits on the clock, what
// the status sentence says, what is coming up and how Needs attention is tiered. Every judgement it
// makes is about time and counting; the words for a package come from `packageStatus` on the server.

import {
  leastAdvanced,
  OPERATING_TZ,
  type DeliverySlotDTO,
  type DispatchWindowDTO,
  type PackageStatusView,
} from "@effy/shared-types"

// ── Effy's clock ────────────────────────────────────────────────────────────────────────────────

const hm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: OPERATING_TZ,
})

/** Hours since local midnight, as a fraction (14:30 → 14.5). */
export function localHours(at: Date | string | number): number {
  const [h = 0, m = 0] = hm.format(new Date(at)).split(":").map(Number)
  return h + m / 60
}

/** "14:30" or "14:30:00" → 14.5. */
export const clockHours = (time: string): number => {
  const [h = 0, m = 0] = time.split(":").map(Number)
  return h + m / 60
}

/** 14.5 → "2:30 pm", 14 → "2 pm" (the customer's own style). */
export function clockWords(hours: number): string {
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`
}

/** "2 pm – 4 pm" */
export const spanWords = (start: number, end: number) => `${clockWords(start)} – ${clockWords(end)}`

/** Minutes as "34 min", "1 h 12 min", "3 h", "2 days". */
export function ageWords(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  if (m < 24 * 60) {
    const h = Math.floor(m / 60)
    const r = m % 60
    return r ? `${h} h ${r} min` : `${h} h`
  }
  const d = Math.floor(m / (24 * 60))
  return `${d} ${d === 1 ? "day" : "days"}`
}

export const minutesSince = (iso: string, now: number) => (now - new Date(iso).getTime()) / 60_000

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const NUMBER_WORDS = ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]
export const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n)

// ── The windows on the day line ─────────────────────────────────────────────────────────────────

/** Not yet at the hub: Preparing, Ready or With driver. */
export interface WindowCounts {
  delivered: number
  out: number
  atHub: number
  earlier: number
  problem: number
}

export interface WindowLine {
  key: string
  anyTime: boolean
  start: number
  end: number
  /** The order-by time, when it falls on the same day before the window opens. */
  cutoff: number | null
  /** The order-by time in words, whatever day it falls on. */
  cutoffWords: string | null
  booked: number
  capacity: number | null
  full: boolean
  counts: WindowCounts
  /** Packages on the board (not cancelled). */
  packages: number
  /** The least advanced package, as the window's state; null with none. */
  state: PackageStatusView | null
  round: { driverName: string; more: number; opensAt: string | null } | null
  /** Today only: minutes past the window's end with packages still not delivered. */
  lateMin: number | null
}

const keyOfSlot = (s: Pick<DeliverySlotDTO, "anyTime" | "startTime" | "endTime">) =>
  s.anyTime ? "any" : `${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`
const keyOfWindow = (w: DispatchWindowDTO) =>
  w.anyTime ? "any" : `${hm.format(new Date(w.windowStart))}-${hm.format(new Date(w.windowEnd))}`

export function countsOf(parcels: readonly { status: PackageStatusView }[]): WindowCounts {
  const c: WindowCounts = { delivered: 0, out: 0, atHub: 0, earlier: 0, problem: 0 }
  for (const p of parcels) {
    switch (p.status.status) {
      case "delivered":
        c.delivered += 1
        break
      case "out_for_delivery":
        c.out += 1
        break
      case "at_hub":
        c.atHub += 1
        break
      case "problem":
        c.problem += 1
        break
      case "cancelled":
        break
      default:
        c.earlier += 1
    }
  }
  return c
}

/**
 * One line per active window (the slot list says which windows exist and their limits), joined to the
 * chosen day's parcels and rounds. A window with parcels but no active slot is still shown.
 */
export function windowLines(input: {
  slots: readonly DeliverySlotDTO[]
  windows: readonly DispatchWindowDTO[]
  /** yyyy-mm-dd of the chosen day. */
  date: string
  isToday: boolean
  now: number
}): WindowLine[] {
  const byKey = new Map(input.windows.map((w) => [keyOfWindow(w), w]))
  const seen = new Set<string>()
  const lines: WindowLine[] = []
  const nowH = localHours(input.now)

  const build = (key: string, slot: DeliverySlotDTO | null, w: DispatchWindowDTO | undefined): WindowLine => {
    const start = slot ? clockHours(slot.startTime) : localHours(w!.windowStart)
    const end = slot ? clockHours(slot.endTime) : localHours(w!.windowEnd)
    const cut = slot ? clockHours(slot.cutoffTime) : null
    const parcels = w?.parcels ?? []
    const counts = countsOf(parcels)
    const live = parcels.filter((p) => p.status.status !== "cancelled")
    const booked = slot
      ? input.isToday
        ? slot.bookedToday
        : (slot.load?.find((l) => l.date === input.date)?.booked ?? live.length)
      : live.length
    const capacity = slot?.capacity ?? null
    // Still on its way: a problem parcel is Needs attention's, not the window's lateness.
    const open = live.length - counts.delivered - counts.problem
    const r = w?.rounds[0]
    return {
      key,
      anyTime: slot?.anyTime === true || w?.anyTime === true,
      start,
      end,
      cutoff: cut !== null && cut < start ? cut : null,
      cutoffWords: slot ? clockWords(clockHours(slot.cutoffTime)) : null,
      booked,
      capacity,
      full: capacity !== null && booked >= capacity,
      counts,
      packages: live.length,
      state: leastAdvanced(parcels.map((p) => p.status)),
      round: r ? { driverName: r.driver.name, more: (w?.rounds.length ?? 1) - 1, opensAt: r.opensAt } : null,
      lateMin: input.isToday && nowH > end && open > 0 ? Math.round((nowH - end) * 60) : null,
    }
  }

  for (const s of input.slots) {
    if (s.status !== "active") continue
    const key = keyOfSlot(s)
    seen.add(key)
    lines.push(build(key, s, byKey.get(key)))
  }
  for (const [key, w] of byKey) if (!seen.has(key)) lines.push(build(key, null, w))
  // Timed windows in clock order; Any time, spanning most of the day, last.
  return lines.sort((a, b) => Number(a.anyTime) - Number(b.anyTime) || a.start - b.start || a.end - b.end)
}

/** The clock the day line draws: from 7 am (earlier if a window or now is earlier) to the last window's end. */
export function axisOf(
  lines: readonly WindowLine[],
  nowH: number | null,
): { from: number; to: number; ticks: number[] } {
  const starts = lines.flatMap((l) => [l.start, l.cutoff ?? l.start])
  const from = Math.floor(Math.min(7, ...starts, nowH ?? 24))
  const to = Math.ceil(Math.max(from + 6, 21, ...lines.map((l) => l.end)))
  const ticks: number[] = []
  for (let h = from + ((3 - (from % 3)) % 3); h <= to; h += 3) ticks.push(h)
  return { from, to: Math.min(24, to), ticks }
}

// ── Needs attention ─────────────────────────────────────────────────────────────────────────────

export type Tier = "stop" | "soon" | "later"
export const TIER_WORDS: Record<Tier, string> = {
  stop: "Stops work now",
  soon: "Customers are waiting",
  later: "When you have time",
}

export interface AttentionItem {
  primary: string
  secondary: string
  age: string | null
}

/** `n` undefined while loading; `failed` when its read did not answer. */
export interface AttentionRow {
  id: string
  tier: Tier
  n: number | undefined
  failed: boolean
  title: string
  desc: string
  /** "Oldest 1 h 12 min", "Next run 2:30 pm". */
  age: string | null
  /** Older than half an hour, or past a deadline. */
  old: boolean
  items: AttentionItem[]
}

export interface TierGroup {
  tier: Tier
  live: AttentionRow[]
  clear: AttentionRow[]
  loading: AttentionRow[]
}

/** Rows with something in them, the all-clear ones named in one line, and the ones still reading. */
export function tiersOf(rows: readonly AttentionRow[]): TierGroup[] {
  return (Object.keys(TIER_WORDS) as Tier[]).map((tier) => {
    const mine = rows.filter((r) => r.tier === tier)
    return {
      tier,
      live: mine.filter((r) => r.failed || (r.n !== undefined && r.n > 0)),
      clear: mine.filter((r) => !r.failed && r.n === 0),
      loading: mine.filter((r) => !r.failed && r.n === undefined),
    }
  })
}

// ── The status sentence ─────────────────────────────────────────────────────────────────────────

export type BriefTone = "good" | "bad" | "warn" | "quiet"
/** A piece of the sentence; `to` makes it a link to that list. */
export interface BriefPart {
  text: string
  to?: "/orders/assignments" | "/exceptions" | "/orders" | "/drivers"
}
export interface Brief {
  tone: BriefTone
  label: string
  /** Shown on a rose ground: nothing will move until someone acts. */
  stopped: boolean
  lead: BriefPart[]
  rest: BriefPart[]
}

export interface BriefInput {
  /** Undefined when the read failed or is still reading: the sentence never guesses. */
  onDuty: number | undefined
  needDriver: number | undefined
  unsafeDrivers: readonly string[] | undefined
  failedOpen: number | undefined
  runsWaiting: number | undefined
  /** Today's windows; undefined when they could not be read. */
  windows: readonly WindowLine[] | undefined
  /** The next collection run, in local hours (today or tomorrow); null with none. */
  nextRunH: number | null | undefined
  /** The first collection run today, in local hours. */
  firstRunH: number | null | undefined
  nowH: number
  /** Names of the reads that failed ("refunds", "courier parcels"). */
  failed: readonly string[]
}

const joinAnd = (parts: BriefPart[][]): BriefPart[] => {
  const out: BriefPart[] = []
  parts.forEach((p, i) => {
    if (i > 0) out.push({ text: i === parts.length - 1 ? " and " : ", " })
    out.push(...p)
  })
  return out
}

export function briefOf(b: BriefInput): Brief {
  const tail: BriefPart[] = b.failed.length
    ? [{ text: ` ${capitalise(listWords(b.failed))} couldn’t be checked just now.` }]
    : []
  const withTail = (x: Brief): Brief =>
    b.failed.length
      ? {
          ...x,
          tone: x.tone === "bad" ? "bad" : "warn",
          label: x.tone === "bad" ? x.label : "Part of this page couldn’t load",
          rest: [...x.rest, ...tail],
        }
      : x

  const wins = b.windows ?? []
  const booked = wins.reduce((s, w) => s + w.packages, 0)
  const delivered = wins.reduce((s, w) => s + w.counts.delivered, 0)
  const behind = wins.filter((w) => w.lateMin !== null).length
  const need = b.needDriver ?? 0

  // Nothing moves: the old callout's words, now the page's first line.
  if (b.onDuty === 0 && need > 0) {
    return withTail({
      tone: "bad",
      label: "Nothing is moving",
      stopped: true,
      lead: [
        { text: "Nobody is on duty, and " },
        { text: plural(need, "package"), to: "/orders/assignments" },
        { text: ` ${need === 1 ? "is" : "are"} waiting for a driver.` },
      ],
      rest: [
        {
          text: "Nothing will move until someone goes on duty in the driver app. Back-office can’t put a driver on duty.",
        },
      ],
    })
  }

  const clauses: BriefPart[][] = []
  if (need > 0) {
    clauses.push([
      { text: plural(need, "package"), to: "/orders/assignments" },
      {
        text: ` ${need === 1 ? "has" : "have"} no driver${b.nextRunH != null ? ` before the ${clockWords(b.nextRunH)} run` : ""}`,
      },
    ])
  }
  const unsafe = b.unsafeDrivers ?? []
  if (unsafe.length === 1)
    clauses.push([{ text: `${unsafe[0]}’s vehicle`, to: "/exceptions" }, { text: " failed its check" }])
  else if (unsafe.length > 1)
    clauses.push([{ text: `${unsafe.length} vehicles`, to: "/exceptions" }, { text: " failed their checks" }])
  const failedOpen = b.failedOpen ?? 0
  if (failedOpen > 0) {
    clauses.push([
      { text: plural(failedOpen, "failed delivery", "failed deliveries"), to: "/exceptions" },
      { text: ` ${failedOpen === 1 ? "needs" : "need"} a decision` },
    ])
  }
  const runs = b.runsWaiting ?? 0
  if (runs > 0)
    clauses.push([
      { text: plural(runs, "run"), to: "/exceptions" },
      { text: ` ${runs === 1 ? "is waiting on its" : "are waiting on their"} next step` },
    ])

  if (behind > 0 || clauses.length > 0) {
    const lead: BriefPart[] = behind
      ? [
          {
            text: `${numberWord(behind)} of ${numberWord(wins.length).toLowerCase()} windows ${behind === 1 ? "is" : "are"} behind.`,
          },
        ]
      : [
          {
            text: `${capitalise(numberWord(clauses.length).toLowerCase())} ${clauses.length === 1 ? "thing needs" : "things need"} you now.`,
          },
        ]
    const rest: BriefPart[] = clauses.length
      ? [...capitaliseFirst(joinAnd(clauses.slice(0, 3))), { text: "." }]
      : [{ text: "The rest of the day is on time." }]
    return withTail({ tone: "bad", label: "Needs attention", stopped: false, lead, rest })
  }

  // Before the day's first window and with nobody on duty yet.
  const firstStart = wins.filter((w) => !w.anyTime).reduce((m, w) => Math.min(m, w.start), 24)
  if (b.onDuty === 0 && b.nowH < firstStart) {
    return withTail({
      tone: "quiet",
      label: "Before the day starts",
      stopped: false,
      lead: [{ text: "A quiet start." }],
      rest: [
        { text: plural(booked, "package"), to: "/orders/assignments" },
        { text: ` ${booked === 1 ? "is" : "are"} booked for today.` },
        ...(b.firstRunH != null && b.firstRunH > b.nowH
          ? [{ text: ` The first collection run is at ${clockWords(b.firstRunH)}.` }]
          : []),
        { text: " Nobody is on duty yet." },
      ],
    })
  }

  return withTail({
    tone: "good",
    label: "On track",
    stopped: false,
    lead: [{ text: "Nothing needs you right now." }],
    rest:
      booked > 0
        ? [
            { text: `${delivered} of ${plural(booked, "package")}`, to: "/orders/assignments" },
            { text: " delivered, and every window is on track." },
          ]
        : [{ text: "Nothing is booked for today’s windows yet." }],
  })
}

const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)
function capitaliseFirst(parts: BriefPart[]): BriefPart[] {
  const [first, ...rest] = parts
  return first ? [{ ...first, text: capitalise(first.text) }, ...rest] : parts
}
const listWords = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`

// ── Coming up ───────────────────────────────────────────────────────────────────────────────────

export interface ComingItem {
  title: string
  detail: string
  /** Local hours. */
  at: number
}

/** The next three things on today's clock: windows starting, last orders, collection runs. */
export function comingUp(input: {
  windows: readonly WindowLine[]
  runs: readonly { at: number; next: boolean }[]
  nextRun: { shops: number; packages: number } | null
  nowH: number
}): ComingItem[] {
  const items: ComingItem[] = []
  for (const w of input.windows) {
    if (w.anyTime) continue
    if (w.start > input.nowH) {
      items.push({
        title: `${spanWords(w.start, w.end)} window starts`,
        detail: w.round ? `${w.round.driverName} has the round` : "No round yet",
        at: w.start,
      })
    }
    if (w.cutoff !== null && w.cutoff > input.nowH) {
      items.push({
        title: `Last orders for ${spanWords(w.start, w.end)}`,
        detail: w.capacity !== null ? `${w.booked} of ${w.capacity} booked` : `${w.booked} booked`,
        at: w.cutoff,
      })
    }
  }
  for (const r of input.runs) {
    if (r.at <= input.nowH) continue
    items.push({
      title: r.next ? "Next collection run" : "Collection run",
      detail:
        r.next && input.nextRun && input.nextRun.packages > 0
          ? `${clockWords(r.at)} · ${plural(input.nextRun.shops, "shop")}, ${plural(input.nextRun.packages, "package")}`
          : clockWords(r.at),
      at: r.at,
    })
  }
  return items.sort((a, b) => a.at - b.at).slice(0, 3)
}

/** "in 18 min", "in 1 h 20 min". */
export const untilWords = (hours: number, nowH: number) => `in ${ageWords((hours - nowH) * 60)}`
