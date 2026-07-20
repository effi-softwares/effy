import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { FulfillmentDetail, FulfillmentItem, FulfillmentStatus } from "./model";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const getFulfillment = vi.hoisted(() => vi.fn());
const updateItemProgress = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({
  getFulfillment,
  updateItemProgress,
  listFulfillments: vi.fn(),
  transitionFulfillment: vi.fn(),
}));

import { OrderDetailScreen } from "./OrderDetailScreen";

function item(over: Partial<FulfillmentItem> = {}): FulfillmentItem {
  return {
    orderItemId: "oi1",
    name: "SunRice Long Grain White Rice 1kg",
    sku: "S2-007",
    imageUrl: null,
    orderedQuantity: 2,
    gatheredQuantity: 0,
    unavailableQuantity: 0,
    ...over,
  };
}

function detail(status: FulfillmentStatus, items: FulfillmentItem[] = [item()]): FulfillmentDetail {
  return {
    id: "f1",
    orderNumber: "EFY-10023",
    placedAt: "2026-07-20T02:14:05Z",
    status,
    stateChangedAt: "2026-07-20T02:15:11Z",
    promise: { serviceLevel: "standard", readyBy: "2026-07-20T03:14:05Z" },
    delivery: {
      recipientName: "Ada Lovelace",
      phone: "0400 000 000",
      line1: "1 Test St",
      line2: "Unit 4",
      city: "Melbourne",
      region: "VIC",
      postalCode: "3000",
      country: "AU",
    },
    items,
    ...{},
  };
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

describe("OrderDetailScreen", () => {
  it("renders the reference, delivery context and this shop's lines", async () => {
    getFulfillment.mockResolvedValue(detail("picking"));

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    expect(await screen.findByText("EFY-10023")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("1 Test St, Unit 4")).toBeInTheDocument();
    expect(screen.getByText("3000")).toBeInTheDocument();
    expect(screen.getByText("SunRice Long Grain White Rice 1kg")).toBeInTheDocument();
    expect(screen.getByText("Pick list (1 line)")).toBeInTheDocument();
  });

  it("shows a loading state then an error state with retry", async () => {
    getFulfillment.mockRejectedValueOnce(new Error("boom"));
    getFulfillment.mockResolvedValue(detail("picking"));

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByText("EFY-10023")).toBeInTheDocument();
  });

  it("shows a shop-scoped, non-disclosing refusal", async () => {
    getFulfillment.mockRejectedValue({ kind: "forbidden", status: 403, title: "Forbidden" });

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    expect(await screen.findByText(/isn't available to your shop/i)).toBeInTheDocument();
  });
});

describe("PickList quantity controls", () => {
  it("writes ABSOLUTE gathered quantities, not deltas", async () => {
    getFulfillment.mockResolvedValue(detail("picking", [item({ gatheredQuantity: 1 })]));
    updateItemProgress.mockResolvedValue(detail("picking", [item({ gatheredQuantity: 2 })]));

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    await userEvent.click(await screen.findByRole("button", { name: /more gathered/i }));

    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { gatheredQuantity: 2 });
  });

  it("cannot gather more than was ordered", async () => {
    getFulfillment.mockResolvedValue(detail("picking", [item({ gatheredQuantity: 2 })]));

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    expect(await screen.findByRole("button", { name: /more gathered/i })).toBeDisabled();
  });

  // FR-010 — flag the shortfall rather than pretend the item was picked.
  it("flags the outstanding quantity unavailable", async () => {
    getFulfillment.mockResolvedValue(detail("picking", [item({ gatheredQuantity: 1 })]));
    updateItemProgress.mockResolvedValue(detail("picking"));

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    await userEvent.click(await screen.findByRole("button", { name: /unavailable/i }));

    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { unavailableQuantity: 1 });
  });

  // FR-010d — items turn up. Un-flagging is a first-class affordance, and it writes 0 absolutely.
  it("un-flags an unavailable item back to zero", async () => {
    getFulfillment.mockResolvedValue(detail("picking", [item({ unavailableQuantity: 2 })]));
    updateItemProgress.mockResolvedValue(detail("picking"));

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    expect(await screen.findByText("2 unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /found it/i }));

    expect(updateItemProgress).toHaveBeenCalledWith("f1", "oi1", { unavailableQuantity: 0 });
  });

  // FR-010b / SC-011 — the shortfall is recorded and visible, and explicitly carries no money effect.
  it("surfaces the shortfall without promising any adjustment", async () => {
    getFulfillment.mockResolvedValue(detail("picking", [item({ unavailableQuantity: 1 })]));

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    expect(await screen.findByText(/1 item flagged unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is refunded or adjusted here/i)).toBeInTheDocument();
  });

  it("locks the pick list outside the picking state", async () => {
    getFulfillment.mockResolvedValue(detail("received"));

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    expect(await screen.findByRole("button", { name: /more gathered/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /unavailable/i })).toBeDisabled();
  });

  it("surfaces a rejected quantity write inline", async () => {
    getFulfillment.mockResolvedValue(detail("picking"));
    updateItemProgress.mockRejectedValue({ kind: "unknown", status: 400, title: "Bad request" });

    wrap(<OrderDetailScreen fulfillmentId="f1" />);

    await userEvent.click(await screen.findByRole("button", { name: /more gathered/i }));

    expect(await screen.findByText(/more than was ordered/i)).toBeInTheDocument();
  });
});
