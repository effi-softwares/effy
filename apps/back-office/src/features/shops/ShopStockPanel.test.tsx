import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LowStockRowDTO } from "@effy/shared-types";

const getShopLowStock = vi.hoisted(() => vi.fn());
const setShopStockSettings = vi.hoisted(() => vi.fn());

vi.mock("./stockRepo", () => ({
  getShopLowStock,
  setShopStockSettings,
  getShopProductStock: vi.fn(),
  setShopProductStock: vi.fn(),
  setShopProductTracking: vi.fn(),
}));

const { ShopStockPanel } = await import("./ShopStockPanel");

function row(over: Partial<LowStockRowDTO> = {}): LowStockRowDTO {
  return {
    productId: "p1",
    name: "Milk",
    sku: "MLK-1",
    onHand: 2,
    effectiveThreshold: 5,
    severity: "low",
    // ⚠ 057 added supplier grouping to the restock DTO. Back-office renders neither field — the
    // shop's supply chain is the shop's business — but the shape is shared, so the fixture carries it.
    supplierId: null,
    supplierName: null,
    ...over,
  };
}

function renderPanel(canManage = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<ShopStockPanel shopId="shop-1" canManage={canManage} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  getShopLowStock.mockResolvedValue([row()]);
  setShopStockSettings.mockResolvedValue({ defaultThreshold: 5 });
});

describe("the restock list", () => {
  it("tells OUT apart from LOW in words, not by colour (Principle V, 041)", async () => {
    getShopLowStock.mockResolvedValue([
      row({ productId: "p1", name: "Milk", onHand: 0, severity: "out" }),
      row({ productId: "p2", name: "Bread", onHand: 2, severity: "low" }),
    ]);
    renderPanel();

    // ⚠ Asserting the WORDS. 041 removed the last non-monochrome warning colour from these consoles,
    // and a state carried only by a tint is invisible to a colour-blind operator and to every
    // assertion. If this ever becomes colour-only, this test fails.
    expect(await screen.findByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("says plainly that untracked products never appear, rather than showing an ambiguous blank", async () => {
    getShopLowStock.mockResolvedValue([]);
    renderPanel();

    // An empty list has two possible meanings — "nothing needs restocking" and "this shop tracks
    // nothing" — and a bare empty state would leave a support agent unable to tell which.
    expect(
      await screen.findByText(/nothing needs restocking.*does not track.*never appear/is),
    ).toBeInTheDocument();
  });

  it("shows the count and the threshold it is being judged against", async () => {
    renderPanel();
    expect(await screen.findByText("Milk")).toBeInTheDocument();
    expect(screen.getByText("MLK-1")).toBeInTheDocument();
  });
});

describe("the write tier (FR-025, FR-028)", () => {
  it("offers no settings control to a csa — reading stays open, writing does not", async () => {
    renderPanel(false);
    await screen.findByText("Milk");
    // ⚠ A courtesy, not the gate. The server refuses a csa write from `admin.staff` regardless; this
    // only stops the UI dangling a control that would fail.
    expect(screen.queryByLabelText(/^threshold$/i)).not.toBeInTheDocument();
  });

  it("offers it to admin/manager", async () => {
    renderPanel(true);
    expect(await screen.findByLabelText(/^threshold$/i)).toBeInTheDocument();
  });
});

describe("the shop default threshold", () => {
  it("clears to null, not zero, when left blank", async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));

    // ⚠ Zero would mean "warn me at zero", making every product permanently low. Blank means "I have
    // no opinion" — a different instruction, and FR-005a depends on the difference.
    await waitFor(() =>
      expect(setShopStockSettings).toHaveBeenCalledWith("shop-1", { defaultThreshold: null }),
    );
  });

  it("sends the number when one is entered", async () => {
    renderPanel();
    await userEvent.type(await screen.findByLabelText(/^threshold$/i), "5");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(setShopStockSettings).toHaveBeenCalledWith("shop-1", { defaultThreshold: 5 }),
    );
  });

  // ⚠ 053's defect, checked on a new surface: the order console collapsed EVERY refusal to one
  // generic sentence because it tested `e instanceof Error` while the api client throws a PLAIN
  // OBJECT. Nothing about that bug was visible in a passing suite.
  it("reads a refusal off the plain object the api client actually throws", async () => {
    setShopStockSettings.mockRejectedValue({
      kind: "validation",
      status: 400,
      title: "Validation failed",
    });
    renderPanel();
    await userEvent.type(await screen.findByLabelText(/^threshold$/i), "-1");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/whole number.*or leave it blank/i);
  });

  it("does not render the server's raw prose", async () => {
    setShopStockSettings.mockRejectedValue({
      kind: "validation",
      status: 400,
      detail: "pq: constraint shop_stock_settings_default_low_stock_threshold_check violated",
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").not.toMatch(/pq:|constraint|_check/);
  });
});
