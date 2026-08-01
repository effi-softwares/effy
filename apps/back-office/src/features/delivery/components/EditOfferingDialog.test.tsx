import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Offering } from "../model";

// Mock the query hooks at the feature boundary so the dialog is tested without the api client.
const createMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("../queries", () => ({
  useCreateOffering: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateOffering: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

import { EditOfferingDialog } from "./EditOfferingDialog";

const ZONES = [
  { id: "z1", code: "MEL", name: "Melbourne Metro", status: "active" as const, postcodeCount: 3, createdAt: "t", updatedAt: "t" },
  { id: "z2", code: "GEE", name: "Geelong", status: "active" as const, postcodeCount: 1, createdAt: "t", updatedAt: "t" },
];

const OFFERING: Offering = {
  id: "o1",
  originZoneId: "z1",
  originZoneName: "Melbourne Metro",
  destinationZoneId: "z2",
  destinationZoneName: "Geelong",
  method: "standard",
  priceAmount: "5.00",
  leadDaysMin: 2,
  leadDaysMax: 3,
  sameDayCutoff: null,
  status: "active",
  createdAt: "t",
  updatedAt: "t",
};

afterEach(() => vi.clearAllMocks());

// ⚠ AMENDED BY THE 032 CUTOVER — an expected delta, and the reason this dialog changed shape.
//
// These tests asserted that the dialog EDITED A PRICE. It no longer can: delivery fees are set as
// rules (Delivery → Pricing) and `delivery_offering.price_amount` is dropped, so sending one would
// fail the write. What the dialog still edits — the promised window and whether a leg is offered —
// is what these now assert, along with the price field's ABSENCE, which is the part a future change
// could quietly undo.
describe("EditOfferingDialog — edit mode", () => {
  it("locks the immutable (origin → destination, method) key", () => {
    render(<EditOfferingDialog open onOpenChange={() => {}} zones={ZONES} offering={OFFERING} />);
    expect(screen.getByRole("heading", { name: /edit rate/i })).toBeInTheDocument();
    // The zone/method selects are disabled in edit mode (the UNIQUE key cannot change).
    expect(screen.getByLabelText(/origin zone/i)).toBeDisabled();
    expect(screen.getByLabelText(/destination zone/i)).toBeDisabled();
  });

  // ⚠ THE IMPORTANT ONE. A price field here would be a second place to set a delivery fee, which is
  // how configuration drifts — and after the cutover it would also 500 on save.
  it("offers NO price field and NO same-day cutoff field", () => {
    render(<EditOfferingDialog open onOpenChange={() => {}} zones={ZONES} offering={OFFERING} />);
    expect(screen.queryByLabelText(/price/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cutoff/i)).not.toBeInTheDocument();
  });

  it("submits a PATCH with the edited window, preserving status", async () => {
    const user = userEvent.setup();
    render(<EditOfferingDialog open onOpenChange={() => {}} zones={ZONES} offering={OFFERING} />);

    const leadMax = screen.getByLabelText(/lead days max/i);
    await user.clear(leadMax);
    await user.type(leadMax, "5");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMutateAsync).toHaveBeenCalledWith({
      leadDaysMin: 2,
      leadDaysMax: 5,
      status: "active",
    });
  });
});
