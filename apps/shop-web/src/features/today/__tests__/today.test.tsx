import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, className, search: _s, ...rest }: { children: ReactNode; to?: string; params?: Record<string, string>; className?: string; search?: unknown }) => {
    let href = to ?? "#"
    for (const [k, v] of Object.entries(params ?? {})) href = href.replace(`$${k}`, v)
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    )
  },
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

import { PACKAGE_STATUSES, type PackageStatus, type ShopTodayDTO, type ShopTodayRunDTO } from "@effy/shared-types"

import { orderList, orderRow } from "@/features/fulfillment/__tests__/fixtures"
import { insightsDto } from "@/features/insights/__tests__/fixtures"

import { briefOf, comingUp, eventWords, needsRows, runState, tiersOf, todayDate } from "../model"
import { TodayScreen } from "../TodayScreen"
import { useNavBadges } from "../useNavBadges"

/** Every loading shape has gone: a skeleton writes the page's real titles, so a title alone does not mean loaded. */
const loaded = () => waitFor(() => expect(screen.queryAllByRole("status", { busy: true })).toHaveLength(0))

const NOW = "2026-09-14T04:00:00.000Z" // 2 pm in Melbourne
const nowMs = new Date(NOW).getTime()
const inMinutes = (m: number) => new Date(nowMs + m * 60_000).toISOString()
const TZ = "Australia/Melbourne"

const zero = (): Record<PackageStatus, number> => Object.fromEntries(PACKAGE_STATUSES.map((s) => [s, 0])) as Record<PackageStatus, number>

const run = (over: Partial<ShopTodayRunDTO> = {}): ShopTodayRunDTO => ({
  runAt: inMinutes(30),
  driver: "assigned",
  collectedAt: null,
  firstPaidAt: inMinutes(-90),
  collected: 0,
  ready: 5,
  picking: 2,
  waiting: 3,
  missed: 0,
  ...over,
})

function today(over: Partial<ShopTodayDTO> = {}): ShopTodayDTO {
  return {
    now: NOW,
    timezone: TZ,
    backlog: {
      awaitingPick: { orders: 3, units: 11, oldestPaidAt: inMinutes(-72) },
      readyForPickup: 5,
      lowStock: { skus: 4, outOfStock: 1 },
    },
    runs: [
      run({ runAt: inMinutes(-90), driver: "collected", collectedAt: inMinutes(-86), collected: 7, ready: 0, picking: 0, waiting: 0 }),
      run(),
      run({ runAt: inMinutes(150), firstPaidAt: inMinutes(-10), ready: 0, picking: 0, waiting: 2 }),
    ],
    courierPickups: [{ from: inMinutes(60), to: inMinutes(180), courierName: "Sendle", parcels: 2, handedOver: 0 }],
    packages: { effy_driver: { ...zero(), preparing: 5, ready: 5, at_hub: 7, delivered: 3 }, courier: { ...zero(), with_carrier: 2 } },
    picking: [{ fulfillmentId: "f-p1", orderNumber: "EFY-4422", units: 8, startedAt: inMinutes(-6), picker: "Kim Tran", runAt: inMinutes(30), deliveredBy: "effy_driver" }],
    late: [],
    outOfStock: [{ productId: "p5", variantId: "v5", name: "Beeswax wrap set", soldLast7Days: 17, since: inMinutes(-60) }],
    outOfStockMore: 0,
    refunds: [],
    selling: [{ productId: "p1", name: "Sourdough loaf", units: 9, stockLeft: 0 }],
    catalog: { missingDetails: 3, inReview: 2, sentBack: 0 },
    events: [
      { id: "e1", at: inMinutes(-2), kind: "came_in", fulfillmentId: "f-1", orderNumber: "EFY-4421", itemCount: 4, deliveredBy: "effy_driver" },
      { id: "e2", at: inMinutes(-5), kind: "ready", fulfillmentId: "f-2", orderNumber: "EFY-4420" },
    ],
    ahead: [{ kind: "busiest", at: inMinutes(180) }],
    yesterday: { orders: 23, revenue: "840.00" },
    nextCollection: null,
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
  getInsights.mockResolvedValue(insightsDto({}, "today"))
  listOrders.mockResolvedValue(orderList([orderRow({ id: "o1", orderNumber: "EFY-9001", status: "received", itemCount: 7 })]))
})

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

describe("the sentence", () => {
  it("says what the next driver still needs, and what costs sales", () => {
    const b = briefOf(today(), nowMs)
    expect(b.tone).toBe("warn")
    expect(b.label).toBe("30 min to the next driver")
    expect(b.lead.map((p) => p.text).join("")).toBe("5 orders still to pack for the 2:30 pm Effy driver.")
    expect(b.rest.map((p) => p.text).join("")).toBe("5 of 10 are ready. Beeswax wrap set is out of stock.")
  })

  it("puts orders that missed a driver first, on a rose ground", () => {
    const b = briefOf(
      today({ late: [{ fulfillmentId: "f9", orderNumber: "EFY-1", units: 3, missedRunAt: inMinutes(-90), nextRunAt: inMinutes(30), stage: "picking", picker: "Jo" }] }),
      nowMs,
    )
    expect(b.stopped).toBe(true)
    expect(b.lead.map((p) => p.text).join("")).toBe("1 order missed the 12:30 pm Effy driver.")
    expect(b.rest[0]!.text).toMatch(/^It goes with the 2:30 pm driver if it’s ready by then/)
  })

  it("says everything is packed when it is", () => {
    const b = briefOf(today({ runs: [run({ ready: 4, picking: 0, waiting: 0 })], backlog: { awaitingPick: { orders: 0, units: 0, oldestPaidAt: null }, readyForPickup: 4, lowStock: { skus: 0, outOfStock: 0 } }, outOfStock: [] }), nowMs)
    expect(b.tone).toBe("good")
    expect(b.lead[0]!.text).toBe("Everything is packed.")
    expect(b.rest.map((p) => p.text).join("")).toBe("The 2:30 pm Effy driver collects 4 orders. Nothing else needs you right now.")
  })

  it("dates the page from the SERVER's clock and the shop's timezone", () => {
    expect(todayDate(NOW, TZ)).toBe("Monday 14 September")
  })
})

describe("what comes next", () => {
  it("is the next three things on the clock: drivers, the courier, the busiest hour", () => {
    const c = comingUp(today(), nowMs)
    expect(c.map((x) => x.title)).toEqual(["2:30 pm Effy driver", "Courier pickup", "4:30 pm Effy driver"])
    expect(c[0]!.detail).toBe("5 of 10 ready")
    expect(c[1]!.detail).toBe("Sendle collects 2 parcels")
  })
})

describe("the runs", () => {
  it("names each run's state in one word", () => {
    const t = today()
    const next = t.runs[1]!
    expect(runState(t.runs[0]!, next, nowMs).word).toBe("Collected")
    expect(runState(next, next, nowMs).word).toBe("Packing")
    expect(runState(run({ ready: 3, picking: 0, waiting: 0 }), next, nowMs).word).toBe("Ready")
    expect(runState(run({ runAt: inMinutes(-10), driver: "collected", missed: 2 }), next, nowMs).word).toBe("Missed")
    expect(runState(run({ ready: 0, picking: 0, waiting: 0 }), next, nowMs).word).toBe("No orders yet")
  })
})

describe("needs you", () => {
  it("ranks in three tiers and folds the rows at zero into one line", () => {
    const tiers = tiersOf(needsRows(today(), [], nowMs))
    expect(tiers.map((t) => t.live.map((r) => r.id))).toEqual([["pick", "handover"], ["oos"], ["low", "details", "review"]])
    expect(tiers[0]!.clear.map((r) => r.id)).toEqual(["late"])
    // In review with Effy is information, never "all clear".
    expect(tiers[2]!.clear.map((r) => r.id)).toEqual(["sentBack"])
  })

  it("says who takes each order waiting to be picked", () => {
    const rows = needsRows(today(), [orderRow({ id: "o1", orderNumber: "EFY-9001", status: "received", itemCount: 7, placedAt: inMinutes(-41) })], nowMs)
    const pick = rows.find((r) => r.id === "pick")!
    expect(pick.items[0]).toMatchObject({ primary: "EFY-9001", action: { label: "Start picking", pick: "o1" } })
    expect(pick.items[0]!.secondary).toMatch(/^7 items · .* · waited 41 m$/)
  })

  it("starts the pick, then opens the order", async () => {
    getToday.mockResolvedValue(today())
    transitionFulfillment.mockResolvedValue({})
    wrap(<TodayScreen />)
    await userEvent.click(await screen.findByRole("button", { name: "Start picking" }))
    await waitFor(() => expect(transitionFulfillment).toHaveBeenCalledWith("o1", { to: "picking" }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/orders/$fulfillmentId", params: { fulfillmentId: "o1" } }))
  })
})

describe("the page", () => {
  it("keeps the title, the date and how the day is going in the head", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)
    await loaded()
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
    expect(await screen.findByText("Monday 14 September · $8,443 from 196 orders so far")).toBeInTheDocument()
  })

  it("shows every section from live figures", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)
    await loaded()
    for (const title of ["Today’s Effy drivers", "Needs you", "Being picked now", "Where today’s orders are", "Orders today", "Selling today", "Just happened"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument()
    }
    expect(screen.getByText(/Kim Tran/)).toBeInTheDocument()
    expect(screen.getAllByText("Out of stock").length).toBeGreaterThan(0)
    const drivers = screen.getByRole("region", { name: "Today’s Effy drivers" })
    expect(within(drivers).getByText("Courier pickups")).toBeInTheDocument()
  })

  it("says sales couldn't load, and keeps everything else", async () => {
    getToday.mockResolvedValue(today())
    getInsights.mockRejectedValue({ kind: "unavailable", status: 503, title: "x", detail: "y" })
    wrap(<TodayScreen />)
    expect(await screen.findByText(/Sales couldn’t load/)).toBeInTheDocument()
    expect(await screen.findByText(/Couldn’t load today’s figures/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Needs you" })).toBeInTheDocument()
  })

  it("keeps the head and its actions when Today itself fails", async () => {
    getToday.mockRejectedValue({ kind: "unavailable", status: 503, title: "x", detail: "y" })
    wrap(<TodayScreen />)
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Quick actions/ })).toBeInTheDocument()
  })

  it("puts the orders to pick on the nav badge", async () => {
    getToday.mockResolvedValue(today())
    function Badge() {
      const badges = useNavBadges()
      return <p>{badges["/orders"]}</p>
    }
    wrap(<Badge />)
    expect(await screen.findByText("3")).toBeInTheDocument()
  })
})

describe("the words", () => {
  it("has words for every kind of event", () => {
    expect(eventWords({ id: "x", at: NOW, kind: "came_in", fulfillmentId: "f", orderNumber: "EFY-1", itemCount: 1, deliveredBy: "courier" })).toEqual({
      code: "EFY-1",
      words: "came in",
      note: "1 item · Courier",
    })
    expect(eventWords({ id: "x", at: NOW, kind: "collected", orders: 7, fulfillmentId: null, orderNumber: null }).words).toBe("7 orders collected")
  })
})
