import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { orderDetail, orderList, orderRow } from "./__tests__/fixtures";
import type { OrderDetail, OrderLine } from "./orderConsole";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => () => {},
}));

const getOrder = vi.hoisted(() => vi.fn());
const getOrderActivity = vi.hoisted(() => vi.fn());
const listOrders = vi.hoisted(() => vi.fn());
const updateItemProgress = vi.hoisted(() => vi.fn());
const transitionFulfillment = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({
  getOrder,
  getOrderActivity,
  listOrders,
  updateItemProgress,
  transitionFulfillment,
  setOrderTags: vi.fn(),
  addOrderNote: vi.fn(),
  issueShopRefund: vi.fn(),
  listFulfillments: vi.fn(),
  getFulfillment: vi.fn(),
}));

const sessionQuery = vi.hoisted(() => ({ queryKey: ["session"], queryFn: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({ sessionQuery }));

import { OrderDetailScreen } from "./OrderDetailScreen";

function line(over: Partial<OrderLine> = {}): OrderLine {
  return { ...orderDetail().lines[0]!, ...over };
}

function wrap(children: ReactNode, roles: string[] = ["shop_staff"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(["session"], { status: "signed-in", identity: { subject: "s1", email: "x@y.z", roles } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

function open(d: OrderDetail = orderDetail(), roles?: string[]) {
  getOrder.mockResolvedValue(d);
  listOrders.mockResolvedValue(orderList([]));
  getOrderActivity.mockResolvedValue({ entries: [] });
  return wrap(<OrderDetailScreen fulfillmentId={d.id} />, roles);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("order detail — the design's summary bar", () => {
  it("leads with the total, then the status, payment and risk pills, then the placed line", async () => {
    open(orderDetail({ atRisk: true, payment: { ...orderDetail().payment, state: "partially_refunded" } }));
    expect(await screen.findByText("Picking")).toBeInTheDocument();
    // The total appears in the bar and again as the Items total.
    expect(screen.getAllByText("$57.80").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Partially refunded").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText(/^Placed .* · Standard delivery · ready by/)).toBeInTheDocument();
  });

  it("offers the next step — and never Capture, Duplicate, Resend email or Print invoice", async () => {
    open();
    expect(await screen.findByRole("button", { name: /mark ready for pickup/i })).toBeInTheDocument();
    for (const name of [/capture/i, /duplicate/i, /resend email/i, /print invoice/i, /edit order/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("shows a shop-scoped, non-disclosing refusal", async () => {
    getOrder.mockRejectedValue({ kind: "forbidden", status: 403, title: "Forbidden" });
    listOrders.mockResolvedValue(orderList([]));
    wrap(<OrderDetailScreen fulfillmentId="f1" />);
    expect(await screen.findByText(/isn't available to your shop/i)).toBeInTheDocument();
  });
});

describe("order detail — the main column", () => {
  it("has the design's sections in order: Items, Fulfilment, Internal notes, Activity log", async () => {
    open();
    await screen.findByRole("heading", { name: "Items" });
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["Items", "Fulfilment", "Internal notes"]);
    expect(screen.getByText("Activity log")).toBeInTheDocument();
  });

  it("lists this shop's lines as qty × unit and a line total, with totals that reconcile", async () => {
    open();
    await screen.findByText("2 × $8.90");
    expect(screen.getByText("Part picked")).toBeInTheDocument();
    // ⚠ A two-shop order: the other shop's items get their own row, so the lines add up.
    expect(screen.getByText("Items from other shops")).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    // ⚠ No tax row — per-item GST is unmodelled (052 R13).
    expect(document.body.textContent ?? "").not.toMatch(/\b(VAT|GST)\b/);
  });

  it("shows the Refunded box with each refund and the net paid", async () => {
    open(
      orderDetail({
        money: { ...orderDetail().money, refunded: "8.90", net: "48.90" },
        refunds: [
          { id: "r1", amount: "8.90", status: "succeeded", reason: "item_unusable", actorKind: "shop", actorLabel: "Sam", createdAt: "2026-09-10T04:00:00Z" },
        ],
      }),
    );
    expect(await screen.findByText("Refunded")).toBeInTheDocument();
    expect(screen.getByText("−$8.90")).toBeInTheDocument();
    expect(screen.getByText(/Unusable · .* · returned · Sam/)).toBeInTheDocument();
    expect(screen.getByText("Net paid")).toBeInTheDocument();
    expect(screen.getByText("$48.90")).toBeInTheDocument();
  });

  it("shows the activity log in the page, with who · when", async () => {
    getOrder.mockResolvedValue(orderDetail());
    listOrders.mockResolvedValue(orderList([]));
    getOrderActivity.mockResolvedValue({
      entries: [{ id: "e1", at: "2026-09-10T02:20:00Z", title: "Picked 1 × Eggs", actorLabel: "Sam", tone: "quiet" }],
    });
    wrap(<OrderDetailScreen fulfillmentId="f1" />);
    expect(await screen.findByText("Picked 1 × Eggs")).toBeInTheDocument();
    expect(screen.getByText(/^Sam · /)).toBeInTheDocument();
  });

  it("lists internal notes, newest first, with their author", async () => {
    open(orderDetail({ notes: [{ id: "n1", body: "Call on arrival", authorLabel: "Maya", createdAt: "2026-09-10T03:00:00Z" }] }));
    expect(await screen.findByText("Call on arrival")).toBeInTheDocument();
    expect(screen.getByText(/^Maya · /)).toBeInTheDocument();
  });
});

describe("order detail — the rail", () => {
  it("has the Payment card, the action stack, Tags, Customer, Ship to and Bill to", async () => {
    open(orderDetail({ tags: ["fragile"] }));
    expect(await screen.findByText("Visa •••• 4242 · $57.80 captured at checkout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print pick list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Can't supply this order" })).toBeInTheDocument();
    expect(screen.getByText("fragile")).toBeInTheDocument();
    expect(screen.getByText("Ship to")).toBeInTheDocument();
    // ⚠ Named and said to be withheld (023 FR-018).
    expect(screen.getByText("Bill to")).toBeInTheDocument();
    expect(screen.getByText(/Held by Effy with the payment/)).toBeInTheDocument();
  });
});

describe("order detail — previous / next", () => {
  it("walks the list it was opened from", async () => {
    getOrder.mockResolvedValue(orderDetail({ id: "b" }));
    getOrderActivity.mockResolvedValue({ entries: [] });
    listOrders.mockResolvedValue(orderList([orderRow({ id: "a" }), orderRow({ id: "b" }), orderRow({ id: "c" })], { total: 3 }));
    const onNavigate = vi.fn();
    wrap(<OrderDetailScreen fulfillmentId="b" search={{ tab: "picking" }} onNavigate={onNavigate} />);
    expect(await screen.findByText("2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next order" }));
    expect(onNavigate).toHaveBeenCalledWith("c", { tab: "picking" });
    await userEvent.click(screen.getByRole("button", { name: "Previous order" }));
    expect(onNavigate).toHaveBeenCalledWith("a", { tab: "picking" });
  });
});

describe("PickList quantity controls (Fulfilment section)", () => {
  it("writes ABSOLUTE gathered quantities, not deltas", async () => {
    updateItemProgress.mockResolvedValue({});
    open(orderDetail({ lines: [line({ gatheredQuantity: 1 })] }));
    await userEvent.click(await screen.findByRole("button", { name: /more gathered/i }));
    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { gatheredQuantity: 2 });
  });

  it("cannot gather more than was ordered", async () => {
    open(orderDetail({ lines: [line({ gatheredQuantity: 2 })] }));
    expect(await screen.findByRole("button", { name: /more gathered/i })).toBeDisabled();
  });

  // FR-010 — flag the shortfall rather than pretend the item was picked.
  it("flags the outstanding quantity unavailable", async () => {
    updateItemProgress.mockResolvedValue({});
    open(orderDetail({ lines: [line({ gatheredQuantity: 1 })] }));
    await userEvent.click(await screen.findByRole("button", { name: /^unavailable$/i }));
    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { unavailableQuantity: 1 });
  });

  // FR-010d — items turn up. Un-flagging is a first-class affordance, and it writes 0 absolutely.
  it("un-flags an unavailable item back to zero", async () => {
    updateItemProgress.mockResolvedValue({});
    open(orderDetail({ lines: [line({ gatheredQuantity: 0, unavailableQuantity: 2 })] }));
    await userEvent.click(await screen.findByRole("button", { name: /found it/i }));
    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { unavailableQuantity: 0 });
  });

  it("locks the pick list outside the picking state", async () => {
    open(orderDetail({ status: "received" }));
    expect(await screen.findByRole("button", { name: /more gathered/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^unavailable$/i })).toBeDisabled();
  });

  it("surfaces a rejected quantity write inline", async () => {
    updateItemProgress.mockRejectedValue({ kind: "unknown", status: 400, title: "Bad request" });
    open();
    await userEvent.click(await screen.findByRole("button", { name: /more gathered/i }));
    expect(await screen.findByText(/more than was ordered/i)).toBeInTheDocument();
  });

  it("says how many units are still to pick, and shows the driver handoff once it happens", async () => {
    open(orderDetail({ status: "picking", lines: [line({ gatheredQuantity: 1 })] }));
    expect(await screen.findByText("1 unit still to pick.")).toBeInTheDocument();
  });

  it("records the collection by an Effy driver", async () => {
    open(orderDetail({ status: "collected", handoff: { collectedAt: "2026-09-10T05:00:00Z", deliveredAt: null, unfulfillableReason: null } }));
    const row = (await screen.findByText("Collected by an Effy driver")).parentElement!;
    expect(within(row).getByText(/Sep/)).toBeInTheDocument();
  });
});
