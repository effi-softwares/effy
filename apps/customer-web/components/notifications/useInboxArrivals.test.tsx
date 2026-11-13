import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.hoisted(() => vi.fn())
const pathname = vi.hoisted(() => ({ current: "/" }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => pathname.current }))
const toast = vi.hoisted(() => Object.assign(vi.fn(), { info: vi.fn() }))
vi.mock("@effy/design-system/toast", () => ({ toast }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

const { useInboxArrivals } = await import("./useInboxArrivals")

const item = (id: string, createdAt: string, o: Record<string, unknown> = {}) => ({
  id,
  type: "order_out_for_delivery",
  category: "orders",
  importance: "normal",
  title: `Title ${id}`,
  body: "",
  destination: { kind: "order", orderId: `o-${id}` },
  createdAt,
  readAt: null,
  pinnedUntil: null,
  ...o,
})

let page: { pinned: unknown[]; items: unknown[] }
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ...page, nextCursor: null, categories: null, unseenCount: 0 }) }))

beforeEach(() => {
  vi.clearAllMocks()
  pathname.current = "/"
  page = { pinned: [], items: [item("old", "2026-11-13T09:00:00Z")] }
  vi.stubGlobal("fetch", fetchMock)
})

describe("a toast when a notification arrives on the website (120 US5)", () => {
  it("says nothing on first read, then names one new item with Open", async () => {
    const { rerender } = renderHook(({ n }) => useInboxArrivals(n), { initialProps: { n: 1 } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(toast.info).not.toHaveBeenCalled()

    page = { pinned: [], items: [item("new", "2026-11-13T09:05:00Z"), item("old", "2026-11-13T09:00:00Z")] }
    rerender({ n: 2 })
    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1))
    const [title, opts] = toast.info.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    expect(title).toBe("Title new")
    expect(opts.action.label).toBe("Open")
    expect(fetchMock).toHaveBeenLastCalledWith("/api/notifications?limit=5", { cache: "no-store" })
  })

  it("several at once: how many, and Open goes to the inbox", async () => {
    const { rerender } = renderHook(({ n }) => useInboxArrivals(n), { initialProps: { n: 0 } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    page = { pinned: [], items: [item("a", "2026-11-13T09:05:00Z"), item("b", "2026-11-13T09:04:00Z")] }
    rerender({ n: 2 })
    await waitFor(() => expect(toast.info).toHaveBeenCalled())
    const [title, opts] = toast.info.mock.calls[0] as [string, { action: { onClick: () => void } }]
    expect(title).toBe("2 new notifications")
    opts.action.onClick()
    expect(push).toHaveBeenCalledWith("/account/notifications")
  })

  it("says nothing on the inbox page", async () => {
    pathname.current = "/account/notifications"
    const { rerender } = renderHook(({ n }) => useInboxArrivals(n), { initialProps: { n: 0 } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    page = { pinned: [], items: [item("a", "2026-11-13T09:05:00Z")] }
    rerender({ n: 1 })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(toast.info).not.toHaveBeenCalled()
  })

  it("two quick changes never lose an arrival: the second look waits for the first one's mark", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    fetchMock.mockImplementationOnce(async () => {
      const then = page // what was there when the first look started
      await gate // ...and it is slow; it only sets the mark
      return { ok: true, json: async () => ({ ...then, nextCursor: null, categories: null, unseenCount: 0 }) }
    })
    const { rerender } = renderHook(({ n }) => useInboxArrivals(n), { initialProps: { n: 0 } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender({ n: 1 })
    page = { pinned: [], items: [item("new", "2026-11-13T09:05:00Z"), item("old", "2026-11-13T09:00:00Z")] }
    release()
    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1))
  })

  it("does not read again when the count goes down", async () => {
    const { rerender } = renderHook(({ n }) => useInboxArrivals(n), { initialProps: { n: 3 } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender({ n: 0 })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
