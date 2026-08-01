import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PromoCode } from "../model";

vi.mock("../repo", () => ({
  presignBannerImage: vi.fn(),
  uploadBannerImage: vi.fn(),
  updatePromo: vi.fn(),
}));

import { AdvertisingSection } from "./AdvertisingSection";

const BASE: PromoCode = {
  id: "p1",
  code: "SPRING20",
  kind: "percentage",
  percentOff: 20,
  amountOff: null,
  currency: "AUD",
  minimumSubtotalAmount: "0.00",
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  maxPerCustomer: null,
  status: "active",
  redemptionCount: 0,
  createdBy: "actor",
  updatedBy: null,
  createdAt: "2026-07-31T00:00:00.000Z",
  isAdvertised: false,
  bannerTitle: null,
  bannerSubtitle: null,
  bannerImageKey: null,
  bannerPosition: 0,
  updatedAt: "2026-07-31T00:00:00.000Z",
};

function renderSection(promo: Partial<PromoCode> = {}, canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdvertisingSection promo={{ ...BASE, ...promo }} canManage={canManage} />
    </QueryClientProvider>,
  );
}

/**
 * 028 T053 — the storefront controls.
 *
 * The two tests that matter are the first and the last. A promotion that becomes public because
 * nobody said otherwise turns one customer's goodwill credit into a storewide discount, and copy that
 * can be typed into a promotion nobody will ever see is a trap for the operator who types it.
 */
describe("AdvertisingSection", () => {
  it("defaults to not advertised", () => {
    renderSection();
    expect(screen.getByLabelText("Advertise on storefront")).not.toBeChecked();
  });

  it("says plainly that advertising makes the promotion public", () => {
    renderSection();
    // The default is the safety; this sentence is what stops someone reaching past it.
    expect(screen.getByText(/every shopper/i)).toBeInTheDocument();
  });

  it("disables the banner copy while advertising is off", () => {
    renderSection();
    expect(screen.getByLabelText("Headline")).toBeDisabled();
    expect(screen.getByLabelText("Position")).toBeDisabled();
  });

  it("enables the banner copy once advertising is on", () => {
    renderSection({ isAdvertised: true });
    expect(screen.getByLabelText("Headline")).toBeEnabled();
  });

  it("cannot be saved as advertised without a headline", () => {
    renderSection({ isAdvertised: true, bannerTitle: null });
    expect(screen.getByRole("button", { name: /save storefront settings/i })).toBeDisabled();
  });

  it("can be saved once a headline exists", () => {
    renderSection({ isAdvertised: true, bannerTitle: "20% off" });
    expect(screen.getByRole("button", { name: /save storefront settings/i })).toBeEnabled();
  });

  it("offers to remove artwork only when there is some", () => {
    // Artwork is optional (FR-037b), so clearing must be as easy as setting — a banner that cannot
    // lose its image is one an operator cannot fix.
    renderSection({ isAdvertised: true, bannerTitle: "20% off", bannerImageKey: "promotions/p1/x.png" });
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();

    renderSection({ isAdvertised: true, bannerTitle: "20% off" });
    expect(screen.queryAllByRole("button", { name: /^remove$/i })).toHaveLength(1);
  });

  it("hides the save action from an operator who cannot manage promotions", () => {
    renderSection({}, false);
    expect(screen.queryByRole("button", { name: /save storefront settings/i })).not.toBeInTheDocument();
  });
});
