import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { InboxItemDTO, InboxPageDTO } from "@effy/shared-types"

const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/lib/toast-store", () => ({ toast }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

const { InboxView } = await import("./InboxView")

const item = (id: string, minutesAgo: number, extra: Partial<InboxItemDTO> = {}): InboxItemDTO => ({
  id, type: "order_paid", category: "orders", importance: "normal", title: `Order ${id}`, body: "We've received your order.",
  destination: { kind: "order", orderId: `o-${id}` }, createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  readAt: null, pinnedUntil: null, endsLabel: null, ...extra,
})
const page = (over: Partial<InboxPageDTO> = {}): InboxPageDTO => ({
  pinned: [], items: [item("a", 5), item("b", 10)], nextCursor: null, categories: ["orders", "points"], unseenCount: 2, ...over,
})

let calls: Array<{ url: string; init?: RequestInit }>
beforeEach(() => {
  calls = []
  push.mockReset()
  toast.mockReset()
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return { ok: true, status: 200, json: async () => ({}) }
  }))
})

describe("the customer's notifications on the website (110 US6)", () => {
  it("opening the page marks everything shown as seen, and offers only the categories they have", async () => {
    render(<InboxView initial={page()} filter="all" />)
    await waitFor(() => expect(calls.some((c) => c.url === "/api/notifications/seen")).toBe(true))
    expect(screen.getByRole("link", { name: "Points" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Offers" })).toBeNull()
  })

  it("a click records the read and opens the order's page", async () => {
    render(<InboxView initial={page()} filter="all" />)
    await userEvent.click(screen.getByText("Order a"))
    expect(calls.some((c) => c.url === "/api/notifications/a/read")).toBe(true)
    expect(push).toHaveBeenCalledWith("/orders/o-a")
  })

  it("archive takes it off and Undo puts it back", async () => {
    render(<InboxView initial={page()} filter="all" />)
    await userEvent.click(screen.getByRole("button", { name: /Archive “Order a”/ }))
    expect(screen.queryByText("Order a")).toBeNull()
    const [, opts] = toast.mock.calls[0] as [string, { action: { label: string; run: () => void } }]
    expect(opts.action.label).toBe("Undo")
    opts.action.run()
    expect(await screen.findByText("Order a")).toBeTruthy()
    const patches = calls.filter((c) => c.init?.method === "PATCH").map((c) => c.init?.body)
    expect(patches).toEqual([JSON.stringify({ archived: true }), JSON.stringify({ archived: false })])
  })

  it("an empty filter offers a way back, not the first-use message", () => {
    render(<InboxView initial={page({ items: [] })} filter="unread" />)
    expect(screen.getByText("Nothing here")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Show all" })).toBeTruthy()
  })
})
