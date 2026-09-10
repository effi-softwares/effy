import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The console header after the 2026-09-10 design revision: a breadcrumb trail in place of the static
 * title, and no right-hand primary action or theme toggle.
 */

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
  useNavigate: () => () => {},
}))

// 057 A3 — the crumb reads the order CONSOLE's detail (the key the order screen itself uses).
const getOrder = vi.hoisted(() => vi.fn())
vi.mock("@/features/fulfillment/repo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrder,
}))

const getProduct = vi.hoisted(() => vi.fn())
vi.mock("@/features/catalog/repo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProduct,
}))

const { crumbsFor, HeaderBreadcrumbs } = await import("../HeaderBreadcrumbs")
const { HeaderChrome } = await import("../HeaderChrome")

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
    expect(crumbsFor("/catalog/new")).toEqual([
      { label: "Catalog", to: "/catalog" },
      { label: "New product" },
    ])
  })

  it("falls back to a noun, never 'Loading…', before the detail read lands", () => {
    // The header outlives a failed read. A trail ending in "Order" is true either way.
    expect(crumbsFor("/orders/f1").at(-1)).toEqual({ label: "Order" })
    expect(crumbsFor("/catalog/p1").at(-1)).toEqual({ label: "Product" })
  })

  it("has no Restock destination", () => {
    // Purchasing is deferred; an old bookmark must not grow a crumb for a screen that is gone.
    expect(crumbsFor("/restock")).toEqual([{ label: "Today" }])
  })
})

describe("HeaderBreadcrumbs", () => {
  it("names the order from the cached detail read, in mono, as the page heading", async () => {
    at("/orders/f1", { fulfillmentId: "f1" })
    getOrder.mockResolvedValue({ orderNumber: "EFY-10023" })
    wrap(<HeaderBreadcrumbs />)

    const heading = await screen.findByRole("heading", { level: 1, name: "EFY-10023" })
    expect(heading.querySelector(".font-mono")).not.toBeNull()
    // ⚠ The final crumb is where you are — never a link to itself.
    expect(screen.queryByRole("link", { name: "EFY-10023" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders")
  })

  it("names the product on its detail screen", async () => {
    at("/catalog/p1", { productId: "p1" })
    getProduct.mockResolvedValue({ name: "Linen apron, natural" })
    wrap(<HeaderBreadcrumbs />)

    expect(
      await screen.findByRole("heading", { level: 1, name: "Linen apron, natural" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute("href", "/catalog")
  })

  it("reads nothing on a screen with no detail to name", () => {
    at("/catalog")
    wrap(<HeaderBreadcrumbs />)

    expect(screen.getByRole("heading", { level: 1, name: "Catalog" })).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(getProduct).not.toHaveBeenCalled()
    expect(getOrder).not.toHaveBeenCalled()
  })
})

describe("HeaderChrome", () => {
  it("carries the search field and no primary action or theme toggle", () => {
    wrap(<HeaderChrome />)

    expect(screen.getByRole("textbox", { name: /search orders and products/i })).toBeInTheDocument()
    // ⚠ Appearance stays selectable from the sidebar user menu (Light / Dark / Follow-System).
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByText(/restock/i)).not.toBeInTheDocument()
  })
})
