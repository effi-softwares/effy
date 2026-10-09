import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeliveryMovePreviewDTO } from "@effy/shared-types";

const previewDeliveryMove = vi.hoisted(() => vi.fn());
const moveDelivery = vi.hoisted(() => vi.fn());
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), previewDeliveryMove, moveDelivery }));

const { SendByCourierDialog } = await import("./SendByCourierDialog");

const PREVIEW: DeliveryMovePreviewDTO = {
  to: "courier", allowed: true, refusal: null, updatedAt: "2026-10-09T03:00:00.000Z",
  paidDeliveryAmount: "9.00", courierFeeAmount: "6.50", differenceAmount: "2.50", refundableAmount: "49.00", centsPerPoint: 1,
  choices: [
    { kind: "points_difference", amount: "2.50", points: 250, default: true },
    { kind: "free_delivery_points", amount: "9.00", points: 900 },
    { kind: "free_delivery_refund", amount: "9.00" },
    { kind: "refund_difference", amount: "2.50", lastResort: true },
    { kind: "none", amount: "0.00", noteRequired: true },
  ],
  courier: { courierName: "Test Courier", serviceName: "Parcel", estimate: "2–4 business days", collection: "hub" },
  windows: null,
};

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<SendByCourierDialog orderId="o1" open onOpenChange={() => undefined} />, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("081 — Send by courier…", () => {
  it("shows the server's figures, preselects points for the difference, and marks the last resort", async () => {
    previewDeliveryMove.mockResolvedValue(PREVIEW);
    renderIt();
    expect(await screen.findByText("$9.00")).toBeInTheDocument();
    expect(screen.getByText("$6.50")).toBeInTheDocument();
    expect(screen.getByLabelText(/Points for the difference — 250 points \(\$2.50\)/)).toBeChecked();
    expect(screen.getByText(/last resort/)).toBeInTheDocument();
    expect(screen.getByText(/Usually arrives in 2–4 business days — an estimate/)).toBeInTheDocument();
    // No reason yet: nothing can be confirmed.
    expect(screen.getByRole("button", { name: "Send by courier" })).toBeDisabled();
  });

  it("sends back exactly the amount it showed, with the reason, and says what happened to a refund", async () => {
    previewDeliveryMove.mockResolvedValue(PREVIEW);
    moveDelivery.mockResolvedValue({ move: {}, refund: { status: "submitted" } });
    renderIt();
    await userEvent.click(await screen.findByLabelText(/Refund the difference/));
    await userEvent.type(screen.getByLabelText(/^Why \(staff only/), "Van off the road");
    await userEvent.click(screen.getByRole("button", { name: "Send by courier" }));
    await waitFor(() => expect(moveDelivery).toHaveBeenCalledWith("o1", {
      to: "courier", reason: "Van off the road", compensation: "refund_difference", compensationNote: null,
      expectedUpdatedAt: PREVIEW.updatedAt, expectedAmount: "2.50",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("with the payment provider");
  });

  it("nothing given needs a note", async () => {
    previewDeliveryMove.mockResolvedValue(PREVIEW);
    renderIt();
    await userEvent.click(await screen.findByLabelText("Nothing"));
    await userEvent.type(screen.getByLabelText(/^Why \(staff only/), "x");
    expect(screen.getByRole("button", { name: "Send by courier" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Why nothing is given"), "Customer asked for it");
    expect(screen.getByRole("button", { name: "Send by courier" })).toBeEnabled();
  });

  it("a refusal from the preview is said in words, and a changed amount re-reads the figures", async () => {
    previewDeliveryMove.mockResolvedValueOnce({ ...PREVIEW, allowed: false, refusal: { code: "out_for_delivery", message: "x" } });
    const { unmount } = renderIt();
    expect(await screen.findByRole("alert")).toHaveTextContent("out for delivery");
    unmount();

    previewDeliveryMove.mockResolvedValue(PREVIEW);
    moveDelivery.mockRejectedValue({ kind: "conflict", status: 409, title: "Conflict", code: "compensation_changed" });
    renderIt();
    await userEvent.type(await screen.findByLabelText(/^Why \(staff only/), "x");
    await userEvent.click(screen.getByRole("button", { name: "Send by courier" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("amounts changed");
    await waitFor(() => expect(previewDeliveryMove.mock.calls.length).toBeGreaterThanOrEqual(3));
  });
});
