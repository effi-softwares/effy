import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className, "aria-current": current }: { children: ReactNode; to?: string; className?: string; "aria-current"?: "page" }) => (
    <a href={to ?? "#"} className={className} aria-current={current}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useSearch: () => ({}),
}))

const getInsights = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({ getInsights }))

const getToday = vi.hoisted(() => vi.fn())
vi.mock("@/features/today/repo", () => ({ getToday }))

import type { InsightsBucketDTO, InsightsFigureDTO, InsightsRange, ShopInsightsDTO, ShopTodayDTO } from "@effy/shared-types"

import { insightsCsv } from "../exportCsv"
import { InsightsScreen, type InsightsTab } from "../InsightsScreen"
import { axisStep } from "../LineChart"
import { changeOf, freshness, headline, movers, rhythmGrid, rhythmSentence, spreadSentence } from "../model"

const NOW = "2026-09-14T04:00:00.000Z"

const bucket = (label: string, revenue: string, orders: number, previous: string | null = "100.00"): InsightsBucketDTO => ({
  start: `2026-09-0${label.length}T14:00:00.000Z`,
  label,
  partial: false,
  revenue,
  orders,
  previousRevenue: previous,
  previousOrders: previous === null ? null : 4,
  foundRate: "97.5",
  cantSupplyRate: "1.0",
  averageTimeToReady: 1320,
})

function dto(range: InsightsRange = "7d", over: Partial<ShopInsightsDTO> = {}): ShopInsightsDTO {
  return {
    range,
    timezone: "Australia/Melbourne",
    window: { from: "2026-09-07T14:00:00.000Z", to: NOW },
    comparison: { basis: "previous_7_days", from: "2026-08-31T14:00:00.000Z", to: "2026-09-07T14:00:00.000Z" },
    computedAt: "2026-09-14T03:58:00.000Z",
    currency: "AUD",
    primary: {
      revenue: { value: "8264.00", previous: "7186.00", change: { kind: "pct", amount: "15" } },
      orders: { value: "210", previous: "190", change: { kind: "abs", amount: "20" }, perDay: "30", lastHour: null },
      averageOrderValue: { value: "39.35", previous: "37.82", change: { kind: "pct", amount: "4.0" } },
    },
    secondary: {
      refunds: { value: "94.20", previous: "80.00", change: { kind: "pct", amount: "18" }, orders: 6 },
      cantSupply: { value: "2", previous: "3", change: { kind: "abs", amount: "-1" }, units: 11 },
      cancelled: { value: "1", previous: "0", change: { kind: "none", amount: null } },
    },
    series: {
      grain: range === "today" ? "hour" : "day",
      buckets: [bucket("Mon 8", "900.00", 22), bucket("Tue 9", "1000.00", 25), bucket("Wed 10", "1200.00", 30, null)],
      revenueTotal: { value: "8264.00", previous: "7186.00", change: { kind: "pct", amount: "15" } },
      ordersTotal: { value: "210", previous: "190", change: { kind: "abs", amount: "20" } },
    },
    topProducts: [
      { productId: "p1", name: "Free-range eggs", sku: null, thumbnailUrl: null, units: 184, revenue: "1288.00", share: 1, previousRank: 1 },
      { productId: "p2", name: "Oat milk", sku: null, thumbnailUrl: "https://x/o.png", units: 141, revenue: "846.00", share: 0.66, previousRank: 6 },
      { productId: "p3", name: "Rice, 1 kg", sku: null, thumbnailUrl: null, units: 88, revenue: "704.00", share: 0.55, previousRank: 2 },
      { productId: "p4", name: "Cold brew", sku: null, thumbnailUrl: null, units: 41, revenue: "389.00", share: 0.3, previousRank: null },
    ],
    quality: {
      foundRate: { value: "97.8", previous: "97.1", change: { kind: "abs", amount: "0.7" } },
      cantSupplyRate: { value: "2.2", previous: "2.9", change: { kind: "abs", amount: "-0.7" } },
      averageTimeToReady: { value: "1440", previous: "1680", change: { kind: "pct", amount: "-14" } },
      readySpread: [6, 24, 38, 21, 8, 3],
    },
    briefing: {
      mood: "strong",
      comparedWith: "the week before",
      changes: [
        { tone: "up", title: "Friday was the best day", detail: "$1,669, 20% of this week", page: "sales" },
        { tone: "down", title: "Found rate fell to 95.4%", detail: "Rice caused 6 of the 11 units you could not supply", page: "service" },
        { tone: "flat", title: "Eggs is your best seller", detail: "184 units sold", page: "products" },
      ],
    },
    rhythm: { weeks: 4, cells: [{ weekday: 5, hour: 11, orders: 40 }, { weekday: 1, hour: 9, orders: 3 }] },
    cantSupplyProducts: [{ productId: "p3", name: "Rice, 1 kg", units: 6 }],
    ...over,
  }
}

const today = (): ShopTodayDTO =>
  ({
    attention: [
      { kind: "out_of_stock", productId: "p3", variantId: "v", name: "Rice - 1 kg", soldLast7Days: 14, since: NOW },
      { kind: "out_of_stock", productId: "p9", variantId: "w", name: "Unloved tin", soldLast7Days: 0, since: NOW },
    ],
  }) as unknown as ShopTodayDTO

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}
const open = (page: InsightsTab = "overview", range: InsightsRange = "7d") => wrap(<InsightsScreen page={page} range={range} />)

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(() => {
  vi.clearAllMocks()
  getInsights.mockImplementation(async (range: InsightsRange) => dto(range))
  getToday.mockResolvedValue(today())
})

describe("the page's head", () => {
  it("says what it counts and how fresh it is, and offers four pages", async () => {
    open()
    expect(await screen.findByText("Your goods only · updated 2 minutes ago")).toBeInTheDocument()
    const nav = screen.getByRole("navigation", { name: "Insights pages" })
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Overview", "Sales", "Products", "Service"])
    expect(within(nav).getByRole("link", { name: "Sales" })).toHaveAttribute("href", "/insights/sales")
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page")
  })

  it("keeps the range in the address", async () => {
    open("sales")
    await screen.findByText("Behind the revenue")
    await userEvent.click(screen.getByRole("radio", { name: "30 days" }))
    expect(navigate).toHaveBeenCalledWith({ to: "/insights/sales", search: { range: "30d" } })
  })

  it("moves Export CSV into the More menu", async () => {
    open()
    await screen.findByText("Your goods only · updated 2 minutes ago")
    await userEvent.click(screen.getByRole("button", { name: "More actions" }))
    expect(await screen.findByRole("menuitem", { name: "Export CSV" })).toBeInTheDocument()
  })

  it("says the figures are being prepared rather than showing zeros", async () => {
    getInsights.mockResolvedValue(dto("7d", { computedAt: null }))
    open()
    expect(await screen.findByText("Your figures are being prepared")).toBeInTheDocument()
  })

  it("surfaces a failed read instead of an empty-looking shop", async () => {
    getInsights.mockRejectedValue({ kind: "unavailable", status: 503, title: "x", detail: "y" })
    open()
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument()
  })
})

describe("Overview", () => {
  it("opens with the sentence, and every figure in it links to the page behind it", async () => {
    open()
    const line = await screen.findByRole("heading", { level: 2, name: /A strong week/ })
    expect(line).toHaveTextContent("A strong week. Revenue is $8,264, up 15% on the week before, from 210 orders.")
    expect(within(line).getByRole("link", { name: "15%" })).toHaveAttribute("href", "/insights/sales")
  })

  it("shows the server's lines, each opening its page", async () => {
    open()
    expect(await screen.findByText("Friday was the best day")).toBeInTheDocument()
    expect(screen.getByText("Rice caused 6 of the 11 units you could not supply")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "See service →" })).toHaveAttribute("href", "/insights/service")
  })

  it("draws revenue against the last period, and offers the same numbers as a table", async () => {
    open()
    expect(await screen.findByRole("img", { name: "Revenue, This week against Last week" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Show table" }))
    expect(screen.getByRole("cell", { name: "Wed 10" })).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "$1,200" })).toBeInTheDocument()
  })

  it("reads a point from the keyboard, the same as hovering", async () => {
    open()
    const chart = await screen.findByRole("img", { name: /Revenue, This week/ })
    fireEvent.focus(chart)
    fireEvent.keyDown(chart, { key: "ArrowLeft" })
    const read = await screen.findByRole("status")
    expect(read).toHaveTextContent("Tue 9")
    expect(read).toHaveTextContent("$1,000")
    expect(read).toHaveTextContent("$100")
  })

  it("shows the five figures, shorter time to ready counting as good news", async () => {
    open()
    await screen.findByText("Time to ready")
    expect(screen.getByText("24 min")).toBeInTheDocument()
    expect(changeOf({ value: "1", previous: "2", change: { kind: "pct", amount: "-14" } }, "%", false)).toEqual({ direction: "down", tone: "good", text: "14%" })
  })

  it("says plainly when nothing sold", async () => {
    getInsights.mockResolvedValue(dto("today", { primary: { ...dto().primary, orders: { ...dto().primary.orders, value: "0" } } }))
    open("overview", "today")
    expect(await screen.findByRole("heading", { level: 2, name: "Nothing sold yet today." })).toBeInTheDocument()
  })
})

describe("Sales", () => {
  it("shows one measure at a time, never two on one axis", async () => {
    open("sales")
    expect(await screen.findByText("$8,264")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("radio", { name: "Orders" }))
    expect(screen.getByText("210")).toBeInTheDocument()
    expect(screen.getAllByRole("img", { name: /against/ })).toHaveLength(1)
  })

  it("says when the shop is busiest", async () => {
    open("sales")
    expect(await screen.findByText("Friday around 11 am is your busiest time.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Friday, 11 am: 10 orders on average" })).toBeInTheDocument()
  })

  it("waits for two weeks before drawing a rhythm", async () => {
    getInsights.mockResolvedValue(dto("7d", { rhythm: null }))
    open("sales")
    expect(await screen.findByText("Your week's rhythm appears here after two weeks of orders.")).toBeInTheDocument()
  })

  it("drills each figure through to the list that explains it", async () => {
    open("sales")
    const behind = await screen.findByRole("region", { name: "Behind the revenue" })
    expect(within(behind).getByRole("link", { name: /Refunds/ })).toHaveAttribute("href", "/orders")
  })

  it("⚠ names the money basis, and never claims a tax basis", async () => {
    open("sales")
    expect(await screen.findByText(/Revenue counts your goods only/)).toBeInTheDocument()
    expect(screen.queryByText(/incl\. GST/i)).not.toBeInTheDocument()
  })
})

describe("Products", () => {
  it("ranks by revenue, with moves and what is selling but out", async () => {
    open("products")
    expect(await screen.findByRole("link", { name: "Oat milk" })).toBeInTheDocument()
    const up = await screen.findByRole("region", { name: "Moving up" })
    expect(within(up).getByText("Oat milk")).toBeInTheDocument()
    expect(within(up).getByText("4 places")).toBeInTheDocument()
    const slip = screen.getByRole("region", { name: "Slipping" })
    expect(within(slip).getByText("1 place")).toBeInTheDocument()
    const out = await screen.findByRole("region", { name: "Selling but out of stock" })
    expect(await within(out).findByText("Rice - 1 kg")).toBeInTheDocument()
    // Out of stock and not selling is not a lost sale.
    expect(screen.queryByText("Unloved tin")).not.toBeInTheDocument()
  })

  it("a product new to the list has no move", () => {
    const { up, down } = movers(dto().topProducts)
    expect([...up, ...down].map((m) => m.product.name)).not.toContain("Cold brew")
  })

  it("says so when nothing sold", async () => {
    getInsights.mockResolvedValue(dto("7d", { topProducts: [] }))
    open("products")
    expect(await screen.findByText("Nothing sold in this window yet.")).toBeInTheDocument()
  })

  it("⚠ offers no conversion rate, new customers or returns figure (FR-034)", async () => {
    open("products")
    await screen.findByRole("link", { name: "Oat milk" })
    expect(screen.queryByText(/Conversion rate/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/New customers/i)).not.toBeInTheDocument()
  })
})

describe("Service", () => {
  it("shows the three measures, each with its trend", async () => {
    open("service")
    expect(await screen.findByText("97.8%")).toBeInTheDocument()
    expect(screen.getByText("2.2%")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Found rate over the period" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Time to ready over the period" })).toBeInTheDocument()
  })

  it("shows how long orders take, and what could not be supplied", async () => {
    open("service")
    expect(await screen.findByText("Most orders are ready in 20 to 30 minutes.")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Under 10, 6; 10-20, 24/ })).toBeInTheDocument()
    const short = screen.getByRole("region", { name: "What you could not supply" })
    expect(within(short).getByText("6 units")).toBeInTheDocument()
  })

  it("does not invent a figure when nothing finished", async () => {
    getInsights.mockResolvedValue(
      dto("today", { quality: { foundRate: null, cantSupplyRate: null, averageTimeToReady: null, readySpread: [0, 0, 0, 0, 0, 0] }, cantSupplyProducts: [] }),
    )
    open("service", "today")
    expect(await screen.findAllByText("Nothing finished yet")).toHaveLength(3)
    expect(screen.getByText("Nothing finished in this period yet.")).toBeInTheDocument()
    expect(screen.getByText("You supplied everything this period.")).toBeInTheDocument()
  })
})

describe("the words", () => {
  const figure = (amount: string | null): InsightsFigureDTO => ({ value: "1", previous: "1", change: amount === null ? { kind: "none", amount } : { kind: "pct", amount } })

  it("leaves the comparison out when there is none", () => {
    const line = headline(dto("7d", { briefing: { ...dto().briefing, mood: null }, primary: { ...dto().primary, revenue: figure(null) } }))
    expect(line).toMatchObject({ mood: "", change: null })
  })

  it("says down when it is down", () => {
    expect(headline(dto("7d", { primary: { ...dto().primary, revenue: figure("-14") } })).change).toEqual({ word: "down", amount: "14%" })
  })

  it("reads the busiest range as minutes, and the open-ended ranges as words", () => {
    expect(spreadSentence([9, 1, 0, 0, 0, 0])).toBe("Most orders are ready in under 10 minutes.")
    expect(spreadSentence([0, 0, 0, 0, 0, 9])).toBe("Most orders are ready in over 60 minutes.")
  })

  it("rounds an axis to a step a person would pick", () => {
    expect(axisStep(1669)).toBe(500)
    expect(axisStep(152)).toBe(50)
    expect(axisStep(0)).toBe(1)
  })

  it("widens the rhythm for a shop that trades outside the usual hours", () => {
    const grid = rhythmGrid({ weeks: 2, cells: [{ weekday: 2, hour: 5, orders: 4 }] })
    expect(grid.hours[0]).toBe(5)
    expect(rhythmSentence(grid.peak)).toBe("Tuesday around 5 am is your busiest time.")
    expect(grid.rows[1]!.cells[0]).toMatchObject({ average: "2", step: 7 })
  })

  it("distinguishes 'never measured' from 'measured a moment ago'", () => {
    const now = new Date(NOW).getTime()
    expect(freshness(null, now)).toBe("not updated yet")
    expect(freshness("2026-09-14T03:59:30.000Z", now)).toBe("updated a moment ago")
    expect(freshness("2026-09-14T03:56:00.000Z", now)).toBe("updated 4 minutes ago")
  })
})

describe("the CSV export", () => {
  it("carries the window, the basis and the freshness with the figures", () => {
    const csv = insightsCsv(dto("7d"), new Date(NOW).getTime())
    expect(csv).toContain("Effy shop insights,Last 7 days")
    expect(csv).toContain("Compared with,")
    expect(csv).toContain("Figures,updated 2 minutes ago")
    expect(csv).toContain("Revenue (goods, less refunds)")
  })

  it("quotes a product name containing a comma", () => {
    expect(insightsCsv(dto("7d"), new Date(NOW).getTime())).toContain('"Rice, 1 kg"')
  })
})
