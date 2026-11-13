import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { InboxItemDTO } from "@effy/shared-types"

const push = vi.hoisted(() => vi.fn())
const pathname = vi.hoisted(() => ({ current: "/" }))
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { push } }),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) => select({ location: { pathname: pathname.current } }),
}))
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(async () => ({})) }))
vi.mock("@/lib/api", () => ({ api }))
vi.mock("../api", () => ({ markNotificationRead: vi.fn(async () => undefined) }))
vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }))
const toast = vi.hoisted(() => Object.assign(vi.fn(), { info: vi.fn() }))
vi.mock("@effy/design-system/ui", () => ({ toast }))

const { useInboxArrivals } = await import("../useInboxArrivals")
const { INBOX_ROOT } = await import("../inbox-api")

const item = (id: string, createdAt: string, o: Partial<InboxItemDTO> = {}): InboxItemDTO => ({
  id,
  type: "shop_product_review",
  category: "products",
  importance: "normal",
  title: `Title ${id}`,
  body: "",
  destination: { kind: "queue" },
  createdAt,
  readAt: null,
  pinnedUntil: null,
  endsLabel: null,
  imageUrl: null,
  ...o,
})

let page: { pinned: InboxItemDTO[]; items: InboxItemDTO[] }
let qc: QueryClient

function setup(initialCount: number) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData([...INBOX_ROOT, "unseen"], { unseenCount: initialCount })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  renderHook(() => useInboxArrivals(), { wrapper })
}
const setCount = (n: number) => act(() => void qc.setQueryData([...INBOX_ROOT, "unseen"], { unseenCount: n }))

beforeEach(() => {
  vi.clearAllMocks()
  pathname.current = "/"
  page = { pinned: [], items: [item("old", "2026-11-13T09:00:00Z")] }
  api.get.mockImplementation(async (path: string) =>
    path.endsWith("unseen-count") ? { unseenCount: 0 } : { ...page, nextCursor: null, categories: null, unseenCount: 0 },
  )
})

describe("a toast when a notification arrives in the console (120 US5)", () => {
  it("says nothing on the first read, then names one new item with Open", async () => {
    setup(1)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/shop/v1/notifications?limit=5"))
    expect(toast.info).not.toHaveBeenCalled()
    page = { pinned: [], items: [item("new", "2026-11-13T09:05:00Z"), item("old", "2026-11-13T09:00:00Z")] }
    setCount(2)
    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1))
    const [title, opts] = toast.info.mock.calls[0] as [string, { action: { label: string } }]
    expect(title).toBe("Title new")
    expect(opts.action.label).toBe("Open")
  })

  it("several at once: how many, and Open goes to the Notifications page", async () => {
    setup(0)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    page = { pinned: [], items: [item("a", "2026-11-13T09:05:00Z"), item("b", "2026-11-13T09:04:00Z")] }
    setCount(2)
    await waitFor(() => expect(toast.info).toHaveBeenCalled())
    const [title, opts] = toast.info.mock.calls[0] as [string, { action: { onClick: () => void } }]
    expect(title).toBe("2 new notifications")
    opts.action.onClick()
    expect(push).toHaveBeenCalledWith("/notifications")
  })

  it("never for a new order - the new-order banner says that", async () => {
    setup(0)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    page = { pinned: [], items: [item("n", "2026-11-13T09:05:00Z", { type: "shop_new_order" })] }
    setCount(1)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(toast.info).not.toHaveBeenCalled()
  })

  it("nothing when the person is already on the page the item is about", async () => {
    pathname.current = "/orders"
    setup(0)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    page = { pinned: [], items: [item("q", "2026-11-13T09:05:00Z", { destination: { kind: "queue" } })] }
    setCount(1)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(toast.info).not.toHaveBeenCalled()
  })

  it("nothing on the Notifications page", async () => {
    pathname.current = "/notifications"
    setup(0)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    page = { pinned: [], items: [item("a", "2026-11-13T09:05:00Z")] }
    setCount(1)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(toast.info).not.toHaveBeenCalled()
  })

  it("a message opens the Notifications page, where it is read in place", async () => {
    setup(0)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    page = { pinned: [], items: [item("m", "2026-11-13T09:05:00Z", { type: "shop_message", category: "announcements" })] }
    setCount(1)
    await waitFor(() => expect(toast.info).toHaveBeenCalled())
    const [, opts] = toast.info.mock.calls[0] as [string, { action: { onClick: () => void } }]
    opts.action.onClick()
    expect(push).toHaveBeenCalledWith("/notifications")
  })
})
