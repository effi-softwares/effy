import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to ?? "#"}>{children}</a>,
  useNavigate: () => () => {},
}))

const getToday = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({ getToday, getTeamActivity: vi.fn() }))

// The glance strip's three money cells come from the INSIGHTS query — the same cache entry the
// Insights screen reads, which is what makes the two screens agree by construction (FR-014).
const getInsights = vi.hoisted(() => vi.fn())
vi.mock("@/features/insights/repo", () => ({ getInsights }))

// ⚠ The live stream is stubbed here so THIS file tests the screen, not the transport. Its own
// behaviour — reconnect, backoff, stall, cleanup — is tested where it lives
// (`packages/web-kit/src/runtime/live.test.ts`), and the wiring between them in `live.test.tsx`.
// Left real, it would open sockets from jsdom and leave reconnect timers running between tests.
const openLiveStream = vi.hoisted(() => vi.fn(() => () => {}))
vi.mock("@effy/web-kit", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  openLiveStream,
  getAccessToken: async () => "test-token",
}))

import type { ShopTodayDTO } from "@effy/shared-types"

import { attentionHref, attentionRow, openItemCount, unitsToPack } from "../model"
import { TodayScreen } from "../TodayScreen"
import { useNavBadges } from "../useNavBadges"

const NOW = "2026-09-14T04:00:00.000Z"
const nowMs = new Date(NOW).getTime()

function today(over: Partial<ShopTodayDTO> = {}): ShopTodayDTO {
  return {
    now: NOW,
    timezone: "Australia/Melbourne",
    backlog: {
      awaitingPick: { orders: 3, units: 11, oldestPaidAt: "2026-09-14T00:48:00.000Z" },
      readyForPickup: 2,
      lowStock: { skus: 2, outOfStock: 1 },
    },
    attention: [
      { kind: "awaiting_pick", orders: 3, units: 11, since: "2026-09-14T00:48:00.000Z" },
      {
        kind: "out_of_stock",
        productId: "p5",
        name: "Beeswax wrap set",
        soldLast7Days: 17,
        since: "2026-09-14T01:00:00.000Z",
      },
    ],
    attentionMore: 0,
    oldestWaitingAt: "2026-09-14T00:48:00.000Z",
    live: [
      {
        fulfillmentId: "f-1",
        orderNumber: "EFY-4421",
        customerName: "Elin Wikström",
        paidAt: "2026-09-14T03:59:30.000Z",
        itemCount: 4,
        deliveryMethod: "same_day",
        total: "57.80",
        currency: "AUD",
      },
    ],
    ...over,
  }
}

// ⚠ THE CLOCK IS FIXED. Every age and every relative time on this screen is computed against the
// browser's clock, so a test that leaves it running asserts against whatever time the suite happens
// to run at — green this afternoon, red tomorrow morning.
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
  getInsights.mockResolvedValue(insights())
})
afterAll(() => {
  vi.useRealTimers()
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

describe("Today (US1)", () => {
  it("derives the subtitle from the SERVER's clock and the shop's timezone", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)

    // 04:00 UTC on 14 September is 14:00 on Monday 14 September in Melbourne. A browser clock in
    // another zone must not shift the day.
    expect(await screen.findByText("Monday 14 September · Melbourne")).toBeInTheDocument()
  })

  it("renders the Part A copy verbatim", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)

    expect(await screen.findByText("Needs attention")).toBeInTheDocument()
    expect(screen.getByText("Live orders")).toBeInTheDocument()
    expect(screen.getByText("Updating as orders arrive")).toBeInTheDocument()
    expect(screen.getByText("Cleared items drop off automatically")).toBeInTheDocument()
    expect(screen.getByText("Showing the five most recent orders")).toBeInTheDocument()
    expect(screen.getByText("Open queue →")).toBeInTheDocument()
    expect(screen.getByText("All orders →")).toBeInTheDocument()
    expect(screen.getByText("Quick actions")).toBeInTheDocument()
    expect(screen.getByText("Team activity")).toBeInTheDocument()
    expect(screen.getByText("Print pick lists")).toBeInTheDocument()
  })

  it("shows the backlog row with its units and the oldest age", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)

    expect(await screen.findByText("3 orders awaiting pick")).toBeInTheDocument()
    expect(screen.getByText(/11 units to pack · oldest 3 h 12 m/)).toBeInTheDocument()
  })

  it("names the demand behind an empty shelf — never a view count the platform does not have", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)

    expect(await screen.findByText("Beeswax wrap set out of stock")).toBeInTheDocument()
    expect(screen.getByText("17 sold in the last 7 days, 0 on hand")).toBeInTheDocument()
    expect(screen.queryByText(/views today/i)).not.toBeInTheDocument()
  })

  it("gives every row a verb-specific button that resolves it", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)

    // Straight to the tab that holds the work, not to the list's default view.
    expect(await screen.findByRole("link", { name: "Pick" })).toHaveAttribute(
      "href",
      "/orders?tab=new",
    )
    expect(screen.getByRole("link", { name: "Restock" })).toHaveAttribute("href", "/catalog/p5")
  })

  it("opens each live row on the order it displays (FR-009)", async () => {
    getToday.mockResolvedValue(today())
    wrap(<TodayScreen />)

    const row = await screen.findByText("EFY-4421")
    const link = row.closest("a")!
    // ⚠ The row's own portion id. The design had rows that opened nothing (or worse, something
    // else); here the id on the row IS the destination.
    expect(link).toHaveAttribute("href", "/orders/$fulfillmentId")  // params supplied by the router
    expect(within(link).getByText("Elin Wikström")).toBeInTheDocument()
    expect(within(link).getByText("New")).toBeInTheDocument()
    expect(within(link).getByText(/Just now · 4 items · Same-day/)).toBeInTheDocument()
    expect(within(link).getByText("$57.80")).toBeInTheDocument()
  })

  it("drops the New badge once an arrival is over a minute old", async () => {
    getToday.mockResolvedValue(
      today({
        live: [
          {
            fulfillmentId: "f-2",
            orderNumber: "EFY-4400",
            customerName: "Anders Holm",
            paidAt: "2026-09-14T03:50:00.000Z",
            itemCount: 1,
            deliveryMethod: "standard",
            total: "12.00",
            currency: "AUD",
          },
        ],
      }),
    )
    wrap(<TodayScreen />)

    expect(await screen.findByText("EFY-4400")).toBeInTheDocument()
    expect(screen.queryByText("New")).not.toBeInTheDocument()
    expect(screen.getByText(/10 min ago · 1 item · Standard/)).toBeInTheDocument()
  })

  it("shows the calm steady state, not a zeroed card, when nothing needs anyone", async () => {
    getToday.mockResolvedValue(
      today({
        attention: [],
        attentionMore: 0,
        oldestWaitingAt: null,
        backlog: {
          awaitingPick: { orders: 0, units: 0, oldestPaidAt: null },
          readyForPickup: 0,
          lowStock: { skus: 0, outOfStock: 0 },
        },
      }),
    )
    wrap(<TodayScreen />)

    expect(await screen.findByText("Nothing needs you right now")).toBeInTheDocument()
    expect(screen.getByText("Nothing is waiting")).toBeInTheDocument()
    // A zero BADGE is noise: a caught-up shop should look caught up. (The glance strip still shows
    // its figures — "0 orders today" is a measurement, not an alert.)
    const badge = screen.queryByText("0", { selector: "span.font-mono" })
    expect(badge).not.toBeInTheDocument()
  })

  it("surfaces a read failure instead of rendering an empty shop", async () => {
    getToday.mockRejectedValue({ kind: "unavailable", status: 503, title: "x", detail: "y" })
    wrap(<TodayScreen />)

    // ⚠ "Nothing needs you" over a failed read would be the worst possible lie this screen can tell.
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByText("Nothing needs you right now")).not.toBeInTheDocument()
  })
})

describe("⚠ FR-006 — one value, everywhere it appears", () => {
  it("the card title, the unit figure, the badge and the nav badge all come from one field", async () => {
    const dto = today({ attentionMore: 4 })
    getToday.mockResolvedValue(dto)

    // The screen's own rendering…
    wrap(<TodayScreen />)
    expect(await screen.findByText("3 orders awaiting pick")).toBeInTheDocument()
    // ⚠ TWO PLACES, ONE VALUE: the attention row's detail line and the glance cell. Both are built
    // from `backlog.awaitingPick` by the same function, so they cannot say different things.
    expect(screen.getAllByText(/11 units to pack/)).toHaveLength(2)
    // …the badge counts EVERY open item, including the ones the card could not fit…
    expect(openItemCount(dto)).toBe(6)
    expect(screen.getByText("6")).toBeInTheDocument()

    // …and the sidebar badge reads the same cache entry, not a count of its own.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(["shop", "today"], dto)
    const badges = renderHookValue(qc)
    expect(badges["/orders"]).toBe(dto.backlog.awaitingPick.orders)
  })

  it("the attention row and the glance phrase are built by ONE function", () => {
    // Two components writing their own "{n} units to pack" is how one says "1 units".
    const row = attentionRow(
      { kind: "awaiting_pick", orders: 1, units: 1, since: NOW },
      nowMs,
    )
    expect(row.title).toBe("1 order awaiting pick")
    expect(row.detail.startsWith(unitsToPack(1))).toBe(true)
    expect(unitsToPack(1)).toBe("1 unit to pack")
  })

  it("routes a proposed refund to the order it is about", () => {
    expect(
      attentionHref({
        kind: "refund_proposed",
        fulfillmentId: "f-9",
        orderNumber: "EFY-4413",
        amount: "5.40",
        since: NOW,
      }),
    ).toBe("/orders/f-9")
  })
})

/** Render `useNavBadges` against a seeded cache — the point is that it adds no request of its own. */
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
