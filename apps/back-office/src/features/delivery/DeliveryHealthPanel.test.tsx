import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const { deliveryHealth } = vi.hoisted(() => ({ deliveryHealth: vi.fn() }));
vi.mock("./repo", () => ({ deliveryHealth }));

import { DeliveryHealthPanel } from "./DeliveryHealthPanel";

/**
 * ⚠ THE FIXTURES ARE THE REAL DEFECTS.
 *
 * Both confirmed against live dev data before this feature was written (031 T002): 3001 in Melbourne
 * Metro (a PO-box code no locality names), and REGIONAL serving Ballarat and Bendigo with nothing
 * offered — so the storefront says "we deliver here" and checkout can quote nothing.
 */
const CLEAN = { unknownPlace: [], unconfigured: [], emptyZones: [] };

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeliveryHealthPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("DeliveryHealthPanel", () => {
  /**
   * ⚠ SC-009, and the most important assertion here.
   *
   * A correctly configured system shows NOTHING. An indicator that is always lit tells an operator
   * nothing — which is precisely how 3001 and REGIONAL went unnoticed for weeks.
   */
  it("renders nothing at all when the configuration is sound", async () => {
    deliveryHealth.mockResolvedValue(CLEAN);
    const { container } = renderPanel();

    await waitFor(() => expect(deliveryHealth).toHaveBeenCalled());
    expect(screen.queryByTestId("delivery-health")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * ⚠ THE REGIONAL CLASS — stated in terms of what the SHOPPER experiences, not in terms of rows.
   * "No active offering" means nothing to the person who has to fix it.
   */
  it("reports areas that are serviceable but unquotable, in shopper terms", async () => {
    deliveryHealth.mockResolvedValue({
      ...CLEAN,
      unconfigured: [
        { zoneCode: "REGIONAL", postcode: "3350" },
        { zoneCode: "REGIONAL", postcode: "3550" },
      ],
    });
    renderPanel();

    const group = await screen.findByTestId("health-unconfigured");
    expect(group).toHaveTextContent(/3350/);
    expect(group).toHaveTextContent(/3550/);
    expect(group).toHaveTextContent(/cannot complete checkout/i);
  });

  /** ⚠ The 3001 class, with the reason it matters rather than a bare "invalid". */
  it("reports a postcode no locality names, and says why that matters", async () => {
    deliveryHealth.mockResolvedValue({
      ...CLEAN,
      unknownPlace: [{ zoneCode: "MEL-METRO", postcode: "3001" }],
    });
    renderPanel();

    const group = await screen.findByTestId("health-unknown-place");
    expect(group).toHaveTextContent(/3001/);
    expect(group).toHaveTextContent(/PO-box|non-residential/i);
  });

  it("reports zones serving nobody", async () => {
    deliveryHealth.mockResolvedValue({ ...CLEAN, emptyZones: [{ zoneCode: "PLANNED-NORTH" }] });
    renderPanel();

    expect(await screen.findByTestId("health-empty-zones")).toHaveTextContent("PLANNED-NORTH");
  });

  /** The three classes are independent — one must not hide another. */
  it("shows every class at once, with a total", async () => {
    deliveryHealth.mockResolvedValue({
      unknownPlace: [{ zoneCode: "MEL-METRO", postcode: "3001" }],
      unconfigured: [{ zoneCode: "REGIONAL", postcode: "3350" }],
      emptyZones: [{ zoneCode: "PLANNED-NORTH" }],
    });
    renderPanel();

    expect(await screen.findByTestId("health-unknown-place")).toBeInTheDocument();
    expect(screen.getByTestId("health-unconfigured")).toBeInTheDocument();
    expect(screen.getByTestId("health-empty-zones")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-health")).toHaveTextContent("(3)");
  });

  /** ⚠ A failed read must not render a scary empty panel — the screen behind it still works. */
  it("renders nothing when the health read fails", async () => {
    deliveryHealth.mockRejectedValue(new Error("boom"));
    const { container } = renderPanel();

    await waitFor(() => expect(deliveryHealth).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
