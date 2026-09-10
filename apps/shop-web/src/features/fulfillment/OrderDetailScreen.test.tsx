import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { orderDetail, orderList } from "./__tests__/fixtures";
import type { OrderDetail, OrderLine } from "./orderConsole";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => () => {},
}));

const getOrder = vi.hoisted(() => vi.fn());
const getOrderActivity = vi.hoisted(() => vi.fn());
const listOrders = vi.hoisted(() => vi.fn());
const setOrderPicks = vi.hoisted(() => vi.fn());
const transitionFulfillment = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({
  getOrder,
  getOrderActivity,
  listOrders,
  setOrderPicks,
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

const EGGS = orderDetail().lines[0]!;
function line(over: Partial<OrderLine> = {}): OrderLine {
  return { ...EGGS, ...over };
}
const MILK = line({ orderItemId: "oi2", name: "Oat milk 1L", sku: "OAT-1L", orderedQuantity: 3, gatheredQuantity: 0, unitPrice: "3.00", lineTotal: "9.00" });

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

describe("the summary bar", () => {
  it("shows the total, the pills and 'placed · channel'", async () => {
    open(orderDetail({ atRisk: true, payment: { ...orderDetail().payment, state: "partially_refunded" } }));
    expect(await screen.findByText("Picking")).toBeInTheDocument();
    expect(screen.getAllByText("Partially refunded").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText(/ · Online store$/)).toBeInTheDocument();
  });

  it("offers Activity and the next step — and none of the controls Effy cannot perform", async () => {
    open();
    expect(await screen.findByRole("button", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark ready for pickup/i })).toBeInTheDocument();
    for (const name of [/capture/i, /duplicate/i, /resend email/i, /print invoice/i, /edit order/i, /record a return/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  /** ⚠ Revision 2: the order pagination lives in the app header, never in the page body. */
  it("carries no previous/next of its own", async () => {
    open();
    await screen.findByText("Items and fulfilment");
    expect(screen.queryByRole("button", { name: /previous order|next order/i })).not.toBeInTheDocument();
  });

  it("shows a shop-scoped, non-disclosing refusal", async () => {
    getOrder.mockRejectedValue({ kind: "forbidden", status: 403, title: "Forbidden" });
    listOrders.mockResolvedValue(orderList([]));
    wrap(<OrderDetailScreen fulfillmentId="f1" />);
    expect(await screen.findByText(/isn't available to your shop/i)).toBeInTheDocument();
  });
});

describe("layout", () => {
  it("puts Items and fulfilment, then Internal notes, in the content column, and Customer and delivery below", async () => {
    open();
    await screen.findByText("Items and fulfilment");
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["Items and fulfilment", "Internal notes", "Customer and delivery"]);
    // ⚠ The Fulfilment section is gone — merged into Items and fulfilment.
    expect(screen.queryByRole("heading", { name: "Fulfilment" })).not.toBeInTheDocument();
    // ⚠ The activity log is a sheet, not a section.
    expect(screen.queryByText("Activity log")).not.toBeInTheDocument();
  });

  it("keeps only the payment card and the actions in the narrow column", async () => {
    open(orderDetail({ tags: ["fragile"] }));
    expect(await screen.findByText("Visa •••• 4242 · $57.80 captured at checkout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print pick list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
  });

  it("shows the four blocks of Customer and delivery, with the second address withheld", async () => {
    open(orderDetail({ tags: ["fragile"] }));
    const section = (await screen.findByRole("heading", { name: "Customer and delivery" })).closest("section")!;
    for (const label of ["Customer", "Ship to", "Bill to", "Tags"]) {
      expect(within(section).getByText(label)).toBeInTheDocument();
    }
    expect(within(section).getByText(/Held by Effy with the payment/)).toBeInTheDocument();
    expect(within(section).getByText("fragile")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("says so when there are no notes, rather than collapsing to a bare rule", async () => {
    open();
    expect(await screen.findByText("No notes on this order yet.")).toBeInTheDocument();
  });

  it("totals reconcile against a two-shop order, with no tax row", async () => {
    open();
    await screen.findByText("Items and fulfilment");
    expect(screen.getByText("Items from other shops")).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
    expect(screen.getByText("Shipping")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/\b(VAT|GST)\b/);
  });
});

describe("item-level picking", () => {
  it("summarises lines picked in full, and labels each line's state", async () => {
    open(orderDetail({ lines: [line({ gatheredQuantity: 2 }), line({ orderItemId: "oi2", name: "Oat milk 1L", orderedQuantity: 3, gatheredQuantity: 1, unavailableQuantity: 2 }), line({ orderItemId: "oi3", name: "Bread", gatheredQuantity: 0, unavailableQuantity: 2, pickNote: "supplier short" }), line({ orderItemId: "oi4", name: "Tea", gatheredQuantity: 0 })] }));
    expect(await screen.findByText("1 of 4 items picked · Standard delivery")).toBeInTheDocument();
    expect(screen.getByText("Picked")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 picked")).toBeInTheDocument();
    expect(screen.getByText("Unavailable · supplier short")).toBeInTheDocument();
    expect(screen.getByText("Not picked")).toBeInTheDocument();
  });

  it("one click marks the whole line picked — no steppers", async () => {
    setOrderPicks.mockResolvedValue(orderDetail());
    open(orderDetail({ lines: [line({ gatheredQuantity: 0 })] }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /mark barossa .* picked/i }));
    expect(setOrderPicks).toHaveBeenCalledWith("f1", { lines: [{ orderItemId: "oi1", mode: "full" }] });
    expect(screen.queryByRole("button", { name: /more gathered|fewer gathered/i })).not.toBeInTheDocument();
  });

  it("clicking a picked line again clears it", async () => {
    setOrderPicks.mockResolvedValue(orderDetail());
    open(orderDetail({ lines: [line({ gatheredQuantity: 2 })] }));
    const box = await screen.findByRole("checkbox", { name: /mark barossa .* picked/i });
    expect(box).toHaveAttribute("aria-checked", "true");
    await userEvent.click(box);
    expect(setOrderPicks).toHaveBeenCalledWith("f1", { lines: [{ orderItemId: "oi1", mode: "none" }] });
  });

  it("Select all picks every line, and the label flips to Clear all", async () => {
    setOrderPicks.mockResolvedValue(orderDetail());
    open(orderDetail({ lines: [line({ gatheredQuantity: 0 }), MILK] }));
    await userEvent.click(await screen.findByRole("button", { name: "Select all" }));
    expect(setOrderPicks).toHaveBeenCalledWith("f1", {
      lines: [
        { orderItemId: "oi1", mode: "full" },
        { orderItemId: "oi2", mode: "full" },
      ],
    });

    vi.clearAllMocks();
    open(orderDetail({ id: "f2", lines: [line({ gatheredQuantity: 2 })] }));
    expect(await screen.findByRole("button", { name: "Clear all" })).toBeInTheDocument();
  });

  it("locks the boxes once the order has left picking", async () => {
    open(orderDetail({ status: "ready_for_pickup", lines: [line({ gatheredQuantity: 2 })] }));
    expect(await screen.findByRole("checkbox", { name: /mark barossa .* picked/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Adjust" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();
  });

  it("shows the handover as a Shipments row once ready", async () => {
    open(orderDetail({ status: "ready_for_pickup", lines: [line({ gatheredQuantity: 2 })] }));
    expect(await screen.findByText("Shipments")).toBeInTheDocument();
    expect(screen.getByText(/^Ready for pickup · /)).toBeInTheDocument();
    expect(screen.getByText("Barossa Free-Range Eggs 700g ×2")).toBeInTheDocument();
  });
});

describe("Adjust this line", () => {
  async function openAdjust(d = orderDetail({ lines: [MILK] })) {
    setOrderPicks.mockResolvedValue(orderDetail());
    open(d);
    await userEvent.click(await screen.findByRole("button", { name: "Adjust" }));
    return screen.findByRole("dialog");
  }

  it("has the design's title, description and fields", async () => {
    const dialog = await openAdjust();
    expect(within(dialog).getByText("Adjust this line")).toBeInTheDocument();
    expect(within(dialog).getByText("Use this when the line cannot simply be marked picked.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Availability")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Optional — what happened with this line")).toBeInTheDocument();
    // Units only for Part picked.
    expect(within(dialog).queryByLabelText("Units picked")).not.toBeInTheDocument();
  });

  it("validates Units picked: required, at least 1, not more than ordered", async () => {
    const dialog = await openAdjust();
    await userEvent.selectOptions(within(dialog).getByLabelText("Availability"), "part");
    expect(within(dialog).getByText("Out of 3 ordered.")).toBeInTheDocument();
    const units = within(dialog).getByLabelText("Units picked");

    await userEvent.type(units, "0");
    expect(within(dialog).getByText("Use Unavailable instead of 0.")).toBeInTheDocument();
    expect(units).toHaveAttribute("aria-invalid", "true");

    await userEvent.clear(units);
    await userEvent.type(units, "5");
    expect(within(dialog).getByText("Only 3 ordered.")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Save line" }));
    expect(setOrderPicks).not.toHaveBeenCalled();
  });

  it("saves a part pick with its note", async () => {
    const dialog = await openAdjust();
    await userEvent.selectOptions(within(dialog).getByLabelText("Availability"), "part");
    await userEvent.type(within(dialog).getByLabelText("Units picked"), "2");
    await userEvent.type(within(dialog).getByLabelText("Note for the team"), "one cracked");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save line" }));
    await waitFor(() =>
      expect(setOrderPicks).toHaveBeenCalledWith("f1", {
        lines: [{ orderItemId: "oi2", mode: "part", units: 2, note: "one cracked" }],
      }),
    );
  });

  it("saves Unavailable without units", async () => {
    const dialog = await openAdjust();
    await userEvent.selectOptions(within(dialog).getByLabelText("Availability"), "unavailable");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save line" }));
    await waitFor(() =>
      expect(setOrderPicks).toHaveBeenCalledWith("f1", { lines: [{ orderItemId: "oi2", mode: "unavailable" }] }),
    );
  });
});

describe("Fulfil", () => {
  it("reads 'Fulfil picked items' and only toasts when nothing is ticked", async () => {
    open(orderDetail({ lines: [line({ gatheredQuantity: 0 })] }));
    const button = await screen.findByRole("button", { name: "Fulfil picked items" });
    await userEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("counts lines picked in full, and hands over — marking untouched lines unavailable first", async () => {
    setOrderPicks.mockResolvedValue(orderDetail());
    transitionFulfillment.mockResolvedValue({ id: "f1", orderNumber: "EFY-10023", status: "ready_for_pickup", items: [] });
    open(orderDetail({ lines: [line({ gatheredQuantity: 2 }), MILK] }));
    await userEvent.click(await screen.findByRole("button", { name: "Fulfil 1 item" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("In this parcel")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/carrier|tracking/i)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Mark ready for pickup" }));
    await waitFor(() => expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "ready_for_pickup" }));
    expect(setOrderPicks).toHaveBeenCalledWith("f1", { lines: [{ orderItemId: "oi2", mode: "unavailable" }] });
    expect(setOrderPicks.mock.invocationCallOrder[0]!).toBeLessThan(transitionFulfillment.mock.invocationCallOrder[0]!);
  });
});

describe("the Activity sheet", () => {
  it("opens from the action row, reads only then, and lists who · when", async () => {
    open();
    getOrderActivity.mockResolvedValue({
      entries: [
        { id: "e1", at: "2026-09-10T02:20:00Z", title: "Eggs — picked in full", actorLabel: "Sam", tone: "quiet" },
        { id: "e2", at: "2026-09-10T02:30:00Z", title: "Oat milk — marked unavailable · supplier short", actorLabel: "Sam", tone: "negative" },
      ],
    });
    await screen.findByText("Items and fulfilment");
    expect(getOrderActivity).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Activity" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Everything that has happened on this order.")).toBeInTheDocument();
    expect(await within(sheet).findByText("Oat milk — marked unavailable · supplier short")).toBeInTheDocument();
    expect(within(sheet).getAllByText(/^Sam · /)).toHaveLength(2);
    // ⚠ The order's log only — never product stats or the product change log.
    expect(within(sheet).queryByText(/last 30 days|change log/i)).not.toBeInTheDocument();
  });
});
