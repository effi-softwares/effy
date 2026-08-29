import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductStockDetailDTO } from "@effy/shared-types";

const getProductStock = vi.hoisted(() => vi.fn());
const setStockCount = vi.hoisted(() => vi.fn());
const adjustStock = vi.hoisted(() => vi.fn());
const setStockTracking = vi.hoisted(() => vi.fn());
const setStockThreshold = vi.hoisted(() => vi.fn());

vi.mock("./stockRepo", () => ({
  getProductStock,
  setStockCount,
  adjustStock,
  setStockTracking,
  setStockThreshold,
  getStockSettings: vi.fn(),
  setStockSettings: vi.fn(),
  getLowStock: vi.fn(),
}));

const { StockPanel } = await import("./StockPanel");

function detail(over: Partial<ProductStockDetailDTO["stock"]> = {}): ProductStockDetailDTO {
  return {
    stock: {
      productId: "p1",
      tracked: true,
      onHand: 12,
      threshold: null,
      effectiveThreshold: null,
      outOfStock: false,
      low: false,
      ...over,
    },
    movements: [],
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<StockPanel productId="p1" />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  getProductStock.mockResolvedValue(detail());
  setStockCount.mockResolvedValue(detail());
  adjustStock.mockResolvedValue(detail());
  setStockTracking.mockResolvedValue(detail());
  setStockThreshold.mockResolvedValue(detail());
});

describe("what the panel says about a product", () => {
  it("states the count for a tracked product in stock", async () => {
    renderPanel();
    expect(await screen.findByText("12 in stock.")).toBeInTheDocument();
  });

  it("says OUT OF STOCK in words, not by colour (Principle V, 041)", async () => {
    getProductStock.mockResolvedValue(detail({ onHand: 0, outOfStock: true }));
    renderPanel();
    // ⚠ Asserting the WORDS, deliberately. 041 removed an amber warning colour from these exact
    // screens, and a state carried only by a hue is invisible to a colour-blind operator and to
    // every assertion. If this ever becomes colour-only, this test fails.
    expect(
      await screen.findByText(/out of stock — shoppers cannot buy this right now/i),
    ).toBeInTheDocument();
  });

  it("says RUNNING LOW with the number left", async () => {
    getProductStock.mockResolvedValue(detail({ onHand: 3, low: true, effectiveThreshold: 5 }));
    renderPanel();
    expect(await screen.findByText("Running low — 3 left.")).toBeInTheDocument();
  });

  it("says an untracked product can be bought without limit", async () => {
    getProductStock.mockResolvedValue(detail({ tracked: false, onHand: null }));
    renderPanel();
    expect(
      await screen.findByText(/not tracked — this product can be bought without limit/i),
    ).toBeInTheDocument();
  });
});

describe("turning tracking on requires a count (FR-003)", () => {
  it("keeps the switch DISABLED until an opening count is entered", async () => {
    getProductStock.mockResolvedValue(detail({ tracked: false, onHand: null }));
    renderPanel();

    const toggle = await screen.findByRole("switch", { name: /track stock/i });
    expect(toggle).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/opening count/i), "12");
    await waitFor(() => expect(toggle).toBeEnabled());
  });

  it("sends the count with the enable, never enabling without one", async () => {
    getProductStock.mockResolvedValue(detail({ tracked: false, onHand: null }));
    renderPanel();

    await userEvent.type(await screen.findByLabelText(/opening count/i), "12");
    await userEvent.click(screen.getByRole("switch", { name: /track stock/i }));

    await waitFor(() =>
      expect(setStockTracking).toHaveBeenCalledWith("p1", { tracked: true, onHand: 12 }),
    );
  });
});

describe("recording a change", () => {
  it("sends a RELATIVE change by default, with its reason", async () => {
    renderPanel();
    await userEvent.type(await screen.findByLabelText(/change by/i), "24");
    await userEvent.click(screen.getByRole("button", { name: /record/i }));

    await waitFor(() =>
      expect(adjustStock).toHaveBeenCalledWith("p1", { delta: 24, reason: "received" }),
    );
    // Absolute and relative are different operations, not two spellings of one.
    expect(setStockCount).not.toHaveBeenCalled();
  });

  it("accepts a negative change — breakage and expiry are reductions", async () => {
    renderPanel();
    await userEvent.type(await screen.findByLabelText(/change by/i), "-3");
    await userEvent.click(screen.getByRole("button", { name: /record/i }));

    await waitFor(() =>
      expect(adjustStock).toHaveBeenCalledWith("p1", { delta: -3, reason: "received" }),
    );
  });

  it("cannot submit an empty value", async () => {
    renderPanel();
    expect(await screen.findByRole("button", { name: /record/i })).toBeDisabled();
  });
});

describe("a refusal reaches the operator in the server's terms (053's lesson)", () => {
  it("names the offending field instead of collapsing to one generic sentence", async () => {
    // ⚠ A PLAIN OBJECT, not an Error — which is exactly what `@effy/api-client` throws, and exactly
    // what 053's order console got wrong by testing `e instanceof Error`. Every named refusal was
    // discarded after the server had gone to the trouble of producing it.
    //
    // The shape here is a DomainError as the client hands it over, i.e. AFTER `toDomainError` has
    // read the wire's `errors` key into `fields`. That mapping is pinned in the api-client's own
    // tests — it was broken platform-wide until 054, and without it this panel could only ever
    // say "please check the values".
    adjustStock.mockRejectedValue({
      kind: "validation",
      status: 400,
      title: "Validation failed",
      fields: [{ field: "delta", message: "must not be zero" }],
    });
    renderPanel();

    await userEvent.type(await screen.findByLabelText(/change by/i), "0");
    await userEvent.click(screen.getByRole("button", { name: /record/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/whole number to add or remove.*cannot be zero/i);
  });

  it("does not render the server's raw prose", async () => {
    adjustStock.mockRejectedValue({
      kind: "validation",
      status: 400,
      title: "Validation failed",
      detail: "pq: constraint product_stock_on_hand_ck violated on relation public.product",
      fields: [{ field: "delta", message: "must not be zero" }],
    });
    renderPanel();

    await userEvent.type(await screen.findByLabelText(/change by/i), "0");
    await userEvent.click(screen.getByRole("button", { name: /record/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").not.toMatch(/pq:|constraint|public\.product/);
  });
});

describe("the threshold section", () => {
  it("explains that nothing is low when no threshold is set anywhere (FR-005a)", async () => {
    renderPanel();
    expect(
      await screen.findByText(/nothing is reported as running low.*still reported as out of stock/is),
    ).toBeInTheDocument();
  });

  it("says when the shop default is in force", async () => {
    getProductStock.mockResolvedValue(detail({ effectiveThreshold: 5 }));
    renderPanel();
    expect(await screen.findByText(/using the shop default of 5/i)).toBeInTheDocument();
  });

  it("says when the product's own threshold overrides it", async () => {
    getProductStock.mockResolvedValue(detail({ threshold: 20, effectiveThreshold: 20 }));
    renderPanel();
    expect(
      await screen.findByText(/its own threshold of 20, which overrides the shop default/i),
    ).toBeInTheDocument();
  });

  it("clears back to the shop default by sending null, not zero", async () => {
    getProductStock.mockResolvedValue(detail({ threshold: 20, effectiveThreshold: 20 }));
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /use shop default/i }));
    // ⚠ Zero would mean "warn me at zero", which is not the same as "I have no opinion".
    await waitFor(() =>
      expect(setStockThreshold).toHaveBeenCalledWith("p1", { threshold: null }),
    );
  });
});

describe("an untracked product", () => {
  it("offers no count or threshold controls at all", async () => {
    getProductStock.mockResolvedValue(detail({ tracked: false, onHand: null }));
    renderPanel();
    await screen.findByText(/not tracked/i);
    expect(screen.queryByLabelText(/change by/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^threshold$/i)).not.toBeInTheDocument();
  });
});
