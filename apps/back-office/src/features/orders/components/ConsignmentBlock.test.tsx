import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConsignmentDTO } from "@effy/shared-types";

import type { OrderPackage } from "../model";

const repo = vi.hoisted(() => ({ saveConsignment: vi.fn(), recordConsignmentStep: vi.fn(), uploadConsignmentLabel: vi.fn() }));
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), ...repo }));
const deliveryRepo = vi.hoisted(() => ({ listCourierServices: vi.fn() }));
vi.mock("../../delivery/repo", async () => ({ ...(await vi.importActual<object>("../../delivery/repo")), ...deliveryRepo }));

const { ConsignmentBlock, nextSteps } = await import("./ConsignmentBlock");

const consignment = (over: Partial<ConsignmentDTO> = {}): ConsignmentDTO => ({
  id: "c1", service: { id: "s1", label: "Test Courier · Parcel" }, collection: "hub", reference: "REF123",
  trackingUrl: "https://track.example.test/REF123", labelUrl: null, pickup: null, state: "handed_over",
  events: [{ kind: "handed_over", actor: { kind: "staff", sub: "x" }, note: null, at: "2026-10-09T03:00:00Z" }], ...over,
});
const pkg = (c: ConsignmentDTO | null): OrderPackage => ({ fulfillmentId: "f1", consignment: c } as unknown as OrderPackage);

function renderBlock(c: ConsignmentDTO | null, collection: "hub" | "supplier" = "hub") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<ConsignmentBlock orderId="o1" pkg={pkg(c)} canRecord collection={collection} />, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deliveryRepo.listCourierServices.mockResolvedValue({ items: [], collectionDefault: "hub" });
});

describe("080 — the consignment on the order page", () => {
  it("offers only the steps the server allows from each state", () => {
    expect(nextSteps(null)).toEqual([]);
    expect(nextSteps("booked")).toEqual(["cancelled"]);
    expect(nextSteps("handed_over")).toEqual(["in_transit", "delivered", "failed", "lost", "damaged", "returned"]);
    expect(nextSteps("in_transit")).toEqual(["delivered", "failed", "lost", "damaged", "returned"]);
    expect(nextSteps("lost")).toEqual(["resolved", "delivered"]);
    expect(nextSteps("delivered")).toEqual([]);
    expect(nextSteps("cancelled")).toEqual([]);
  });

  it("shows what was booked and where it is, as rows; records a step with its note", async () => {
    repo.recordConsignmentStep.mockResolvedValue({ orderFinished: false });
    renderBlock(consignment());
    const block = screen.getByTestId("consignment");
    expect(within(block).getByText("Test Courier · Parcel")).toBeInTheDocument();
    expect(within(block).getByText("With the courier")).toBeInTheDocument();
    expect(within(block).getByText("REF123")).toBeInTheDocument();
    expect(within(block).getByRole("link", { name: "Open tracking" })).toHaveAttribute("href", "https://track.example.test/REF123");
    await userEvent.type(within(block).getByLabelText("Note (optional)"), "left at depot");
    await userEvent.click(within(block).getByRole("button", { name: "In transit" }));
    await waitFor(() => expect(repo.recordConsignmentStep).toHaveBeenCalledWith("f1", { kind: "in_transit", note: "left at depot" }));
  });

  it("a refusal is said in words", async () => {
    repo.recordConsignmentStep.mockRejectedValue({ kind: "unknown", status: 409, title: "Refused", code: "invalid_transition" });
    renderBlock(consignment());
    await userEvent.click(screen.getByRole("button", { name: "Delivered" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("Something went wrong");
  });

  it("not booked: says how the parcel will reach the courier", () => {
    renderBlock(null, "supplier");
    expect(screen.getByTestId("consignment")).toHaveTextContent("the supplier sees that a courier pickup is being arranged");
  });
});
