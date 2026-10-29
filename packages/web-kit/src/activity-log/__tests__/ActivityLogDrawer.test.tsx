import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTIVITY_EXPORT_TOO_MANY, type ActivityEntryDTO, type ActivityPage } from "@effy/shared-types";

import { setListEventSink, type ListEvent } from "../../data-table/list-events";
import { ActivityButton } from "../ActivityButton";
import { ActivityLogDrawer } from "../ActivityLogDrawer";
import { withActivityLog } from "../search";

const ENTRIES: ActivityEntryDTO[] = [
  {
    id: "a",
    at: "2026-10-29T03:03:00Z",
    kind: "status",
    title: "Status changed",
    detail: "active → suspended",
    subject: null,
    actor: "Sam Lee",
    tone: "problem",
  },
  {
    id: "b",
    at: "2026-10-28T23:00:00Z",
    kind: "team",
    title: "Team member added",
    detail: "Maya · Staff",
    subject: null,
    actor: "Sam Lee",
    tone: "default",
  },
];

const page = (items: ActivityEntryDTO[]): ActivityPage => ({
  items,
  pageSize: 25,
  total: items.length,
  totalCapped: false,
  page: null,
  nextCursor: null,
  ignored: [],
});

const get = vi.fn(async (path: string): Promise<unknown> => {
  const qs = new URLSearchParams(path.split("?")[1]);
  if (qs.get("export") === "csv") return { csv: "When,Type,What,Detail,On,Who\r\n", rows: 2 };
  const q = (qs.get("q") ?? "").toLowerCase();
  const kind = qs.get("kind");
  return page(ENTRIES.filter((e) => (!q || e.title.toLowerCase().includes(q)) && (!kind || e.kind === kind)));
});

function Screen() {
  return (
    <>
      <ActivityButton />
      <ActivityLogDrawer
        app="back-office"
        log="bo-shop"
        title="Shop activity"
        description="Every change to this shop and its team."
        api={{ get: get as never }}
        path="/admin/v1/shops/s1/audit"
        queryKey={["shops", "s1"]}
        fileName="shop-activity"
      />
    </>
  );
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (r: Record<string, unknown>) => withActivityLog(r),
  component: Screen,
});

function renderAt(url: string) {
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => get.mockClear());

describe("the activity drawer (104)", () => {
  it("reads nothing while closed, and opens through the address", async () => {
    const events: ListEvent[] = [];
    setListEventSink((e) => events.push(e));
    const router = renderAt("/");
    await userEvent.click(await screen.findByRole("button", { name: "Activity" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ log: 1 }));
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Status changed")).toBeInTheDocument();
    expect(within(drawer).getByText("active → suspended")).toBeInTheDocument();
    expect(within(drawer).getAllByText("Sam Lee")).toHaveLength(2);
    expect(String(get.mock.calls[0]![0])).toMatch(/^\/admin\/v1\/shops\/s1\/audit\?/);
    expect(events).toContainEqual({
      name: "activity_log_opened",
      log: "bo-shop",
    });
  });

  it("restores its search from a shared link, and the server answers it", async () => {
    renderAt("/?log=1&log.q=added");
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Team member added")).toBeInTheDocument();
    expect(within(drawer).queryByText("Status changed")).toBeNull();
    expect(String(get.mock.calls.at(-1)![0])).toContain("q=added");
  });

  it("filters by the log's own kinds", async () => {
    renderAt("/?log=1&log.kind=team");
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByText("Team member added");
    expect(String(get.mock.calls.at(-1)![0])).toContain("kind=team");
    expect(within(drawer).getByRole("button", { name: /Type/ })).toHaveTextContent("Team");
  });

  it("exports what it shows, and says so", async () => {
    const events: ListEvent[] = [];
    setListEventSink((e) => events.push(e));
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    renderAt("/?log=1&log.kind=team");
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByText("Team member added");
    await userEvent.click(within(drawer).getByRole("button", { name: "Export CSV" }));
    expect(await within(drawer).findByText("Exported 2 entries.")).toBeInTheDocument();
    const asked = new URLSearchParams(String(get.mock.calls.at(-1)![0]).split("?")[1]);
    expect(asked.get("export")).toBe("csv");
    expect(asked.get("kind")).toBe("team");
    expect(asked.has("pageSize")).toBe(false);
    expect(events).toContainEqual({
      name: "activity_log_exported",
      log: "bo-shop",
      rows: 2,
    });
  });

  it("refuses an export that is too big in words, never cutting it", async () => {
    renderAt("/?log=1");
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByText("Status changed");
    get.mockRejectedValueOnce({
      kind: "unknown",
      status: 400,
      title: "Too deep",
      fields: [{ field: "to", message: "x" }],
    });
    await userEvent.click(within(drawer).getByRole("button", { name: "Export CSV" }));
    expect(await within(drawer).findByText(ACTIVITY_EXPORT_TOO_MANY)).toBeInTheDocument();
  });

  it("closing forgets its search and filters", async () => {
    const router = renderAt("/?log=1&log.q=added");
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByText("Team member added");
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });
});
