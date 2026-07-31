import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PromoCode } from "../model";

const updatePromo = vi.hoisted(() => vi.fn());
const createPromo = vi.hoisted(() => vi.fn());
vi.mock("../repo", () => ({ updatePromo, createPromo }));

import { PromoCodeDialog } from "./PromoCodeDialog";

const BASE: PromoCode = {
  id: "p1",
  code: "SPRING20",
  kind: "percentage",
  percentOff: 20,
  amountOff: null,
  currency: "AUD",
  minimumSubtotalAmount: "50.00",
  startsAt: null,
  endsAt: null,
  maxRedemptions: 500,
  maxPerCustomer: 1,
  status: "active",
  redemptionCount: 0,
  createdBy: "actor",
  updatedBy: null,
  createdAt: "2026-07-01T00:00:00Z",
  isAdvertised: false,
  bannerTitle: null,
  bannerSubtitle: null,
  bannerImageKey: null,
  bannerPosition: 0,
  bannerPlacement: "carousel",
  updatedAt: "2026-07-01T00:00:00Z",
};

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

afterEach(() => vi.clearAllMocks());

describe("PromoCodeDialog — the used-code lock (FR-068)", () => {
  it("leaves the value fields editable on a code that has never been redeemed", () => {
    wrap(<PromoCodeDialog open onOpenChange={() => {}} promo={BASE} />);
    expect(screen.getByLabelText("Code")).not.toBeDisabled();
    expect(screen.getByLabelText("Percent off")).not.toBeDisabled();
    expect(screen.getByLabelText("Minimum spend")).not.toBeDisabled();
  });

  it("locks the value fields once the code has been redeemed, and says why", () => {
    wrap(<PromoCodeDialog open onOpenChange={() => {}} promo={{ ...BASE, redemptionCount: 4 }} />);
    expect(screen.getByLabelText("Code")).toBeDisabled();
    expect(screen.getByLabelText("Percent off")).toBeDisabled();
    expect(screen.getByLabelText("Minimum spend")).toBeDisabled();
    expect(screen.getByText(/its value is fixed/i)).toBeInTheDocument();
  });

  it("leaves the window and caps editable on a redeemed code — only the value is frozen", () => {
    wrap(<PromoCodeDialog open onOpenChange={() => {}} promo={{ ...BASE, redemptionCount: 4 }} />);
    expect(screen.getByLabelText("Starts")).not.toBeDisabled();
    expect(screen.getByLabelText("Ends")).not.toBeDisabled();
    expect(screen.getByLabelText("Total uses")).not.toBeDisabled();
    expect(screen.getByLabelText("Uses per shopper")).not.toBeDisabled();
  });

  it("sends ONLY the window and caps for a redeemed code — an unchanged value field is still a rewrite", async () => {
    updatePromo.mockResolvedValue(BASE);
    wrap(<PromoCodeDialog open onOpenChange={() => {}} promo={{ ...BASE, redemptionCount: 4 }} />);

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(updatePromo).toHaveBeenCalledTimes(1);
    const body = updatePromo.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["endsAt", "maxPerCustomer", "maxRedemptions", "startsAt"]);
  });

  it("sends the whole definition for an unredeemed code", async () => {
    updatePromo.mockResolvedValue(BASE);
    wrap(<PromoCodeDialog open onOpenChange={() => {}} promo={BASE} />);

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    const body = updatePromo.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).toMatchObject({ code: "SPRING20", kind: "percentage", percentOff: 20 });
  });

  it("sends a cleared cap as null, not as omitted — clearing a cap must be expressible", async () => {
    updatePromo.mockResolvedValue(BASE);
    wrap(<PromoCodeDialog open onOpenChange={() => {}} promo={BASE} />);

    await userEvent.clear(screen.getByLabelText("Total uses"));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    const body = updatePromo.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.maxRedemptions).toBeNull();
  });
});
