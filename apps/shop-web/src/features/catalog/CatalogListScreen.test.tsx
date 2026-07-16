import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CatalogSchema, ProductList } from "./model";

// Keep the create flow's session/identity reads off the network; the list screen itself needs neither.
// The name column links to the detail route; without a RouterProvider a real <Link> throws. This is a
// column-render test, so a plain anchor stand-in is enough.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/features/auth/queries", () => ({
  sessionQuery: { queryKey: ["auth", "session"], queryFn: async () => ({ status: "signed-out" }) },
}));
vi.mock("@/features/shop-identity/queries", () => ({
  meQuery: { queryKey: ["shop", "me"], queryFn: async () => ({ shop: null }) },
}));
vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }));

const getCatalogSchema = vi.hoisted(() => vi.fn());
const listProducts = vi.hoisted(() => vi.fn());
const listSections = vi.hoisted(() => vi.fn(async () => []));
vi.mock("./repo", () => ({
  getCatalogSchema,
  listProducts,
  listSections,
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  uploadProductMedia: vi.fn(),
}));

import { CatalogListScreen } from "./CatalogListScreen";

const SCHEMA: CatalogSchema = { productTypes: [], categories: [] };

const ONE_PAGE: ProductList = {
  items: [
    {
      id: "p1",
      name: "Flat White",
      brand: "Effy Roastery",
      primaryImageUrl: null,
      typeName: "Prepared Food",
      categoryName: "Coffee",
      priceAmount: "4.50",
      currency: "AUD",
      status: "active",
      sku: "FW-001",
      updatedAt: "2026-07-16T00:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

describe("CatalogListScreen columns", () => {
  it("renders name/type/category/price/status/sku from the paged response", async () => {
    getCatalogSchema.mockResolvedValue(SCHEMA);
    listProducts.mockResolvedValue(ONE_PAGE);

    wrap(<CatalogListScreen />);

    expect(await screen.findByText("Flat White")).toBeInTheDocument();
    expect(screen.getByText("Effy Roastery")).toBeInTheDocument();
    expect(screen.getByText("Prepared Food")).toBeInTheDocument();
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText("AUD 4.50")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("FW-001")).toBeInTheDocument();
    expect(screen.getByText(/1 product ·/)).toBeInTheDocument();
  });

  it("shows the empty state when the shop has no products", async () => {
    getCatalogSchema.mockResolvedValue(SCHEMA);
    listProducts.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    wrap(<CatalogListScreen />);

    expect(await screen.findByText(/no products match your filter/i)).toBeInTheDocument();
  });
});
