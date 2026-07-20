import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { FulfillmentQueue, FulfillmentSummary } from "./model";

// The order column links to the detail route; without a RouterProvider a real <Link> throws. These
// are column-render tests, so a plain anchor stand-in is enough.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

const listFulfillments = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({
  listFulfillments,
  getFulfillment: vi.fn(),
  transitionFulfillment: vi.fn(),
  updateItemProgress: vi.fn(),
}));

import { OrderQueueScreen } from "./OrderQueueScreen";
import { fulfillmentQueueQuery } from "./queries";

function row(over: Partial<FulfillmentSummary> = {}): FulfillmentSummary {
  return {
    id: "f1",
    orderNumber: "EFY-10023",
    placedAt: "2026-07-20T02:14:05Z",
    status: "received",
    stateChangedAt: "2026-07-20T02:15:11Z",
    itemCount: 4,
    gatheredCount: 2,
    unavailableCount: 0,
    promise: { serviceLevel: "standard", readyBy: "2026-07-20T03:14:05Z" },
    atRisk: false,
    ...over,
  };
}

const QUEUE: FulfillmentQueue = { items: [row()] };

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

describe("OrderQueueScreen", () => {
  it("renders a queue row with reference, progress and state", async () => {
    listFulfillments.mockResolvedValue(QUEUE);

    wrap(<OrderQueueScreen />);

    expect(await screen.findByText("EFY-10023")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.getByText("standard")).toBeInTheDocument();
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.getByText(/1 active order$/)).toBeInTheDocument();
  });

  it("reads the active slice by default", async () => {
    listFulfillments.mockResolvedValue(QUEUE);

    wrap(<OrderQueueScreen />);

    await screen.findByText("EFY-10023");
    expect(listFulfillments).toHaveBeenCalledWith("active");
  });

  it("shows a plain empty state when no work is waiting (not an error)", async () => {
    listFulfillments.mockResolvedValue({ items: [] });

    wrap(<OrderQueueScreen />);

    expect(await screen.findByText(/no orders waiting/i)).toBeInTheDocument();
  });

  it("shows an error state with a working retry", async () => {
    listFulfillments.mockRejectedValueOnce(new Error("boom"));
    listFulfillments.mockResolvedValue(QUEUE);

    wrap(<OrderQueueScreen />);

    const retry = await screen.findByRole("button", { name: /retry/i });
    await userEvent.click(retry);

    expect(await screen.findByText("EFY-10023")).toBeInTheDocument();
  });

  // SC-018: an aged/at-risk portion escalates by PROMINENCE, in place. The row must NOT move — the
  // server owns the order — so the escalation has to be visible inside the row itself.
  it("escalates an at-risk row in place rather than reordering it", async () => {
    listFulfillments.mockResolvedValue({
      items: [row({ id: "f1", orderNumber: "EFY-1", atRisk: false }), row({ id: "f2", orderNumber: "EFY-2", atRisk: true })],
    });

    wrap(<OrderQueueScreen />);

    expect(await screen.findByText("At risk")).toBeInTheDocument();

    // Server order preserved exactly: the at-risk row stays second.
    const refs = screen.getAllByRole("link").map((a) => a.textContent);
    expect(refs).toEqual(["EFY-1", "EFY-2"]);
  });

  it("surfaces a line's shortfall on the queue row", async () => {
    listFulfillments.mockResolvedValue({ items: [row({ unavailableCount: 1 })] });

    wrap(<OrderQueueScreen />);

    expect(await screen.findByText("1 unavailable")).toBeInTheDocument();
  });

  // US4 / FR-016 — completed work is a separate slice of the same queue.
  it("switches to the completed slice and re-reads under its own key", async () => {
    listFulfillments.mockImplementation(async (state: string) =>
      state === "completed"
        ? { items: [row({ id: "f9", orderNumber: "EFY-DONE", status: "ready_for_pickup" })] }
        : QUEUE,
    );

    wrap(<OrderQueueScreen />);
    await screen.findByText("EFY-10023");

    await userEvent.click(screen.getByRole("tab", { name: /completed/i }));

    expect(await screen.findByText("EFY-DONE")).toBeInTheDocument();
    expect(listFulfillments).toHaveBeenCalledWith("completed");
    await waitFor(() => expect(screen.getByText(/1 completed order$/)).toBeInTheDocument());
  });

  it("shows the completed empty state when nothing has been fulfilled yet", async () => {
    listFulfillments.mockImplementation(async (state: string) =>
      state === "completed" ? { items: [] } : QUEUE,
    );

    wrap(<OrderQueueScreen />);
    await screen.findByText("EFY-10023");

    await userEvent.click(screen.getByRole("tab", { name: /completed/i }));

    expect(await screen.findByText(/no completed orders yet/i)).toBeInTheDocument();
  });
});

// The monorepo's first polling query (research R8). SC-001 needs a newly placed order visible to the
// shop within 30s without the operator navigating away, so the interval is asserted rather than left
// to inspection — and so is the background half: a console left open on a bench must not poll while
// nobody is looking at it.
describe("fulfillmentQueueQuery polling", () => {
  it("polls every 15s and never in a hidden tab", () => {
    const q = fulfillmentQueueQuery("active");
    expect(q.refetchInterval).toBe(15_000);
    expect(q.refetchIntervalInBackground).toBe(false);
  });

  it("keys active and completed independently", () => {
    expect(fulfillmentQueueQuery("active").queryKey).toEqual(["shop", "fulfillment", "queue", "active"]);
    expect(fulfillmentQueueQuery("completed").queryKey).toEqual([
      "shop",
      "fulfillment",
      "queue",
      "completed",
    ]);
  });
});
