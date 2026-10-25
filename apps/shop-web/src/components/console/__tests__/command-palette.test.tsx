import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { orderList, orderRow } from "@/features/fulfillment/__tests__/fixtures"

const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))

const listOrders = vi.hoisted(() => vi.fn())
vi.mock("@/features/fulfillment/repo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listOrders,
}))
const listProducts = vi.hoisted(() => vi.fn())
vi.mock("@/features/catalog/repo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listProducts,
}))

const { CommandPalette } = await import("../CommandPalette")

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe("search and commands", () => {
  it("lists the pages this role may open, and never Management for staff", () => {
    wrap(<CommandPalette open onOpenChange={() => {}} roles={["shop_staff"]} onScan={() => {}} />)
    const pages = screen.getByRole("group", { name: "Go to" })
    // Every page in the menu, sub-pages included (Orders' are All orders · Awaiting pick · Queue).
    expect(within(pages).getByText("All orders")).toBeInTheDocument()
    expect(within(pages).getByText("Queue")).toBeInTheDocument()
    expect(within(pages).queryByText("Management")).not.toBeInTheDocument()
  })

  it("finds an order by what is typed and opens it on Enter", async () => {
    listOrders.mockResolvedValue(orderList([orderRow({ id: "f9", orderNumber: "EFY-10023" })]))
    listProducts.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 5 })
    const onOpenChange = vi.fn()
    wrap(<CommandPalette open onOpenChange={onOpenChange} roles={["shop_staff"]} onScan={() => {}} />)
    await userEvent.type(screen.getByRole("combobox", { name: "Search" }), "1002")
    expect(await screen.findByText("EFY-10023")).toBeInTheDocument()
    await userEvent.keyboard("{Enter}")
    expect(navigate).toHaveBeenCalledWith({ to: "/orders/$fulfillmentId", params: { fulfillmentId: "f9" } })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("opens the scan dialog from its action", async () => {
    const onScan = vi.fn()
    wrap(<CommandPalette open onOpenChange={() => {}} roles={[]} onScan={onScan} />)
    await userEvent.click(screen.getByRole("option", { name: /scan a bag label/i }))
    expect(onScan).toHaveBeenCalled()
  })
})
