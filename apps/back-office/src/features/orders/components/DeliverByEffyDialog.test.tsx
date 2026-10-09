import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const previewDeliveryMove = vi.hoisted(() => vi.fn());
const moveDelivery = vi.hoisted(() => vi.fn());
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), previewDeliveryMove, moveDelivery }));

const { DeliverByEffyDialog } = await import("./DeliverByEffyDialog");

const PREVIEW = {
  to: "effy", allowed: true, refusal: null, updatedAt: "2026-10-09T03:00:00.000Z", paidDeliveryAmount: "9.00",
  courierFeeAmount: null, differenceAmount: null, refundableAmount: "49.00", centsPerPoint: 1, choices: [], courier: null,
  windows: [
    { slotId: "s1", date: "2026-10-10", start: "2026-10-10T05:00:00.000Z", end: "2026-10-10T07:00:00.000Z", label: "Tomorrow, 4 pm – 6 pm" },
  ],
};

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<DeliverByEffyDialog orderId="o1" open onOpenChange={() => undefined} />, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("081 — Deliver by Effy…", () => {
  it("offers only the server's open windows and moves into the one chosen", async () => {
    previewDeliveryMove.mockResolvedValue(PREVIEW);
    moveDelivery.mockResolvedValue({ move: {} });
    renderIt();
    await userEvent.click(await screen.findByLabelText("Tomorrow, 4 pm – 6 pm"));
    await userEvent.type(screen.getByLabelText(/^Why/), "Van back");
    await userEvent.click(screen.getByRole("button", { name: "Deliver by Effy" }));
    await waitFor(() => expect(moveDelivery).toHaveBeenCalledWith("o1", {
      to: "effy", reason: "Van back", window: { slotId: "s1", date: "2026-10-10" }, expectedUpdatedAt: PREVIEW.updatedAt,
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Effy delivers this order again");
  });

  it("says why not when it may not, and when no window is open", async () => {
    previewDeliveryMove.mockResolvedValueOnce({ ...PREVIEW, allowed: false, refusal: { code: "handed_over", message: "x" }, windows: [] });
    const { unmount } = renderIt();
    expect(await screen.findByRole("alert")).toHaveTextContent("already with the courier");
    unmount();
    previewDeliveryMove.mockResolvedValueOnce({ ...PREVIEW, windows: [] });
    renderIt();
    expect(await screen.findByRole("alert")).toHaveTextContent("No delivery window is open");
  });
});
