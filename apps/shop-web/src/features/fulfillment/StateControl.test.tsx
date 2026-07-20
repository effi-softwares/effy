import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FulfillmentDetail, FulfillmentStatus } from "./model";

const transitionFulfillment = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({
  transitionFulfillment,
  listFulfillments: vi.fn(),
  getFulfillment: vi.fn(),
  updateItemProgress: vi.fn(),
}));

import { StateControl } from "./components/StateControl";

function detail(status: FulfillmentStatus): FulfillmentDetail {
  return {
    id: "f1",
    orderNumber: "EFY-10023",
    placedAt: "2026-07-20T02:14:05Z",
    status,
    stateChangedAt: "2026-07-20T02:15:11Z",
    promise: { serviceLevel: "standard", readyBy: "2026-07-20T03:14:05Z" },
    delivery: {
      recipientName: "Ada Lovelace",
      phone: null,
      line1: "1 Test St",
      line2: null,
      city: "Melbourne",
      region: "VIC",
      postalCode: "3000",
      country: "AU",
    },
    items: [],
  };
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

describe("StateControl transitions", () => {
  // Call counts are load-bearing below ("a reload must not re-submit"), so each test starts from a
  // clean call log. mockClear keeps the per-test resolved values intact.
  beforeEach(() => {
    transitionFulfillment.mockClear();
  });

  it("offers 'Start picking' from received and submits the transition", async () => {
    transitionFulfillment.mockResolvedValue(detail("picking"));

    wrap(<StateControl detail={detail("received")} onReload={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /start picking/i }));

    expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "picking" });
  });

  it("offers 'Mark ready for pickup' from picking", async () => {
    transitionFulfillment.mockResolvedValue(detail("ready_for_pickup"));

    wrap(<StateControl detail={detail("picking")} onReload={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /mark ready for pickup/i }));

    expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "ready_for_pickup" });
  });

  // US3 scenario 2 — a second operator must not be offered a duplicate completing action.
  it("offers no completing action once the order is ready, only the permitted reversal", () => {
    wrap(<StateControl detail={detail("ready_for_pickup")} onReload={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /mark ready for pickup/i })).toBeNull();
    expect(screen.getByRole("button", { name: /reopen picking/i })).toBeInTheDocument();
    expect(screen.getByText(/awaiting collection/i)).toBeInTheDocument();
  });

  it("submits the one permitted reversal back to picking", async () => {
    transitionFulfillment.mockResolvedValue(detail("picking"));

    wrap(<StateControl detail={detail("ready_for_pickup")} onReload={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /reopen picking/i }));

    expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "picking" });
  });

  // FR-011f — collected is terminal and immutable; the UI offers nothing at all.
  it("offers no action on a collected portion", () => {
    wrap(<StateControl detail={detail("collected")} onReload={vi.fn()} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/collected/i)).toBeInTheDocument();
  });

  // FR-014 / SC-005 — the 409 path. 409 maps to DomainErrorKind "unknown", so it is detected by
  // STATUS. The affordance offered must be RELOAD, never a retry: retrying would re-submit a
  // decision made against a state the server no longer holds.
  it("surfaces a 409 as a reload affordance, not a retry", async () => {
    transitionFulfillment.mockRejectedValue({ kind: "unknown", status: 409, title: "Conflict" });
    const onReload = vi.fn();

    wrap(<StateControl detail={detail("picking")} onReload={onReload} />);

    await userEvent.click(screen.getByRole("button", { name: /mark ready for pickup/i }));

    expect(await screen.findByText(/changed elsewhere/i)).toBeInTheDocument();
    const reload = screen.getByRole("button", { name: /reload/i });
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();

    await userEvent.click(reload);
    expect(onReload).toHaveBeenCalledTimes(1);
    // Reloading must not re-submit the refused transition.
    expect(transitionFulfillment).toHaveBeenCalledTimes(1);
  });

  it("shows a non-leaking message for a non-conflict failure and offers no reload", async () => {
    transitionFulfillment.mockRejectedValue({
      kind: "forbidden",
      status: 403,
      title: "Forbidden",
      detail: "shop_staff row inactive",
    });

    wrap(<StateControl detail={detail("received")} onReload={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /start picking/i }));

    expect(await screen.findByText(/don't have access to this order/i)).toBeInTheDocument();
    expect(screen.queryByText(/shop_staff row inactive/)).toBeNull();
    expect(screen.queryByRole("button", { name: /reload/i })).toBeNull();
  });
});
