import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  return wrap(<OrderDetailScreen fulfillmentId={d.id} />, roles);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("order detail — the header block", () => {
  it("shows the order id in mono, the customer, placed-at and the status pills", async () => {
    open(orderDetail({ atRisk: true, payment: { ...orderDetail().payment, state: "partially_refunded" } }));
    const id = await screen.findByText("EFY-10023", { selector: "div" });
    expect(id.className).toContain("font-mono");
    expect(screen.getAllByText("Maya Oyelaran").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Placed /)).toBeInTheDocument();
    expect(screen.getByText("Picking")).toBeInTheDocument();
    expect(screen.getAllByText("Partially refunded").length).toBeGreaterThan(0);
    expect(screen.getByText("At risk")).toBeInTheDocument();
  });

  it("offers the next step, Activity, and Can't supply — never Capture", async () => {
    open();
    expect(await screen.findByRole("button", { name: /mark ready for pickup/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /activity/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /can't supply/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /capture/i })).not.toBeInTheDocument();
  });

  it("shows a shop-scoped, non-disclosing refusal", async () => {
    getOrder.mockRejectedValue({ kind: "forbidden", status: 403, title: "Forbidden" });
    listOrders.mockResolvedValue(orderList([]));
    wrap(<OrderDetailScreen fulfillmentId="f1" />);
    expect(await screen.findByText(/isn't available to your shop/i)).toBeInTheDocument();
  });
});

describe("order detail — tabs", () => {
  it("opens on Summary with its five sections, each with its subtitle", async () => {
    open();
    await screen.findByText("Customer");
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("data-state", "active");
    for (const [title, subtitle] of [
      ["Customer", "Who placed this order and how to reach them."],
      ["Addresses", "Where this order ships and bills."],
      ["Payment", "How this order was paid and what is still outstanding."],
      ["Tags", /spot orders/],
      ["Internal notes", /customer never sees/],
    ] as const) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByText(subtitle)).toBeInTheDocument();
    }
  });

  it("shows the payment figures, with Captured equal to Authorised", async () => {
    open();
    await screen.findByText("Authorised");
    expect(screen.getByText("Visa •••• 4242")).toBeInTheDocument();
    expect(screen.getAllByText("$57.80").length).toBeGreaterThanOrEqual(3);
  });

  it("names the second address and says it is withheld, rather than leaving it blank", async () => {
    open();
    expect(await screen.findByText("Bill to")).toBeInTheDocument();
    expect(screen.getByText(/not shared with shops/i)).toBeInTheDocument();
  });

  it("lists this shop's priced lines on Items, with totals that reconcile", async () => {
    open();
    await userEvent.click(await screen.findByRole("tab", { name: "Items" }));
    expect(screen.getByText("Barossa Free-Range Eggs 700g")).toBeInTheDocument();
    expect(screen.getByText("$8.90")).toBeInTheDocument();
    expect(screen.getAllByText("$17.80")).toHaveLength(2); // the line, and "Your items"
    // ⚠ A two-shop order: the other shop's items get their own row, so the lines add up.
    expect(screen.getByText("Items from other shops")).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
    // ⚠ No tax line — per-item GST is unmodelled (052 R13).
    expect(document.body.textContent ?? "").not.toMatch(/\b(VAT|GST)\b/);
  });

  it("resets to Summary when the order changes", async () => {
    getOrder.mockImplementation(async (id: string) => orderDetail({ id, orderNumber: id === "f1" ? "EFY-1" : "EFY-2" }));
    listOrders.mockResolvedValue(orderList([]));
    const { rerender } = wrap(<OrderDetailScreen fulfillmentId="f1" />);
    await userEvent.click(await screen.findByRole("tab", { name: "Items" }));
    expect(screen.getByRole("tab", { name: "Items" })).toHaveAttribute("data-state", "active");

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OrderDetailScreen fulfillmentId="f2" />
      </QueryClientProvider>,
    );
    await screen.findByText("EFY-2", { selector: "div" });
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("data-state", "active");
  });
});

describe("order detail — the Activity sheet", () => {
  it("reads the log only when opened, and shows each entry's when · who", async () => {
    getOrderActivity.mockResolvedValue({
      entries: [
        { id: "e1", at: "2026-09-10T02:20:00Z", title: "Picked 1 × Eggs", actorLabel: "Sam", tone: "quiet" },
        { id: "e2", at: "2026-09-10T02:30:00Z", title: "1 × Milk marked unavailable", actorLabel: null, tone: "strong" },
      ],
    });
    open();
    await screen.findByText("Customer");
    expect(getOrderActivity).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /activity/i }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Picked 1 × Eggs")).toBeInTheDocument();
    expect(within(sheet).getByText(/· Sam$/)).toBeInTheDocument();
    expect(getOrderActivity).toHaveBeenCalledWith("f1");
  });
});

describe("order detail — previous / next", () => {
  it("walks the list it was opened from", async () => {
    getOrder.mockResolvedValue(orderDetail({ id: "b" }));
    listOrders.mockResolvedValue(
      orderList([orderRow({ id: "a" }), orderRow({ id: "b" }), orderRow({ id: "c" })], { total: 3 }),
    );
    const onNavigate = vi.fn();
    wrap(<OrderDetailScreen fulfillmentId="b" search={{ tab: "picking" }} onNavigate={onNavigate} />);
    expect(await screen.findByText("2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next order" }));
    expect(onNavigate).toHaveBeenCalledWith("c", { tab: "picking" });
    await userEvent.click(screen.getByRole("button", { name: "Previous order" }));
    expect(onNavigate).toHaveBeenCalledWith("a", { tab: "picking" });
  });
});

describe("PickList quantity controls (Fulfilment tab)", () => {
  async function fulfilment(d: OrderDetail) {
    open(d);
    await userEvent.click(await screen.findByRole("tab", { name: "Fulfilment" }));
  }

  it("writes ABSOLUTE gathered quantities, not deltas", async () => {
    updateItemProgress.mockResolvedValue({});
    await fulfilment(orderDetail({ lines: [line({ gatheredQuantity: 1 })] }));
    await userEvent.click(screen.getByRole("button", { name: /more gathered/i }));
    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { gatheredQuantity: 2 });
  });

  it("cannot gather more than was ordered", async () => {
    await fulfilment(orderDetail({ lines: [line({ gatheredQuantity: 2 })] }));
    expect(screen.getByRole("button", { name: /more gathered/i })).toBeDisabled();
  });

  // FR-010 — flag the shortfall rather than pretend the item was picked.
  it("flags the outstanding quantity unavailable", async () => {
    updateItemProgress.mockResolvedValue({});
    await fulfilment(orderDetail({ lines: [line({ gatheredQuantity: 1 })] }));
    await userEvent.click(screen.getByRole("button", { name: /^unavailable$/i }));
    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { unavailableQuantity: 1 });
  });

  // FR-010d — items turn up. Un-flagging is a first-class affordance, and it writes 0 absolutely.
  it("un-flags an unavailable item back to zero", async () => {
    updateItemProgress.mockResolvedValue({});
    await fulfilment(orderDetail({ lines: [line({ gatheredQuantity: 0, unavailableQuantity: 2 })] }));
    await userEvent.click(screen.getByRole("button", { name: /found it/i }));
    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { unavailableQuantity: 0 });
  });

  it("surfaces the shortfall in the header and points at the refund", async () => {
    open(orderDetail({ lines: [line({ unavailableQuantity: 1 })] }));
    expect(await screen.findByText(/1 item flagged unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/refund it from the items tab/i)).toBeInTheDocument();
  });

  it("locks the pick list outside the picking state", async () => {
    await fulfilment(orderDetail({ status: "received" }));
    expect(screen.getByRole("button", { name: /more gathered/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^unavailable$/i })).toBeDisabled();
  });

  it("surfaces a rejected quantity write inline", async () => {
    updateItemProgress.mockRejectedValue({ kind: "unknown", status: 400, title: "Bad request" });
    await fulfilment(orderDetail());
    await userEvent.click(screen.getByRole("button", { name: /more gathered/i }));
    expect(await screen.findByText(/more than was ordered/i)).toBeInTheDocument();
  });

  it("shows the handoff facts the shop takes part in", async () => {
    await fulfilment(orderDetail({ handoff: { collectedAt: "2026-09-10T05:00:00Z", deliveredAt: null, unfulfillableReason: null } }));
    expect(screen.getByText("Collected by Effy")).toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/delivery partner takes it from there/)).toBeInTheDocument());
  });
});
