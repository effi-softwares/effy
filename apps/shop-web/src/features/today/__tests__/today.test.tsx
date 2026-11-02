import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className, ...rest }: { children: ReactNode; to?: string; className?: string }) => (
    <a href={to ?? "#"} className={className} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useSearch: () => ({}),
}))

const getToday = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({ getToday }))

const getInsights = vi.hoisted(() => vi.fn())
vi.mock("@/features/insights/repo", () => ({ getInsights }))

const listOrders = vi.hoisted(() => vi.fn())
const transitionFulfillment = vi.hoisted(() => vi.fn())
vi.mock("@/features/fulfillment/repo", () => ({ listOrders, transitionFulfillment }))

import type { ShopNextCollectionDTO, ShopTodayDTO, ShopTodayEventDTO } from "@effy/shared-types"

import { orderList, orderRow } from "@/features/fulfillment/__tests__/fixtures"

import { attentionHref, buildJobs, collectionClock, collectionLine, eventWords, openItemCount, todayDate } from "../model"
import { TodayScreen } from "../TodayScreen"
import { useNavBadges } from "../useNavBadges"

/** Every loading shape has gone: a skeleton writes the page's real titles, so a title alone does not mean loaded. */
const loaded = () => waitFor(() => expect(screen.queryAllByRole("status", { busy: true })).toHaveLength(0))

const NOW = "2026-09-14T04:00:00.000Z"
const nowMs = new Date(NOW).getTime()
const inMinutes = (m: number) => new Date(nowMs + m * 60_000).toISOString()
const TZ = "Australia/Melbourne"

const next = (over: Partial<ShopNextCollectionDTO> = {}): ShopNextCollectionDTO => ({
  runAt: inMinutes(38),
  dayOffset: 0,
  driver: "assigned",
  opensAt: null,
  driverOnDuty: false,
  due: { ready: 3, picking: 5, started: 2 },
  ...over,
})

const event = (e: Record<string, unknown>, id: string): ShopTodayEventDTO => ({ id, at: NOW, ...e }) as ShopTodayEventDTO

function today(over: Partial<ShopTodayDTO> = {}): ShopTodayDTO {
  return {
    now: NOW,
    timezone: TZ,
    backlog: {
      awaitingPick: { orders: 3, units: 11, oldestPaidAt: "2026-09-14T00:48:00.000Z" },
      readyForPickup: 2,
      lowStock: { skus: 2, outOfStock: 1 },
    },
    attention: [
      { kind: "awaiting_pick", orders: 3, units: 11, since: "2026-09-14T00:48:00.000Z" },
      { kind: "out_of_stock", productId: "p5", variantId: "v5", name: "Beeswax wrap set", soldLast7Days: 17, since: "2026-09-14T01:00:00.000Z" },
    ],
    attentionMore: 0,
    oldestWaitingAt: "2026-09-14T00:48:00.000Z",
    events: [
      event({ kind: "came_in", fulfillmentId: "f-1", orderNumber: "EFY-4421", itemCount: 4, deliveredBy: "effy_driver" }, "e1"),
      event({ kind: "ready", fulfillmentId: "f-2", orderNumber: "EFY-4420" }, "e2"),
      event({ kind: "sold_out", productId: "p5", variantId: "v5", name: "Beeswax wrap set" }, "e3"),
      event({ kind: "collected", orders: 7, fulfillmentId: null, orderNumber: null }, "e4"),
      event({ kind: "picking", fulfillmentId: "f-3", orderNumber: "EFY-4419" }, "e5"),
    ],
    nextCollection: next(),
    ...over,
  }
}

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(() => {
  vi.clearAllMocks()
  getInsights.mockResolvedValue(insights())
  listOrders.mockResolvedValue(orderList([orderRow({ id: "o1", orderNumber: "EFY-9001", status: "received", itemCount: 7, atRisk: true })]))
})

function insights() {
  return {
    range: "today" as const,
    timezone: "Australia/Melbourne",
    window: { from: NOW, to: NOW },
    comparison: { basis: "same_weekday_last_week" as const, from: NOW, to: NOW },
    computedAt: NOW,
    currency: "AUD",
    primary: {
      revenue: { value: "1842.00", previous: "1644.00", change: { kind: "pct" as const, amount: "12" } },
      orders: {
        value: "24",
        previous: "20",
        change: { kind: "abs" as const, amount: "4" },
        perDay: null,
        lastHour: 6,
      },
      averageOrderValue: {
        value: "76.75",
        previous: "74.50",
        change: { kind: "pct" as const, amount: "3.0" },
      },
    },
    secondary: {
      refunds: { value: "0.00", previous: "0.00", change: { kind: "none" as const, amount: null }, orders: 0 },
      cantSupply: { value: "0", previous: "0", change: { kind: "none" as const, amount: null }, units: 0 },
      cancelled: { value: "0", previous: "0", change: { kind: "none" as const, amount: null } },
    },
    series: {
      grain: "hour" as const,
      buckets: [],
      revenueTotal: { value: "1842.00", previous: "1644.00", change: { kind: "pct" as const, amount: "12" } },
      ordersTotal: { value: "24", previous: "20", change: { kind: "abs" as const, amount: "4" } },
    },
    topProducts: [],
  }
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

describe("the countdown", () => {
  it("reads as one sentence, with one bar and how many are being picked", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)
    await loaded()
    const band = await screen.findByRole("region", { name: "Next collection" })
    expect(within(band).getByText("38")).toBeInTheDocument()
    expect(within(band).getByText(/until the .* driver\. 5 orders still to pack\./)).toBeInTheDocument()
    expect(within(band).getByRole("progressbar", { name: "3 of 8 orders ready" })).toBeInTheDocument()
    expect(within(band).getByText(/2 being picked/)).toBeInTheDocument()
  })

  it("says so when no runs are set up, rather than showing a zero", async () => {
    getToday.mockResolvedValue(today({ nextCollection: null }))
    wrap(<TodayScreen />)
    expect(await screen.findByText(/No collection runs are set up/)).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("counts minutes only while that means something", () => {
    expect(collectionClock(next(), nowMs, TZ)).toMatchObject({ minutes: 38, unit: "min" })
    expect(collectionClock(next({ runAt: inMinutes(90) }), nowMs, TZ)).toMatchObject({ minutes: null, big: "1 h", unit: "30 min" })
    expect(collectionClock(next({ runAt: inMinutes(-3) }), nowMs, TZ)).toMatchObject({ minutes: null, big: "Due" })
    const tomorrow = next({ runAt: inMinutes(1200), dayOffset: 1 })
    expect(collectionClock(tomorrow, nowMs, TZ)).toMatchObject({ minutes: null, unit: "Tomorrow" })
    expect(collectionLine(tomorrow, collectionClock(tomorrow, nowMs, TZ), TZ)).toMatch(/^is your next driver\./)
  })

  it("says when everything is ready, and when nothing is due", () => {
    const ready = next({ due: { ready: 4, picking: 0, started: 0 } })
    expect(collectionLine(ready, collectionClock(ready, nowMs, TZ), TZ)).toMatch(/Every order is ready\.$/)
    const none = next({ due: { ready: 0, picking: 0, started: 0 } })
    expect(collectionLine(none, collectionClock(none, nowMs, TZ), TZ)).toMatch(/None of your orders are due/)
  })

  it("dates the page from the SERVER's clock and the shop's timezone", () => {
    expect(todayDate(NOW, TZ)).toBe("Monday 14 September")
  })
})

describe("what just happened", () => {
  it("holds the newest in the Now bar and the three before it on the line, oldest first", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)
    await loaded()
    const bar = await screen.findByLabelText("Live activity")
    expect(within(bar).getByText("came in")).toBeInTheDocument()
    expect(within(bar).getByText(/EFY-4421/)).toBeInTheDocument()
    const line = screen.getAllByRole("listitem").map((l) => l.textContent)
    expect(line[0]).toContain("7 orders collected")
    expect(line[2]).toContain("is ready")
    // The fifth event stays in the log.
    expect(screen.queryByText(/EFY-4419/)).not.toBeInTheDocument()
  })

  it("opens the one Activity drawer for anything earlier", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)
    await loaded()
    await userEvent.click(await screen.findByRole("button", { name: /Earlier/ }))
    expect(navigate).toHaveBeenCalled()
  })

  it("says so before anything has happened today", async () => {
    getToday.mockResolvedValue(today({ events: [] }))
    wrap(<TodayScreen />)
    expect(await screen.findByText("Nothing has happened yet today")).toBeInTheDocument()
  })

  it("has words for every kind", () => {
    expect(eventWords(event({ kind: "came_in", orderNumber: "E", itemCount: 1, deliveredBy: "courier" }, "a"))).toEqual({ code: "E", words: "came in", note: "1 item · Courier" })
    expect(eventWords(event({ kind: "collected", orders: 1, orderNumber: "E", fulfillmentId: "f" }, "b")).words).toBe("was collected")
    expect(eventWords(event({ kind: "collected", orders: 7, orderNumber: null, fulfillmentId: null }, "c")).words).toBe("7 orders collected")
    for (const kind of ["picking", "ready", "delivered", "cant_supply", "cancelled"]) {
      expect(eventWords(event({ kind, orderNumber: "E" }, kind)).words).toBeTruthy()
    }
    expect(eventWords(event({ kind: "restocked", name: "Rice" }, "d")).words).toBe("Rice is back in stock")
  })
})

describe("what is next", () => {
  const order = (id: string, over: Parameters<typeof orderRow>[0] = {}) => orderRow({ id, orderNumber: `EFY-${id}`, status: "received", ...over })
  const runAt = inMinutes(38)
  const collection = { runAt, dayOffset: 0, driver: "none" as const }
  const jobs = (waiting: ReturnType<typeof orderRow>[], attention: ShopTodayDTO["attention"] = [], extra = {}) =>
    buildJobs({ waiting, waitingTotal: waiting.length, attention, attentionMore: 0, nextRunAt: runAt, timezone: TZ, now: nowMs, ...extra })
  const low = { kind: "low_stock" as const, productId: "p", variantId: "low", name: "Oat milk", onHand: 3, daysOfCover: 2, since: NOW }
  const out = { kind: "out_of_stock" as const, productId: "p", variantId: "out", name: "Rice", soldLast7Days: 4, since: NOW }
  const refund = { kind: "refund_proposed" as const, fulfillmentId: "f", orderNumber: "EFY-R", amount: "5.40", since: NOW }

  it("puts late work first, then the next driver's, then what costs sales, then the rest", () => {
    const list = jobs([order("later"), order("run", { collection }), order("late", { atRisk: true })], [low, refund, out]).jobs
    expect(list.map((j) => j.key)).toEqual(["order-late", "order-run", "stock-out", "refund-f"])
  })

  it("lists orders one by one, never the group row", () => {
    const list = jobs([order("a")], [{ kind: "awaiting_pick", orders: 1, units: 3, since: NOW }]).jobs
    expect(list.map((j) => j.key)).toEqual(["order-a"])
  })

  it("counts everything it could not show, including what the server held back", () => {
    const waiting = ["a", "b", "c", "d", "e"].map((id) => order(id))
    expect(jobs(waiting).more).toBe(1)
    expect(jobs(waiting, [], { waitingTotal: 9, attentionMore: 2 }).more).toBe(7)
  })

  it("an order nobody has opened is opened; one that has been is picked", () => {
    const list = jobs([order("p", { status: "pending" }), order("r")]).jobs
    expect(list.map((j) => [j.kind, j.action])).toEqual([["open", "Open order"], ["pick", "Start picking"]])
  })

  it("shows the next job largest, with the only filled button", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)
    await loaded()
    expect(await screen.findByText("Do this next")).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "Pick EFY-9001" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start picking" })).toHaveAttribute("data-variant", "default")
    const restock = screen.getByRole("link", { name: "Restock" })
    expect(restock).toHaveAttribute("href", "/catalog/p5?size=v5")
    expect(restock).toHaveAttribute("data-variant", "outline")
  })

  it("starts the pick, then opens the order", async () => {
    getToday.mockResolvedValue(today())
    transitionFulfillment.mockResolvedValue({})
    wrap(<TodayScreen />)
    await userEvent.click(await screen.findByRole("button", { name: "Start picking" }))
    await waitFor(() => expect(transitionFulfillment).toHaveBeenCalledWith("o1", { to: "picking" }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/orders/$fulfillmentId", params: { fulfillmentId: "o1" } }))
  })

  it("says all clear, with no zeroed card, when nothing needs anyone", async () => {
    listOrders.mockResolvedValue(orderList([]))
    getToday.mockResolvedValue(today({ attention: [], attentionMore: 0, oldestWaitingAt: null }))
    wrap(<TodayScreen />)
    expect(await screen.findByText("All clear")).toBeInTheDocument()
  })

  it("surfaces a read failure instead of rendering an empty shop", async () => {
    getToday.mockRejectedValue({ kind: "unavailable", status: 503, title: "x", detail: "y" })
    wrap(<TodayScreen />)
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByText("All clear")).not.toBeInTheDocument()
  })
})

describe("the page's actions", () => {
  it("keeps quick actions, the pick lists and the team's activity", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)
    await loaded()
    expect(await screen.findByRole("button", { name: "Quick actions" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Print pick lists" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "More actions" }))
    expect(await screen.findByRole("menuitem", { name: "Team activity" })).toBeInTheDocument()
  })
})

describe("⚠ FR-006 — one value, everywhere it appears", () => {
  it("the sidebar badge reads the same cache entry, not a count of its own", () => {
    const dto = today({ attentionMore: 4 })
    expect(openItemCount(dto)).toBe(6)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(["shop", "today"], dto)
    expect(renderHookValue(qc)["/orders"]).toBe(dto.backlog.awaitingPick.orders)
  })

  it("098 — a stock row opens its product on the size that needs stock", () => {
    expect(attentionHref({ kind: "low_stock", productId: "p5", variantId: "v5-1kg", name: "Rice — 1 kg", onHand: 2, daysOfCover: null, since: NOW })).toBe("/catalog/p5?size=v5-1kg")
  })

  it("routes a proposed refund to the order it is about", () => {
    expect(attentionHref({ kind: "refund_proposed", fulfillmentId: "f-9", orderNumber: "EFY-4413", amount: "5.40", since: NOW })).toBe("/orders/f-9")
  })
})

function renderHookValue(qc: QueryClient): Record<string, number | undefined> {
  let captured: Record<string, number | undefined> = {}
  function Probe() {
    captured = useNavBadges()
    return null
  }
  render(
    <QueryClientProvider client={qc}>
      <Probe />
    </QueryClientProvider>,
  )
  return captured
}
