import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { InboxItemDTO, InboxPageDTO } from "@effy/shared-types"

const push = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { push } }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock("@/lib/api", () => ({ api }))
const markNotificationRead = vi.hoisted(() => vi.fn(async () => "read"))
vi.mock("../api", () => ({ markNotificationRead }))
vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@effy/design-system/ui", async (orig) => ({ ...(await orig<object>()), toast }))

import { validateNotificationsSearch } from "../NotificationsScreen"
import { InboxList } from "../InboxList"
import { flatten, newestShown } from "../inbox-api"

const NOW = Date.now()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString().replace("Z", "123Z").replace(/\.(\d{3})123Z$/, ".$1123Z")

function item(id: string, msAgo: number, extra: Partial<InboxItemDTO> = {}): InboxItemDTO {
  return {
    id, type: "shop_new_order", category: "orders", importance: "normal", title: `New order ${id}`, body: "A new order needs picking.",
    destination: { kind: "queue", fulfillmentId: `f-${id}` }, createdAt: iso(msAgo), readAt: null, pinnedUntil: null, endsLabel: null, imageUrl: null, ...extra,
  }
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

describe("the shop inbox (110 US2)", () => {
  beforeEach(() => {
    push.mockReset()
    markNotificationRead.mockClear()
    api.patch.mockReset().mockResolvedValue({})
    toast.mockReset()
  })

  it("puts pinned items first, then the day groups, newest first", () => {
    wrap(
      <InboxList
        pinned={[item("pin", 60_000, { importance: "important", title: "Important notice" })]}
        items={[item("a", 60_000), item("old", 9 * 86_400_000)]}
        loading={false}
        hasMore={false}
        loadingMore={false}
      />,
    )
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    expect(headings[0]).toBe("Important")
    expect(headings.at(-1)).toBe("Earlier")
    expect(screen.getAllByText(/Unread:/)).toHaveLength(3)
  })

  it("a click records the read and opens the page it is about", async () => {
    const onOpened = vi.fn()
    wrap(<InboxList pinned={[]} items={[item("a", 60_000)]} loading={false} hasMore={false} loadingMore={false} onOpened={onOpened} />)
    await userEvent.click(screen.getByText("New order a"))
    expect(markNotificationRead).toHaveBeenCalledWith("a")
    expect(push).toHaveBeenCalledWith("/orders/f-a")
    expect(onOpened).toHaveBeenCalled()
  })

  it("a message from Effy opens where it is, with its picture, and Open goes where it leads (112)", async () => {
    const msg = item("m", 60_000, {
      type: "shop_message",
      category: "announcements",
      title: "New labels from Monday",
      body: "Effy's new labels arrive Monday.",
      destination: { kind: "catalog" },
      imageUrl: "https://media.example.test/promotions/messages-1/a.webp",
    })
    wrap(<InboxList pinned={[]} items={[msg]} loading={false} hasMore={false} loadingMore={false} />)
    await userEvent.click(screen.getByText("New labels from Monday"))
    expect(markNotificationRead).toHaveBeenCalledWith("m")
    expect(push).not.toHaveBeenCalled()
    expect(await screen.findByRole("dialog")).toHaveTextContent("Effy's new labels arrive Monday.")
    expect(screen.getByRole("dialog").querySelector("img")?.getAttribute("src")).toBe(msg.imageUrl)
    await userEvent.click(screen.getByRole("button", { name: "Open" }))
    expect(push).toHaveBeenCalledWith("/catalog")
  })

  it("archive asks the server and offers Undo, which restores it", async () => {
    wrap(<InboxList pinned={[]} items={[item("a", 60_000)]} loading={false} hasMore={false} loadingMore={false} />)
    await userEvent.click(screen.getByRole("button", { name: /Archive “New order a”/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/shop/v1/notifications/a", { archived: true }))
    const [, opts] = toast.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    expect(opts.action.label).toBe("Undo")
    opts.action.onClick()
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/shop/v1/notifications/a", { archived: false }))
  })

  it("an empty inbox says so in words, never a blank panel", () => {
    wrap(<InboxList pinned={[]} items={[]} loading={false} hasMore={false} loadingMore={false} />)
    expect(screen.getByText("You're all caught up")).toBeTruthy()
  })

  it("the newest shown is the cut-off, microseconds kept, and repeats across pages are dropped", () => {
    const pages = {
      pages: [
        { pinned: [item("p", 1_000)], items: [item("a", 2_000), item("b", 3_000)], nextCursor: "c", categories: [], unseenCount: 0 },
        { pinned: [], items: [item("b", 3_000), item("c", 4_000)], nextCursor: null, categories: null, unseenCount: 0 },
      ] as InboxPageDTO[],
      pageParams: [null, "c"],
    }
    const { pinned, items } = flatten(pages)
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"])
    expect(newestShown(pinned, items)).toBe(pinned[0]!.createdAt)
  })

  it("the page's filters round-trip through the address, and nonsense is dropped", () => {
    expect(validateNotificationsSearch({ filter: "unread" })).toEqual({ filter: "unread" })
    expect(validateNotificationsSearch({ category: "stock" })).toEqual({ filter: "all", category: "stock" })
    expect(validateNotificationsSearch({ filter: "x", category: "points" })).toEqual({ filter: "all" })
  })
})
