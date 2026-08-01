import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const { listPricingRules, replacePricingRule } = vi.hoisted(() => ({
  listPricingRules: vi.fn(),
  replacePricingRule: vi.fn(),
}));
vi.mock("./repo", () => ({ listPricingRules, replacePricingRule }));

import { narrowestDistanceBand, PricingRulesScreen } from "./PricingRulesScreen";

const STANDARD = {
  method: "standard",
  baseAmount: "6.00",
  roundingStep: "0.50",
  maxAmount: "45.00",
  status: "active",
  distanceBands: [
    { upperBound: "5", addAmount: "0.00" },
    { upperBound: "15", addAmount: "3.00" },
    { upperBound: "50", addAmount: "9.00" },
  ],
  weightBands: [
    { upperBound: "2", addAmount: "0.00" },
    { upperBound: "10", addAmount: "2.50" },
  ],
  updatedBy: "admin-1",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PricingRulesScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  listPricingRules.mockResolvedValue([STANDARD]);
  replacePricingRule.mockResolvedValue(STANDARD);
});

describe("PricingRulesScreen", () => {
  it("renders a section per method, with bands as a table", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("rule-standard")).toBeInTheDocument());
    expect(screen.getByTestId("rule-same_day")).toBeInTheDocument();
    expect(screen.getByTestId("rule-scheduled")).toBeInTheDocument();
    expect(screen.getByTestId("standard-distance-table")).toBeInTheDocument();
  });

  // ⚠ A method with no rule still has to be legible. Until one is saved it keeps its old rate-grid
  // price, and an admin who cannot tell "configured" from "not configured" is back in 031's position
  // — where an absent row meant both "decided against" and "nobody has looked".
  it("says plainly when a method has no rule yet", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("unconfigured-same_day")).toBeInTheDocument());
    expect(screen.queryByTestId("unconfigured-standard")).not.toBeInTheDocument();
  });

  // ⚠ THE REFUSAL COPY IS THE POINT. Every one of these rules fails silently in production, so
  // "please check the fields and try again" would leave the operator with a price table that quietly
  // charges the wrong amount forever.
  it("explains a cap_below_floor refusal in terms of what would happen", async () => {
    replacePricingRule.mockRejectedValue({
      kind: "unknown",
      status: 422,
      title: "Cannot apply this configuration",
      fields: [{ field: "cap_below_floor", message: "server prose" }],
    });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("rule-standard")).toBeInTheDocument());

    const saves = screen.getAllByRole("button", { name: /save/i });
    await userEvent.click(saves[2]!); // standard is the third section

    const err = await screen.findByTestId("error-standard");
    expect(err.textContent).toMatch(/every delivery would cost the maximum/i);
    // ⚠ Never the server's own words (FR-008).
    expect(err.textContent).not.toMatch(/server prose/);
  });

  it("falls back to generic copy for an unrecognised failure", async () => {
    replacePricingRule.mockRejectedValue({ kind: "unavailable", status: 503, title: "x" });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("rule-standard")).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole("button", { name: /save/i })[2]!);
    expect((await screen.findByTestId("error-standard")).textContent).toMatch(/waking up|unreachable/i);
  });

  // ⚠ FR-033a — band width is a PRIVACY parameter. A very narrow band can resolve to a single shop,
  // weakening hidden fulfilment, and an admin narrowing bands has no other way of knowing.
  it("warns when a distance band is narrow enough to identify a shop", async () => {
    listPricingRules.mockResolvedValue([
      { ...STANDARD, distanceBands: [{ upperBound: "1", addAmount: "0.00" }, { upperBound: "2", addAmount: "1.00" }] },
    ]);
    renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId("narrow-band-warning-standard")).toBeInTheDocument(),
    );
  });

  it("does not warn for ordinary band widths", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("rule-standard")).toBeInTheDocument());
    expect(screen.queryByTestId("narrow-band-warning-standard")).not.toBeInTheDocument();
  });
});

describe("narrowestDistanceBand", () => {
  // ⚠ The FIRST band spans 0 → its own bound, which is easy to miss: a table whose first band is
  // "up to 1 km" is narrow even though there is no earlier bound to subtract from.
  it("treats the first band's own bound as its width", () => {
    expect(narrowestDistanceBand([{ upperBound: "1", addAmount: "0" }])).toBe(1);
  });

  it("measures the span between consecutive bounds", () => {
    expect(
      narrowestDistanceBand([
        { upperBound: "5", addAmount: "0" },
        { upperBound: "7", addAmount: "1" },
        { upperBound: "50", addAmount: "9" },
      ]),
    ).toBe(2);
  });

  it("sorts before measuring, so submission order cannot hide a narrow band", () => {
    expect(
      narrowestDistanceBand([
        { upperBound: "50", addAmount: "9" },
        { upperBound: "5", addAmount: "0" },
        { upperBound: "7", addAmount: "1" },
      ]),
    ).toBe(2);
  });

  it("ignores blank and non-numeric bounds rather than reporting 0", () => {
    expect(
      narrowestDistanceBand([
        { upperBound: "", addAmount: "0" },
        { upperBound: "10", addAmount: "1" },
      ]),
    ).toBe(10);
  });

  it("returns null when there are no usable bands", () => {
    expect(narrowestDistanceBand([])).toBeNull();
    expect(narrowestDistanceBand([{ upperBound: "abc", addAmount: "0" }])).toBeNull();
  });
});
