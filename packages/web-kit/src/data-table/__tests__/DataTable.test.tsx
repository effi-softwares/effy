import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Package } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListPage } from "@effy/shared-types";

import { DataTable } from "../DataTable";
import { defineListSearch, searchFilter } from "../list-search";
import { listQueryOptions } from "../list-query";
import { useListState, SEARCH_DEBOUNCE_MS } from "../use-list-state";
import type { EffyColumnDef } from "../column-meta";

interface Row {
  id: string;
  name: string;
  total: string;
  status: string;
}

const ROWS: Row[] = Array.from({ length: 60 }, (_, i) => ({
  id: `r${i + 1}`,
  name: `Shop ${String(i + 1).padStart(2, "0")}`,
  total: `${(i + 1) * 10}.00`,
  status: i % 2 ? "active" : "paused",
}));

const shops = defineListSearch({
  id: "shops",
  mode: "offset",
  sorts: ["name", "total"] as const,
  defaultSort: "name",
  sortDir: { name: "asc", total: "desc" },
  filters: { status: searchFilter.oneOf(["active", "paused"] as const) },
});

const columns: EffyColumnDef<Row>[] = [
  { id: "name", header: "Name", cell: ({ row }) => row.original.name, meta: { label: "Name", identifying: true, phone: "primary", sortKey: "name" } },
  { id: "status", header: "Status", cell: ({ row }) => row.original.status, meta: { label: "Status", phone: "badge" } },
  { id: "total", header: "Total", cell: ({ row }) => row.original.total, meta: { label: "Total", align: "numeric", priority: 2, sortKey: "total" } },
];

/** A fake list route: filters, sorts and pages the fixture like the server would. */
let calls: string[] = [];
let fail = false;
async function fetchShops(qs: URLSearchParams): Promise<ListPage<Row>> {
  calls.push(qs.toString());
  if (fail) throw new Error("down");
  const q = (qs.get("q") ?? "").toLowerCase();
  const status = qs.get("status");
  const sort = qs.get("sort") as "name" | "total";
  const dir = qs.get("dir");
  const size = Number(qs.get("pageSize"));
  const page = Number(qs.get("page"));
  let rows = ROWS.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!status || r.status === status));
  rows = [...rows].sort((a, b) => {
    const c = sort === "total" ? Number(a.total) - Number(b.total) : a.name.localeCompare(b.name);
    return dir === "desc" ? -c : c;
  });
  return {
    items: rows.slice((page - 1) * size, page * size),
    pageSize: size,
    total: rows.length,
    totalCapped: false,
    page,
    nextCursor: null,
    ignored: [],
  };
}

function Screen() {
  const search = listRoute.useSearch();
  const state = useListState(shops, search);
  const input = { key: ["shops"], list: shops, view: state.view, fetch: fetchShops };
  const query = useQuery(listQueryOptions(input));
  return (
    <DataTable
      app="back-office"
      label="Shops"
      list={shops}
      state={state}
      columns={columns}
      query={query}
      queryInput={input}
      rowHref={(r) => ({ to: "/shops/$id", params: { id: r.id } })}
      empty={{ icon: Package, title: "No shops yet" }}
      toolbar={<input aria-label="Search shops" value={state.draftQ} onChange={(e) => state.setQ(e.target.value)} />}
    />
  );
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shops",
  validateSearch: (raw: Record<string, unknown>) => shops.validateSearch(raw),
  component: Screen,
});
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shops/$id",
  component: () => <p>detail {detailRoute.useParams().id}</p>,
});

function renderAt(url: string) {
  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const bodyRows = () => screen.getAllByRole("row").slice(1);

beforeEach(() => {
  calls = [];
  fail = false;
  window.localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("DataTable (contracts/data-table-ui.md)", () => {
  it("shows the first page, the range and the page count", async () => {
    renderAt("/shops");
    expect(await screen.findByText("Shop 01")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(25);
    expect(screen.getByText("1–25 of 60")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("pages forward through the address and back", async () => {
    const router = renderAt("/shops");
    await screen.findByText("Shop 01");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Shop 26")).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ page: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Last page" }));
    expect(await screen.findByText("51–60 of 60")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("scrolling on past the end of a page turns to the next, and past the top back again", async () => {
    const router = renderAt("/shops");
    await screen.findByText("Shop 01");
    const frame = screen.getByRole("table").closest(".ef-dt-frame")!;
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const wheel = (deltaY: number, times = 1) => {
      for (let i = 0; i < times; i++) act(() => void frame.dispatchEvent(new WheelEvent("wheel", { deltaY })));
    };
    // One fling into the end does not turn the page: the gesture must rest there, then keep going.
    wheel(100);
    expect(router.state.location.search).toEqual({});
    now += 300;
    wheel(100);
    expect(screen.getByRole("status")).toHaveTextContent("Keep scrolling for the next page");
    wheel(100, 2);
    await screen.findByText("Shop 26");
    expect(router.state.location.search).toEqual({ page: 2 });

    now += 2_000;
    wheel(-100);
    now += 300;
    wheel(-100, 3);
    await screen.findByText("Shop 01");
    expect(router.state.location.search).toEqual({});
    clock.mockRestore();
  });

  it("restores the view from the address (reload / shared link)", async () => {
    renderAt("/shops?sort=total&page=2&status=active");
    expect(await screen.findByText("26–30 of 30")).toBeInTheDocument();
    expect(calls.at(-1)).toBe("sort=total&dir=desc&pageSize=25&page=2&status=active");
    expect(screen.getByRole("columnheader", { name: /Total/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts the whole set from the header and returns to page 1", async () => {
    const router = renderAt("/shops?page=2");
    await screen.findByText("Shop 26");
    await userEvent.click(screen.getByRole("button", { name: /Name/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ dir: "desc" }));
    expect(await screen.findByText("Shop 60")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Total/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ sort: "total" }));
  });

  it("searches after a pause, once, from page 1", async () => {
    const router = renderAt("/shops?page=3");
    await screen.findByText("Shop 51");
    const before = calls.length;
    await userEvent.type(screen.getByLabelText("Search shops"), "shop 0");
    await new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50));
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "shop 0" }));
    expect(await screen.findByText("1–9 of 9")).toBeInTheDocument();
    expect(calls.slice(before).filter((c) => c.startsWith("q="))).toEqual(["q=shop+0&sort=name&dir=asc&pageSize=25&page=1"]);
  });

  it("says 'No matches' with a reset when filters match nothing", async () => {
    const router = renderAt("/shops?q=zzz");
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("shows the error with a retry inside the frame", async () => {
    fail = true;
    renderAt("/shops");
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("opens a row from its link, a click on the row, and Enter after J", async () => {
    const router = renderAt("/shops");
    const link = await screen.findByRole("link", { name: "Shop 01" });
    expect(link).toHaveAttribute("href", "/shops/r1");
    await userEvent.keyboard("j");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/shops/r1"));
  });

  it("hides a column on this device; the identifying one cannot be hidden", async () => {
    renderAt("/shops");
    await screen.findByText("Shop 01");
    await userEvent.click(screen.getByRole("button", { name: "Columns" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Name" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Status" }));
    await act(async () => {});
    expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("effy.table.back-office.shops.v1")!)).toEqual({ hidden: ["status"] });
  });

  it("lays cells out for the phone from column meta", async () => {
    renderAt("/shops");
    const cell = (await screen.findByText("Shop 01")).closest("td")!;
    expect(cell).toHaveAttribute("data-m", "primary");
    const total = screen.getAllByText("10.00")[0]!.closest("td")!;
    expect(total).toHaveAttribute("data-m", "meta");
    expect(total).toHaveAttribute("data-label", "Total");
    expect(total.className).toContain("md:max-lg:hidden");
  });

  it("reads the next page ahead once the page settles", async () => {
    renderAt("/shops");
    await screen.findByText("Shop 01");
    await waitFor(() => expect(calls).toContain("sort=name&dir=asc&pageSize=25&page=2"));
  });
});
