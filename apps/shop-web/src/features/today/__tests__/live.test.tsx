import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to ?? "#"}>{children}</a>,
  useNavigate: () => () => {},
}))

const getToday = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({ getToday, getTeamActivity: vi.fn() }))

/** Captures the options `useShopLive` passes, so the test can drive the stream by hand. */
interface CapturedOpts {
  url: string
  onOpen: () => void
  onClose: (reason: string) => void
  onEvent: (e: { event: string; data: string }) => void
}
const captured = vi.hoisted(() => ({ opts: null as CapturedOpts | null }))
const stop = vi.hoisted(() => vi.fn())
const openLiveStream = vi.hoisted(() =>
  vi.fn((o: unknown) => {
    captured.opts = o as CapturedOpts
    return stop
  }),
)
vi.mock("@effy/web-kit", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  openLiveStream,
  getAccessToken: async () => "test-token",
}))

import type { ShopTodayDTO } from "@effy/shared-types"

import { FALLBACK_INTERVAL_MS, LIVE_SAFETY_INTERVAL_MS, todayQueryFor } from "../queries"
import { TodayScreen } from "../TodayScreen"

const NOW = "2026-09-14T04:00:00.000Z"

function today(over: Partial<ShopTodayDTO> = {}): ShopTodayDTO {
  return {
    now: NOW,
    timezone: "Australia/Melbourne",
    backlog: {
      awaitingPick: { orders: 1, units: 2, oldestPaidAt: NOW },
      readyForPickup: 0,
      lowStock: { skus: 0, outOfStock: 0 },
    },
    attention: [{ kind: "awaiting_pick", orders: 1, units: 2, since: NOW }],
    attentionMore: 0,
    oldestWaitingAt: NOW,
    live: [],
    ...over,
  }
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { qc, ...render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>) }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
  captured.opts = null
  getToday.mockResolvedValue(today())
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("Today, made live (US2)", () => {
  it("subscribes to core-api's stream with the shop's own token", async () => {
    wrap(<TodayScreen />)
    await screen.findByText("1 order awaiting pick")

    expect(openLiveStream).toHaveBeenCalledTimes(1)
    expect(captured.opts!.url).toMatch(/\/v1\/shop\/live$/)
  })

  it("refetches on a poke — debounced, so a burst costs one read", async () => {
    wrap(<TodayScreen />)
    await screen.findByText("1 order awaiting pick")
    const before = getToday.mock.calls.length

    // A van-load checked in at the hub: several transactions in quick succession.
    captured.opts!.onEvent({ event: "poke", data: "{}" })
    captured.opts!.onEvent({ event: "poke", data: "{}" })
    captured.opts!.onEvent({ event: "poke", data: "{}" })

    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(getToday.mock.calls.length).toBe(before + 1))
  })

  it("⚠ refetches on (re)connect rather than assuming it missed nothing", async () => {
    wrap(<TodayScreen />)
    await screen.findByText("1 order awaiting pick")
    const before = getToday.mock.calls.length

    // A reconnect means we were blind for some interval, and NOTIFY is not durable: whatever
    // happened in the gap is simply gone. Rebuilding is the only honest response.
    captured.opts!.onOpen()
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(getToday.mock.calls.length).toBe(before + 1))
  })

  it("treats a resync exactly as a poke — both mean 'read again'", async () => {
    wrap(<TodayScreen />)
    await screen.findByText("1 order awaiting pick")
    const before = getToday.mock.calls.length

    captured.opts!.onEvent({ event: "resync", data: "{}" })
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(getToday.mock.calls.length).toBe(before + 1))
  })

  it("⚠ stops the stream on unmount (FR-029)", async () => {
    const { unmount } = wrap(<TodayScreen />)
    await screen.findByText("1 order awaiting pick")

    // Counted as a delta: Testing Library's auto-cleanup unmounts the PREVIOUS test's tree around
    // this one, so an absolute count here would measure the suite rather than this component.
    const before = stop.mock.calls.length
    unmount()
    expect(stop.mock.calls.length).toBe(before + 1)
  })

  it("polls faster when there is no stream, and slower when there is", () => {
    // The UI is identical in both modes (FR-028); only the pace of the same query changes.
    expect(todayQueryFor(false).refetchInterval).toBe(FALLBACK_INTERVAL_MS)
    expect(todayQueryFor(true).refetchInterval).toBe(LIVE_SAFETY_INTERVAL_MS)
    // ⚠ Not zero when connected: pokes are best-effort, so a slow safety refetch bounds the window
    // in which a missed one could leave the screen stale.
    expect(LIVE_SAFETY_INTERVAL_MS).toBeGreaterThan(0)
    expect(todayQueryFor(true).queryKey).toEqual(todayQueryFor(false).queryKey)
  })

  it("renders identically whether or not the stream is connected", async () => {
    const { unmount } = wrap(<TodayScreen />)
    const offline = (await screen.findByText("1 order awaiting pick")).closest("section")!.innerHTML
    unmount()

    const { unmount: u2 } = wrap(<TodayScreen />)
    await screen.findByText("1 order awaiting pick")
    captured.opts!.onOpen()
    await vi.advanceTimersByTimeAsync(500)
    const online = screen.getByText("1 order awaiting pick").closest("section")!.innerHTML
    u2()

    // ⚠ No "live" badge, no "reconnecting" strip, no second empty state. The operator should never
    // have to know which mode they are in — FR-028 in one assertion.
    expect(online).toBe(offline)
  })
})
