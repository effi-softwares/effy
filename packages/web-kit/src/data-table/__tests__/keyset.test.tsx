import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { describe, expect, it } from "vitest";

import type { ListPage } from "@effy/shared-types";

import type { EffyColumnDef } from "../column-meta";
import { DataTable } from "../DataTable";
import { listQueryOptions } from "../list-query";
import { defineListSearch } from "../list-search";
import { useListState } from "../use-list-state";

interface Row {
  id: string;
  n: number;
}

// A ledger, newest first; the cursor is the last row's number.
const LEDGER: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: `e${60 - i}`, n: 60 - i }));
const seen: string[] = [];
async function fetchLedger(qs: URLSearchParams): Promise<ListPage<Row>> {
  seen.push(qs.get("cursor") ?? "");
  const after = qs.get("cursor") ? Number(qs.get("cursor")) : Infinity;
  const size = Number(qs.get("pageSize"));
  const rows = LEDGER.filter((r) => r.n < after);
  const page = rows.slice(0, size);
  return {
    items: page,
    pageSize: size,
    total: 60,
    totalCapped: false,
    page: null,
    nextCursor: rows.length > size ? String(page.at(-1)!.n) : null,
    ignored: [],
  };
}

const ledger = defineListSearch({ id: "ledger", mode: "keyset", sorts: ["at"] as const, defaultSort: "at", sortDir: { at: "desc" }, filters: {} });
const columns: EffyColumnDef<Row>[] = [{ id: "n", header: "Entry", cell: ({ row }) => `Entry ${row.original.n}`, meta: { label: "Entry", identifying: true } }];

function Screen() {
  const state = useListState(ledger, listRoute.useSearch());
  const query = useQuery(listQueryOptions({ key: ["ledger"], list: ledger, view: state.view, cursor: state.cursor, fetch: fetchLedger }));
  return <DataTable app="back-office" label="Ledger" list={ledger} state={state} columns={columns} query={query} empty={{ icon: Package, title: "Nothing" }} />;
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const listRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", validateSearch: (r: Record<string, unknown>) => ledger.validateSearch(r), component: Screen });

function renderAt(url: string) {
  const router = createRouter({ routeTree: rootRoute.addChildren([listRoute]), history: createMemoryHistory({ initialEntries: [url] }) });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("a keyset list", () => {
  it("pages with cursors kept in history, not the address, and Back pops them", async () => {
    const router = renderAt("/");
    expect(await screen.findByText("Entry 60")).toBeInTheDocument();
    // One pager look everywhere: a cursor list shows Last too, but cannot jump to its end.
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Entry 35")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Entry 10")).toBeInTheDocument();
    expect(screen.getByText("51–60 of 60")).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ page: 3 });
    expect(JSON.stringify(router.state.location.search)).not.toContain("cursor");
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByText("Entry 35")).toBeInTheDocument();
    expect(seen).toContain("36");
  });

  it("reopened past page 1 without its cursors, starts again at 1 and says so", async () => {
    const router = renderAt("/?page=4");
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await screen.findByText("Entry 60")).toBeInTheDocument();
    expect(screen.getByText(/starts again from the newest/)).toBeInTheDocument();
  });
});
