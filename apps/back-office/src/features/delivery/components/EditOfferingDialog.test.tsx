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

describe("EditOfferingDialog — edit mode", () => {
  it("prefills the rate and locks the immutable (origin → destination, method) key", () => {
    render(<EditOfferingDialog open onOpenChange={() => {}} zones={ZONES} offering={OFFERING} />);
    expect(screen.getByRole("heading", { name: /edit rate/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/price/i)).toHaveValue("5.00");
    // The zone/method selects are disabled in edit mode (the UNIQUE key cannot change).
    expect(screen.getByLabelText(/origin zone/i)).toBeDisabled();
    expect(screen.getByLabelText(/destination zone/i)).toBeDisabled();
  });

  it("submits a PATCH with the edited price, preserving the window + status", async () => {
    const user = userEvent.setup();
    render(<EditOfferingDialog open onOpenChange={() => {}} zones={ZONES} offering={OFFERING} />);

    const price = screen.getByLabelText(/price/i);
    await user.clear(price);
    await user.type(price, "6.50");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMutateAsync).toHaveBeenCalledWith({
      priceAmount: "6.50",
      leadDaysMin: 2,
      leadDaysMax: 3,
      sameDayCutoff: null,
      status: "active",
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
