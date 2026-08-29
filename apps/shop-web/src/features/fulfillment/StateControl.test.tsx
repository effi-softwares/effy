import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

// ── 055 US6 — the exit a shop that cannot supply its portion previously lacked ──────────────────
//
// ⚠ BEFORE THIS, A SHOP HOLDING AN ORDER IT COULD NOT FILL HAD NO STATE TO MOVE IT TO. The portion
// sat in the active queue forever, and the only way out was for someone to stop looking at it.

describe("can't supply this order (055 US6)", () => {
  // ⚠ `mockReset`, not `mockClear`. The suite above deliberately uses `mockClear` to keep per-test
  // resolved values — which means the LAST of them (a 403 rejection) leaks into anything that runs
  // after it. This block starts from a clean mock and its own success.
  beforeEach(() => {
    transitionFulfillment.mockReset();
    transitionFulfillment.mockResolvedValue(detail("unfulfillable" as never));
  });

  // ⚠ It tells Effy to refund a customer and takes the order off the queue for good. A mis-tap here
  // is not a wrong pixel.
  it("asks before it acts, naming the consequence", async () => {
    wrap(<StateControl detail={detail("picking")} onReload={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /can't supply this order/i }));

    expect(transitionFulfillment).not.toHaveBeenCalled();
    expect(screen.getByText(/asks effy to refund the customer/i)).toBeInTheDocument();
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
  });

  // ⚠ A REASON IS REQUIRED, here and in the database. Back-office decides a refund on the strength
  // of it; "the shop said no" is not a basis for returning a customer's money.
  it("cannot be declared without a reason", async () => {
    wrap(<StateControl detail={detail("picking")} onReload={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /can't supply this order/i }));

    const confirm = screen.getByRole("button", { name: /^can't supply it$/i });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/why can't you supply/i), "the chiller failed");
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(transitionFulfillment).toHaveBeenCalledWith("f1", {
        to: "unfulfillable",
        reason: "the chiller failed",
      }),
    );
  });

  // ⚠ Once collected it is no longer the shop's call — the goods have left and somebody is carrying
  // them. Mirrors the server's legal-edge map, and the server decides.
  it.each(["collected", "delivered", "unfulfillable", "withdrawn"])(
    "offers no control once %s",
    (status) => {
      wrap(<StateControl detail={detail(status as never)} onReload={() => {}} />);
      expect(screen.queryByRole("button", { name: /can't supply/i })).not.toBeInTheDocument();
    },
  );

  // ⚠ A shop may know before opening the order that it cannot supply it — the whole delivery is off,
  // the chiller failed. Requiring them to open it first would be ceremony.
  it.each(["pending", "received", "picking", "ready_for_pickup"])(
    "is offered while %s",
    (status) => {
      wrap(<StateControl detail={detail(status as never)} onReload={() => {}} />);
      expect(screen.getByRole("button", { name: /can't supply this order/i })).toBeInTheDocument();
    },
  );

  // ⚠ It is the LAST RESORT, never a primary action sitting beside the forward one.
  it("is not a primary action", async () => {
    wrap(<StateControl detail={detail("picking")} onReload={() => {}} />);
    const button = screen.getByRole("button", { name: /can't supply this order/i });
    expect(button.className).not.toMatch(/bg-primary/);
  });

  // ⚠ `withdrawn` was NOT the shop's doing, and this screen is where they are judged.
  it("says a cancelled order was cancelled, not that the shop failed", () => {
    wrap(<StateControl detail={detail("withdrawn" as never)} onReload={() => {}} />);
    expect(screen.getByText(/the customer cancelled this order/i)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/couldn't supply|failed to/i);
  });
});
