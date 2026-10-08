import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const creditPoints = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("../repo", () => ({
  creditPoints, debitPoints: vi.fn(), getCustomer: vi.fn(), getPointsHistory: vi.fn(), getPointsSettings: vi.fn(),
  searchCustomers: vi.fn(), updatePointsSettings: vi.fn(),
}));
vi.mock("@effy/design-system/ui", async (orig) => ({ ...(await orig<object>()), toast }));

const { CreditPointsSheet } = await import("../components/CreditPointsSheet");
const { pointsActionError } = await import("../errorText");

function renderSheet(limit: number | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const onOpenChange = vi.fn();
  render(
    <CreditPointsSheet
      open
      onOpenChange={onOpenChange}
      customerId="c1"
      customerName="Ada Lovelace"
      orders={[{ id: "o1", orderNumber: "EFY-ABC123" }]}
      defaultOrderId="o1"
      limit={limit}
      centsPerPoint={1}
    />,
    { wrapper },
  );
  return { onOpenChange };
}

beforeEach(() => {
  creditPoints.mockReset();
  toast.mockReset();
});

describe("Credit points (074)", () => {
  it("shows the value, credits against the order, and says so in one line", async () => {
    creditPoints.mockResolvedValue({ entryId: "e1", usable: 500 });
    const { onOpenChange } = renderSheet(null);
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "500" } });
    expect(screen.getByText(/Worth \$5\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Credit 500 points" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("500 points credited to Ada Lovelace."));
    expect(creditPoints).toHaveBeenCalledWith("c1", { points: 500, reason: "goodwill", note: "", orderId: "o1" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("tells a csa their limit and refuses to submit above it", () => {
    renderSheet(2000);
    expect(screen.getByText(/You can credit up to 2,000 at once/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "2,500" } });
    expect(screen.getByText(/over your limit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Credit 2,500 points" })).toBeDisabled();
  });

  it("maps a server refusal to the console's own words, never the server's prose", () => {
    expect(pointsActionError({ kind: "forbidden", status: 403, title: "", type: "https://effyshopping.com/problems/over-agent-limit", detail: "internal text" })).toBe(
      "That's more than you can credit at once. Ask a manager to credit it.",
    );
    expect(pointsActionError(new Error("boom"))).toBe("That didn't work. Try again.");
  });
});
