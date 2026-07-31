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
  bannerPlacement: "carousel",
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
    expect(screen.getByLabelText("Order")).toBeDisabled();
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

// ── The banner tool and placement (029 T021/T046) ───────────────────────────────────────────────

describe("BannerCanvas within AdvertisingSection", () => {
  it("states the canonical size rather than leaving the operator to ask", () => {
    // The whole reason no banner existed: an operator was asked for an image and told no dimensions.
    renderSection({ isAdvertised: true, bannerTitle: "20% off" });
    expect(screen.getByText(/1200 × 600/)).toBeInTheDocument();
  });

  it("offers the template file, not just the numbers", () => {
    // FR-011a — a number in help text is a thing to mistype; a file is not.
    renderSection({ isAdvertised: true, bannerTitle: "20% off" });
    expect(screen.getByRole("link", { name: /download template/i })).toBeInTheDocument();
  });

  it("warns that the lower-left will carry the message", () => {
    // FR-031b. The text is drawn OVER the artwork, so that region is the operator's constraint —
    // and an operator who puts their own headline there gets it printed twice.
    renderSection({ isAdvertised: true, bannerTitle: "20% off" });
    expect(screen.getByText(/keep that part of your design quiet/i)).toBeInTheDocument();
  });

  it("says a banner without artwork is still a banner", () => {
    renderSection({ isAdvertised: true, bannerTitle: "20% off" });
    expect(screen.getByText(/perfectly good banner/i)).toBeInTheDocument();
  });
});

describe("placement", () => {
  it("defaults to the offers carousel", () => {
    renderSection({ isAdvertised: true, bannerTitle: "20% off" });
    expect(screen.getByLabelText("Placement")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Placement" })).toBeInTheDocument();
  });

  it("says the placement is exclusive", () => {
    // FR-027 — the alternative (both placements) needs no setting and floods Home.
    renderSection({ isAdvertised: true, bannerTitle: "20% off" });
    expect(screen.getByText(/one place, never both/i)).toBeInTheDocument();
  });

  it("explains Order in terms of the CURRENT placement", () => {
    // ⚠ 028's `bannerPosition` now means two different things depending on the control above it. A
    // field whose meaning silently depends on another is how an operator gets a surprise.
    renderSection({ isAdvertised: true, bannerTitle: "20% off", bannerPlacement: "carousel" });
    expect(screen.getByText(/swipe order within the offers carousel/i)).toBeInTheDocument();

    renderSection({ isAdvertised: true, bannerTitle: "20% off", bannerPlacement: "inline" });
    expect(screen.getByText(/which section it follows/i)).toBeInTheDocument();
  });
});
