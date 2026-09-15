import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to ?? "#"}>{children}</a>,
  useNavigate: () => () => {},
}))

const getInsights = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({ getInsights }))

const getToday = vi.hoisted(() => vi.fn())
vi.mock("@/features/today/repo", () => ({ getToday, getTeamActivity: vi.fn() }))

import type { InsightsRange, ShopInsightsDTO, ShopTodayDTO } from "@effy/shared-types"

import { insightsCsv } from "../exportCsv"
import { InsightsScreen } from "../InsightsScreen"
import { deltaText, freshness, windowSubtitle } from "../model"

const NOW = "2026-09-14T04:00:00.000Z"

function dto(range: InsightsRange = "7d", over: Partial<ShopInsightsDTO> = {}): ShopInsightsDTO {
  return {
    range,
    timezone: "Australia/Melbourne",
    window: { from: "2026-09-07T14:00:00.000Z", to: NOW },
    comparison: {
      basis: range === "today" ? "same_weekday_last_week" : "previous_7_days",
      from: "2026-08-31T14:00:00.000Z",
      to: "2026-09-07T14:00:00.000Z",
    },
    computedAt: "2026-09-14T03:58:00.000Z",
    currency: "AUD",
    primary: {
      revenue: { value: "11864.00", previous: "10884.00", change: { kind: "pct", amount: "9" } },
      orders: {
        value: "163",
        previous: "152",
        change: { kind: "abs", amount: "11" },
        perDay: "23",
        lastHour: null,
      },
      averageOrderValue: {
        value: "72.80",
        previous: "74.30",
        change: { kind: "pct", amount: "-2.0" },
      },
    },
    secondary: {
      refunds: { value: "318.00", previous: "280.00", change: { kind: "pct", amount: "13" }, orders: 5 },
      cantSupply: { value: "2", previous: "3", change: { kind: "abs", amount: "-1" }, units: 4 },
      cancelled: { value: "1", previous: "0", change: { kind: "none", amount: null } },
    },
    series: {
      grain: range === "today" ? "hour" : range === "7d" ? "day" : "week",
      buckets: [
        { start: "2026-09-07T14:00:00.000Z", label: "Mon 8", partial: false, revenue: "1200.00", orders: 20 },
        { start: "2026-09-08T14:00:00.000Z", label: "Tue 9", partial: false, revenue: "900.00", orders: 15 },
        { start: "2026-09-13T14:00:00.000Z", label: "Mon 14", partial: true, revenue: "400.00", orders: 8 },
      ],
      revenueTotal: { value: "11864.00", previous: "10884.00", change: { kind: "pct", amount: "9" } },
      ordersTotal: { value: "163", previous: "152", change: { kind: "abs", amount: "11" } },
    },
    topProducts: [
      {
        productId: "p1",
        name: "Linen apron, sand",
        sku: "EFF-APR-01",
        thumbnailUrl: null,
        units: 88,
        revenue: "3951.00",
        share: 1,
      },
    ],
    ...over,
  }
}

function today(): ShopTodayDTO {
  return {
    now: NOW,
    timezone: "Australia/Melbourne",
    backlog: {
      awaitingPick: { orders: 4, units: 11, oldestPaidAt: "2026-09-14T00:48:00.000Z" },
      readyForPickup: 2,
      lowStock: { skus: 5, outOfStock: 2 },
    },
    attention: [],
    attentionMore: 0,
    oldestWaitingAt: null,
    live: [],
  }
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
})
afterAll(() => vi.useRealTimers())

beforeEach(() => {
  getInsights.mockImplementation(async (range: InsightsRange) => dto(range))
  getToday.mockResolvedValue(today())
})

describe("Insights (US3)", () => {
  it("titles the page by range and states the window, the basis and the freshness", async () => {
    wrap(<InsightsScreen />)
    // Opens on Today.
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument()
    // The fixture's figures were computed two minutes ago, and the subtitle says exactly that —
    // "a moment ago" over two-minute-old numbers would be a small, constant lie.
    expect(
      screen.getByText(/compared with the same day last week · updated 2 minutes ago/),
    ).toBeInTheDocument()
  })

  it("restates the window in each metric label", async () => {
    wrap(<InsightsScreen />)
    await screen.findByText("Revenue today")
    await userEvent.click(screen.getByRole("button", { name: "7 days" }))

    expect(await screen.findByText("Revenue, 7 days")).toBeInTheDocument()
    expect(screen.getByText("Orders, 7 days")).toBeInTheDocument()
  })

  it("⚠ takes Awaiting pick and Unfulfilled units from TODAY, not from the analytics payload", async () => {
    wrap(<InsightsScreen />)
    await screen.findByText("Awaiting pick")

    // The same live figures Today shows — a minute-old backlog would send someone to a shelf for an
    // order already packed (FR-006/FR-025).
    const strip = screen.getByText("Awaiting pick").closest("div")!.parentElement!
    expect(within(strip).getByText("4")).toBeInTheDocument()
    expect(within(strip).getByText("11")).toBeInTheDocument()
  })

  it("changes every figure and both charts together when the range changes", async () => {
    wrap(<InsightsScreen />)
    await screen.findByText("Revenue today")

    await userEvent.click(screen.getByRole("button", { name: "30 days" }))
    expect(await screen.findByRole("heading", { name: "Last 30 days" })).toBeInTheDocument()
    expect(screen.getByText(/By week · Goods · AUD/)).toBeInTheDocument()
    expect(screen.getByText(/By week · paid orders/)).toBeInTheDocument()
    // ⚠ A PERIOD label, never the chart's bucket label.
    expect(screen.getByText("By revenue, last 30 days")).toBeInTheDocument()
  })

  it("⚠ never claims a tax basis, and names the money basis instead", async () => {
    wrap(<InsightsScreen />)
    await screen.findByText("Revenue today")

    // The design said "SEK incl. VAT". Per-item GST is unmodelled (052 R13), so any tax claim here
    // would be invented — and "Goods" is what stops this being read as the order totals elsewhere.
    expect(screen.queryByText(/VAT/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/incl\. GST/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Goods · AUD/)).toBeInTheDocument()
  })

  it("⚠ offers no conversion rate, new customers or returns figure (FR-034)", async () => {
    wrap(<InsightsScreen />)
    await screen.findByText("Refunds")

    // A shop has no storefront of its own to convert, customer data is withheld from shops, and the
    // platform has no returns model. Each of these would have to be invented to be displayed.
    expect(screen.queryByText(/Conversion rate/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/New customers/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Returns open/i)).not.toBeInTheDocument()
    // The slots carry figures the platform can stand behind.
    expect(screen.getByText("Can't supply")).toBeInTheDocument()
    expect(screen.getByText("Cancelled")).toBeInTheDocument()
    expect(screen.getByText("Ready for pickup")).toBeInTheDocument()
  })

  it("drills each secondary figure through to the list that explains it", async () => {
    wrap(<InsightsScreen />)
    await screen.findByText("Refunds")

    expect(screen.getByText("Refunds").closest("a")).toHaveAttribute("href", "/orders")
    expect(screen.getByText("Low stock SKUs").closest("a")).toHaveAttribute("href", "/catalog")
  })

  it("renders a bar per bucket, including the empty ones", async () => {
    wrap(<InsightsScreen />)
    await screen.findByText("Revenue today")
    // A missing bar and a zero bar say different things; the chart draws every bucket the window has.
    expect(screen.getAllByTitle(/Mon 8/)).toHaveLength(2) // both charts
    expect(screen.getAllByTitle(/Mon 14 \(partial\)/)).toHaveLength(2)
  })

  it("shows an empty window as zeros with a plain statement, never an error", async () => {
    getInsights.mockResolvedValue(
      dto("7d", {
        primary: {
          revenue: { value: "0.00", previous: "0.00", change: { kind: "none", amount: null } },
          orders: {
            value: "0",
            previous: "0",
            change: { kind: "none", amount: null },
            perDay: "0",
            lastHour: null,
          },
          averageOrderValue: { value: "0.00", previous: "0.00", change: { kind: "none", amount: null } },
        },
        series: {
          grain: "day",
          buckets: [],
          revenueTotal: { value: "0.00", previous: "0.00", change: { kind: "none", amount: null } },
          ordersTotal: { value: "0", previous: "0", change: { kind: "none", amount: null } },
        },
        topProducts: [],
      }),
    )
    wrap(<InsightsScreen />)

    expect(await screen.findAllByText("No sales in this window.")).toHaveLength(2)
    expect(screen.getByText("Nothing sold in this window yet.")).toBeInTheDocument()
    expect(screen.getAllByText("Nothing to compare yet").length).toBeGreaterThan(0)
  })

  it("surfaces a failed read instead of an empty-looking shop", async () => {
    getInsights.mockRejectedValue({ kind: "unavailable", status: 503, title: "x", detail: "y" })
    wrap(<InsightsScreen />)
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument()
  })
})

describe("the copy rules", () => {
  it("⚠ carries direction in the glyph and the sign, never in a colour", () => {
    // Rendered in greyscale — or by a screen reader — these still say exactly what they mean.
    expect(deltaText(dto().primary.revenue, "previous_7_days")).toBe("▲ 9% vs previous week")
    expect(deltaText(dto().primary.averageOrderValue, "previous_7_days")).toBe("▼ 2% vs previous week")
    expect(deltaText(dto().primary.orders, "previous_7_days")).toBe("▲ 11 vs previous week")
    expect(deltaText(dto().secondary.cancelled, "previous_7_days")).toBe("Nothing to compare yet")
  })

  it("distinguishes 'never measured' from 'measured a moment ago'", () => {
    const now = new Date(NOW).getTime()
    // A shop whose rollups have never run shows zeros; saying "updated a moment ago" over them would
    // present an absence as a measurement.
    expect(freshness(null, now)).toBe("not updated yet")
    expect(freshness("2026-09-14T03:59:30.000Z", now)).toBe("updated a moment ago")
    expect(freshness("2026-09-14T03:56:00.000Z", now)).toBe("updated 4 minutes ago")
  })

  it("states the window in the shop's own timezone", () => {
    const subtitle = windowSubtitle(dto("7d"), new Date(NOW).getTime())
    expect(subtitle).toContain("8 September – 14 September")
    expect(subtitle).toContain("compared with the previous week")
  })
})

describe("the CSV export", () => {
  it("carries the window, the basis and the freshness with the figures", () => {
    const csv = insightsCsv(dto("7d"), new Date(NOW).getTime())
    expect(csv).toContain("Effy shop insights,Last 7 days")
    expect(csv).toContain("Window,")
    expect(csv).toContain("Compared with,")
    // A column of numbers with no window attached is a number nobody can check later.
    expect(csv).toContain("Figures,updated 2 minutes ago")
    expect(csv).toContain("Revenue (goods, less refunds)")
  })

  it("quotes a product name containing a comma", () => {
    const csv = insightsCsv(dto("7d"), new Date(NOW).getTime())
    expect(csv).toContain('"Linen apron, sand"')
  })
})
