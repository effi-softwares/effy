import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const location = vi.hoisted(() => ({ pathname: "/" }))
const params = vi.hoisted(() => ({ value: {} as Record<string, string> }))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useLocation: () => location,
  useParams: () => params.value,
  useSearch: () => ({}),
  useNavigate: () => () => { },
}))

const getOrder = vi.hoisted(() => vi.fn())
const listOrders = vi.hoisted(() => vi.fn())
vi.mock("@/features/fulfillment/repo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrder,
  listOrders,
}))

const getProduct = vi.hoisted(() => vi.fn())
vi.mock("@/features/catalog/repo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProduct,
}))

const { crumbsFor, useHeaderRecord } = await import("../headerRecord")

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

function at(pathname: string, p: Record<string, string> = {}) {
  location.pathname = pathname
  params.value = p
}

beforeEach(() => {
  vi.clearAllMocks()
  at("/")
})

describe("crumbsFor", () => {
  it("gives a screen with no hierarchy just its own name", () => {
    expect(crumbsFor("/")).toEqual([{ label: "Today" }])
    expect(crumbsFor("/orders")).toEqual([{ label: "Orders" }])
    expect(crumbsFor("/catalog")).toEqual([{ label: "Catalog" }])
    expect(crumbsFor("/manager")).toEqual([{ label: "Management" }])
  })

  it("puts a detail screen under its list, and the parent is the way back", () => {
    expect(crumbsFor("/orders/f1", { orderNumber: "EFY-10023" })).toEqual([
      { label: "Orders", to: "/orders" },
      { label: "EFY-10023", mono: true },
    ])
    expect(crumbsFor("/catalog/p1", { productName: "Linen apron, natural" })).toEqual([
      { label: "Catalog", to: "/catalog" },
      { label: "Linen apron, natural" },
    ])
    expect(crumbsFor("/catalog/new")).toEqual([{ label: "Catalog", to: "/catalog" }, { label: "New product" }])
  })

  it("falls back to a noun, never 'Loading…', before the detail read lands", () => {
    expect(crumbsFor("/orders/f1").at(-1)).toEqual({ label: "Order" })
    expect(crumbsFor("/catalog/p1").at(-1)).toEqual({ label: "Product" })
  })

  it("has no Restock destination", () => {
    expect(crumbsFor("/restock")).toEqual([{ label: "Today" }])
  })
})

function Record() {
  return <output>{useHeaderRecord() ?? "none"}</output>
}

describe("useHeaderRecord", () => {
  it("names the order from the cached detail read", async () => {
    at("/orders/f1", { fulfillmentId: "f1" })
    getOrder.mockResolvedValue({ orderNumber: "EFY-10023" })
    wrap(<Record />)

    expect(await screen.findByText("EFY-10023")).toBeInTheDocument()
  })

  it("names the product on its detail screen", async () => {
    at("/catalog/p1", { productId: "p1" })
    getProduct.mockResolvedValue({ name: "Linen apron, natural" })
    wrap(<Record />)

    expect(await screen.findByText("Linen apron, natural")).toBeInTheDocument()
  })

  it("names nothing, and reads nothing, on a screen with no detail", () => {
    at("/catalog")
    wrap(<Record />)

    expect(screen.getByText("none")).toBeInTheDocument()
    expect(getProduct).not.toHaveBeenCalled()
    expect(getOrder).not.toHaveBeenCalled()
  })
})
