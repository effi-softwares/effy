import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    className,
    "aria-current": current,
  }: {
    children: ReactNode
    to?: string
    params?: Record<string, string>
    className?: string
    "aria-current"?: "page"
  }) => {
    let href = to ?? "#"
    for (const [k, v] of Object.entries(params ?? {})) href = href.replace(`$${k}`, v)
    return (
      <a href={href} className={className} aria-current={current}>
        {children}
      </a>
    )
  },
  useNavigate: () => navigate,
  useSearch: () => ({}),
}))

const getInsights = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({ getInsights }))

import type { InsightsFigureDTO, InsightsRange } from "@effy/shared-types"

import { CHARTS } from "../charts"
import { insightsCsv } from "../exportCsv"
import { ChartScreen, InsightsScreen, type InsightsTab } from "../InsightsScreen"
import { axisStep } from "../LineChart"
import { busiest, freshness, headline, rhythmGrid, spreadSentence, timeWords, worstRun, worthDoing } from "../model"
import { insightsDto, NOW } from "./fixtures"

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}
const open = (page: InsightsTab = "overview", range: InsightsRange = "7d") => wrap(<InsightsScreen page={page} range={range} />)
const loaded = () => screen.findByRole("link", { name: "Overview" }).then(() => vi.waitFor(() => expect(screen.queryAllByRole("status", { busy: true })).toHaveLength(0)))

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(() => {
  vi.clearAllMocks()
  getInsights.mockImplementation(async (range: InsightsRange) => insightsDto({}, range))
})

describe("the page's head", () => {
  it("says what it counts and how fresh it is, and offers five pages", async () => {
    open()
    expect(await screen.findByText("Your goods only · updated a moment ago")).toBeInTheDocument()
    const nav = screen.getByRole("navigation", { name: "Insights pages" })
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Overview", "Sales", "Products", "Stock", "Service"])
  })

  it("says the figures are being prepared rather than showing zeros", async () => {
    getInsights.mockResolvedValue(insightsDto({ computedAt: null }))
    open()
    expect(await screen.findByText("Your figures are being prepared")).toBeInTheDocument()
  })

  it("keeps the range and the pages when the read fails, so another can be tried", async () => {
    getInsights.mockRejectedValue({ kind: "unavailable", status: 503, title: "x", detail: "y" })
    open()
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Insights pages" })).toBeInTheDocument()
    expect(screen.getByRole("radiogroup", { name: "Range" })).toBeInTheDocument()
  })
})

describe("Overview", () => {
  it("opens with the sentence, then what changed, each opening its page", async () => {
    open()
    await loaded()
    expect(document.querySelector('[data-tour="insights.figures"]')).toHaveTextContent(/A strong week\. Sales are .*, up 12% on the week before, from 196 orders\./)
    const changed = screen.getByRole("list", { name: "What changed" })
    expect(within(changed).getByText("Sourdough loaf sold out 3 times").closest("a")).toHaveAttribute("href", "/insights/stock")
  })

  it("says what is worth doing, biggest cost first", async () => {
    open()
    await loaded()
    const worth = screen.getByRole("region", { name: "Worth doing" })
    expect(within(worth).getByText("Selling but out of stock")).toBeInTheDocument()
    expect(within(worth).getByText("Not ready for the 12:30 pm driver")).toBeInTheDocument()
    expect(within(worth).getByRole("link", { name: "Restock" })).toHaveAttribute("href", "/catalog/p1?size=v1")
  })

  it("lays secondary charts out as cards that open their own page", async () => {
    open()
    await loaded()
    const closer = screen.getByRole("region", { name: "Look closer" })
    expect(within(closer).getByText("The 12:30 pm driver is the one you miss most").closest("a")).toHaveAttribute("href", "/insights/service/ready-for-each-driver")
  })

  it("says plainly when nothing sold", async () => {
    getInsights.mockResolvedValue(insightsDto({ primary: { ...insightsDto().primary, orders: { ...insightsDto().primary.orders, value: "0" } } }))
    open()
    expect(await screen.findByText("Nothing sold in this period.")).toBeInTheDocument()
  })
})

describe("Sales", () => {
  it("charts one measure at a time, with items per order among them", async () => {
    open("sales")
    await loaded()
    await userEvent.click(screen.getByRole("radio", { name: "Items per order" }))
    expect(screen.getByText("6.8")).toBeInTheDocument()
  })

  it("puts every sales chart in a card, never two charts side by side", async () => {
    open("sales")
    await loaded()
    for (const c of CHARTS.filter((x) => x.page === "sales")) {
      expect(screen.getByText(c.label).closest("a")).toHaveAttribute("href", `/insights/sales/${c.slug}`)
    }
  })

  it("drills behind the sales to the orders that explain them", async () => {
    open("sales")
    await loaded()
    expect(screen.getByText("Refunds").closest("a")).toHaveAttribute("href", "/orders?payment=refunded")
  })
})

describe("Products", () => {
  it("ranks by sales, with share, place and stock left", async () => {
    open("products")
    await loaded()
    expect(screen.getByText(/24 of your 85 products bring 80% of your sales/)).toBeInTheDocument()
    const best = screen.getByRole("region", { name: /Best sellers/ })
    const row = within(best).getByRole("link", { name: "Sourdough loaf" }).closest("tr")!
    expect(row).toHaveTextContent("6.4%")
    expect(row).toHaveTextContent("Out of stock")
    expect(screen.getByText("with Free-range eggs")).toBeInTheDocument()
  })

  it("reads what is selling but out of stock for the range shown, not from Today", async () => {
    open("products")
    await loaded()
    expect(screen.getByText("Sold 64 this week")).toBeInTheDocument()
  })
})

describe("Stock", () => {
  it("says what runs out, what sold out and what it cost", async () => {
    open("stock")
    await loaded()
    expect(screen.getByText(/Selling out this week cost about \$160/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Hummus 200g" })).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Running out" })).getByText("Today")).toBeInTheDocument()
    expect(screen.getByText("Still out")).toBeInTheDocument()
    expect(screen.getByText("Tahini 400g")).toBeInTheDocument()
  })

  it("says stock couldn't load, without blanking the rest of Insights", async () => {
    getInsights.mockResolvedValue(insightsDto({ stock: null }))
    open("stock")
    expect(await screen.findByText(/Couldn’t load stock/)).toBeInTheDocument()
  })
})

describe("Service", () => {
  it("shows four measures as cards, each opening its chart", async () => {
    open("service")
    await loaded()
    expect(screen.getByText("97.8%").closest("a")).toHaveAttribute("href", "/insights/service/found-rate")
    expect(screen.getByText("91%").closest("a")).toHaveAttribute("href", "/insights/service/ready-for-each-driver")
  })

  it("shows who picked only when the server sends it (managers)", async () => {
    open("service")
    await loaded()
    expect(screen.queryByRole("region", { name: /Who picked/ })).not.toBeInTheDocument()
  })

  it("names who picked for a manager", async () => {
    getInsights.mockResolvedValue(insightsDto({ pickers: [{ staffId: "s1", name: "Kim Tran", orders: 84, averageTimeToReady: 780, cantSupplyUnits: 4 }] }))
    open("service")
    expect(await screen.findByText("Kim Tran")).toBeInTheDocument()
  })
})

describe("a chart on its own page", () => {
  it("states the finding, draws the chart, and says how it is counted", async () => {
    wrap(<ChartScreen slug="by-aisle" range="7d" />)
    expect(await screen.findByText("Dairy & eggs sells most: $1,942.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How it’s counted" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Sales/ })).toHaveAttribute("href", "/insights/sales")
  })

  it("offers the same numbers as a table", async () => {
    wrap(<ChartScreen slug="order-size" range="7d" />)
    await userEvent.click(await screen.findByRole("button", { name: "Show table" }))
    expect(screen.getByRole("cell", { name: "6-10" })).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "79" })).toBeInTheDocument()
  })

  it("reads the rhythm's squares out on keyboard focus", async () => {
    wrap(<ChartScreen slug="when-orders-come-in" range="7d" />)
    const sat = await screen.findByRole("button", { name: /Saturday, 11 am/ })
    fireEvent.focus(sat)
    const tip = document.querySelector(".ef-tip")!
    expect(tip).toHaveTextContent("Saturday, 11 am to 12 pm")
    expect(tip).toHaveTextContent("Saturday’s busiest hour")
  })

  it("says so for a chart that does not exist", async () => {
    wrap(<ChartScreen slug="nope" range="7d" />)
    expect(await screen.findByText("There is no such chart")).toBeInTheDocument()
  })
})

describe("the words", () => {
  const figure = (amount: string | null): InsightsFigureDTO => ({ value: "1", previous: "1", change: amount === null ? { kind: "none", amount } : { kind: "pct", amount } })

  it("leaves the comparison out when there is none", () => {
    const d = insightsDto({ briefing: { ...insightsDto().briefing, mood: null }, primary: { ...insightsDto().primary, revenue: figure(null) } })
    expect(headline(d)).toMatchObject({ mood: "", change: null })
  })

  it("names the run missed most, and the busiest hour", () => {
    expect(worstRun(insightsDto().runs)).toEqual({ time: "12:30", due: 61, ready: 52 })
    expect(timeWords("12:30")).toBe("12:30 pm")
    expect(timeWords("15:00")).toBe("3 pm")
    expect(busiest(insightsDto().rhythm)).toEqual({ weekday: 6, hour: 11, perHour: 6.75 })
  })

  it("says it couldn't check stock rather than that there is nothing to do", () => {
    const rows = worthDoing(insightsDto({ stock: null }))
    expect(rows.find((r) => r.id === "oos")).toMatchObject({ failed: true, n: null })
  })

  it("reads the busiest range as minutes", () => {
    expect(spreadSentence([9, 1, 0, 0, 0, 0])).toBe("Most orders are ready in under 10 minutes.")
  })

  it("rounds an axis to a step a person would pick", () => {
    expect(axisStep(1669)).toBe(500)
    expect(axisStep(0)).toBe(1)
  })

  it("widens the rhythm for a shop that trades outside the usual hours", () => {
    expect(rhythmGrid({ weeks: 2, cells: [{ weekday: 2, hour: 5, orders: 4 }] }).hours[0]).toBe(5)
  })

  it("distinguishes 'never measured' from 'measured a moment ago'", () => {
    const now = new Date(NOW).getTime()
    expect(freshness(null, now)).toBe("not updated yet")
    expect(freshness("2026-09-14T03:56:00.000Z", now)).toBe("updated 4 minutes ago")
  })
})

describe("the CSV export", () => {
  it("carries the window, the basis and the freshness with the figures", () => {
    const csv = insightsCsv(insightsDto(), new Date(NOW).getTime())
    expect(csv).toContain("Effy shop insights,Last 7 days")
    expect(csv).toContain("Compared with,")
  })
})
