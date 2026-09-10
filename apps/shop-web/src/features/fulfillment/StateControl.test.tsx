import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FulfillmentStatus } from "./model";

const transitionFulfillment = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({
  transitionFulfillment,
  listFulfillments: vi.fn(),
  getFulfillment: vi.fn(),
  updateItemProgress: vi.fn(),
}));

import { CantSupplyDialog, StateActions, stateNote } from "./components/StateControl";

const target = (status: FulfillmentStatus) => ({ id: "f1", orderNumber: "EFY-10023", status });

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

describe("StateActions — the header's lifecycle control", () => {
  beforeEach(() => {
    transitionFulfillment.mockReset();
    transitionFulfillment.mockResolvedValue({ id: "f1", orderNumber: "EFY-10023", status: "picking", items: [] });
  });

  it("offers 'Start picking' from received and submits the transition", async () => {
    wrap(<StateActions detail={target("received")} />);
    await userEvent.click(screen.getByRole("button", { name: /start picking/i }));
    expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "picking" });
  });

  it("offers 'Mark ready for pickup' from picking", async () => {
    wrap(<StateActions detail={target("picking")} />);
    await userEvent.click(screen.getByRole("button", { name: /mark ready for pickup/i }));
    expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "ready_for_pickup" });
  });

  // ⚠ `from` is state the operator acted on — it must never reach the wire.
  it("sends only the transition, never the source state", async () => {
    wrap(<StateActions detail={target("picking")} />);
    await userEvent.click(screen.getByRole("button", { name: /mark ready for pickup/i }));
    expect(transitionFulfillment.mock.calls[0]![1]).not.toHaveProperty("from");
  });

  it("offers no completing action once ready, only the permitted reversal", async () => {
    wrap(<StateActions detail={target("ready_for_pickup")} />);
    expect(screen.queryByRole("button", { name: /mark ready/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reopen picking/i }));
    expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "picking" });
  });

  it.each(["collected", "delivered", "unfulfillable", "withdrawn"] as const)("offers nothing once %s", (s) => {
    wrap(<StateActions detail={target(s)} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("stateNote", () => {
  // ⚠ `withdrawn` was NOT the shop's doing, and this screen is where they are judged.
  it("says a cancelled order was cancelled, not that the shop failed", () => {
    expect(stateNote("withdrawn")).toMatch(/the customer cancelled this order/i);
    expect(stateNote("withdrawn")).not.toMatch(/couldn't supply|failed to/i);
  });

  it("says what happens next after can't-supply", () => {
    expect(stateNote("unfulfillable")).toMatch(/effy .* will refund the customer/i);
  });
});

// ── 055 US6 — the console's "Cancel order", which is a can't-supply declaration ─────────────────

describe("CantSupplyDialog (055 US6, 057 A3)", () => {
  beforeEach(() => {
    transitionFulfillment.mockReset();
    transitionFulfillment.mockResolvedValue({});
  });

  // ⚠ It tells Effy to refund a customer and takes the order off the queue for good.
  it("names the consequence before it acts", () => {
    wrap(<CantSupplyDialog targets={[target("picking")]} open onOpenChange={() => {}} />);
    expect(screen.getByText(/asks effy to refund the customer/i)).toBeInTheDocument();
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
    expect(transitionFulfillment).not.toHaveBeenCalled();
  });

  // ⚠ A REASON IS REQUIRED, here and in the database.
  it("cannot be declared without a reason", async () => {
    const onOpenChange = vi.fn();
    wrap(<CantSupplyDialog targets={[target("picking")]} open onOpenChange={onOpenChange} />);
    const confirm = screen.getByRole("button", { name: /^can't supply it$/i });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/why can't you supply/i), "the chiller failed");
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "unfulfillable", reason: "the chiller failed" }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  // ⚠ In bulk it lists every order it will touch, and leaves out what is past the point of no return.
  it("in bulk, names each order and leaves out the ones already gone", async () => {
    wrap(
      <CantSupplyDialog
        targets={[
          { id: "a", orderNumber: "EFY-A", status: "received" },
          { id: "b", orderNumber: "EFY-B", status: "picking" },
          { id: "c", orderNumber: "EFY-C", status: "collected" },
        ]}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText("EFY-A")).toBeInTheDocument();
    expect(screen.getByText("EFY-B")).toBeInTheDocument();
    expect(screen.queryByText("EFY-C")).not.toBeInTheDocument();
    expect(screen.getByText(/1 selected order has already left your hands/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/why can't you supply/i), "power cut");
    await userEvent.click(screen.getByRole("button", { name: /^can't supply 2$/i }));
    await waitFor(() => expect(transitionFulfillment).toHaveBeenCalledTimes(2));
    expect(transitionFulfillment).not.toHaveBeenCalledWith("c", expect.anything());
  });
});
