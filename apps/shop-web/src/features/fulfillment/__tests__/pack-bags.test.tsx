import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopOrderDetailDTO, ShopParcelLabelDTO } from "@effy/shared-types";

import { orderDetail } from "./fixtures";

const declareParcels = vi.hoisted(() => vi.fn());
const voidParcel = vi.hoisted(() => vi.fn());
const recordParcelPrints = vi.hoisted(() => vi.fn());
const packScanParcels = vi.hoisted(() => vi.fn());
vi.mock("../repo", () => ({ declareParcels, voidParcel, recordParcelPrints, packScanParcels }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));
vi.mock("@effy/design-system/ui", async (original) => ({ ...(await original<Record<string, unknown>>()), toast }));

const printBrowser = vi.hoisted(() => vi.fn());
vi.mock("../labels/print", () => ({ printBrowser, printDocument: vi.fn() }));

import { PackBags } from "../components/PackBags";

const bag = (seq: number, over: Partial<ShopParcelLabelDTO> = {}): ShopParcelLabelDTO => ({
  parcelId: `p-${seq}`,
  code: ["7K3Q9M", "WTMZHX", "R8PWX2"][seq - 1]!,
  seq,
  of: 3,
  zone: "ambient",
  printed: { count: 0, firstAt: null, lastAt: null, current: false },
  packScanned: null,
  custody: "at_shop",
  ...over,
});

function detail(over: Partial<ShopOrderDetailDTO> = {}): ShopOrderDetailDTO {
  return { ...orderDetail(), parcels: [bag(1), bag(2), bag(3, { zone: "frozen" })], zonesNeeded: ["frozen"], ...over } as ShopOrderDetailDTO;
}

function show(d: ShopOrderDetailDTO) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PackBags detail={d} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // storage refused: the component works without it
  }
});
afterEach(() => vi.clearAllMocks());

describe("Bags & labels (096)", () => {
  it("counts bags per zone, marks a zone the lines need, and refuses to save without it", async () => {
    show(detail());
    expect(screen.getByText("Frozen · needed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "One less frozen bag" }));
    expect(screen.getByText("This order needs at least one frozen bag.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save 2 bags$/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "One more frozen bag" }));
    await userEvent.click(screen.getByRole("button", { name: "One more ambient bag" }));
    declareParcels.mockResolvedValue(detail());
    await userEvent.click(screen.getByRole("button", { name: /^Save 4 bags$/ }));
    expect(declareParcels).toHaveBeenCalledWith(orderDetail().id, { ambient: 3, chilled: 0, frozen: 1 });
  });

  it("shows a refusal in our own words", async () => {
    show(detail());
    declareParcels.mockRejectedValue({ kind: "conflict", status: 409, title: "Conflict", type: "https://effyshopping.com/problems/parcels_with_driver", detail: "server prose" });
    await userEvent.click(screen.getByRole("button", { name: "One more ambient bag" }));
    await userEvent.click(screen.getByRole("button", { name: /^Save 4 bags$/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("These bags have already left the shop, so they can't be changed."));
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("server prose"));
  });

  it("offers Remove on any bag but bag 1 before printing; on the last bag only once anything is printed", async () => {
    const { unmount } = show(detail());
    const rows = () => screen.getAllByRole("row").slice(1);
    expect(within(rows()[0]!).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(rows()[1]!).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    unmount();
    const printed = { count: 1, firstAt: "2026-10-21T08:00:00Z", lastAt: "2026-10-21T08:00:00Z", current: true };
    show(detail({ parcels: [bag(1, { printed }), bag(2, { printed }), bag(3, { printed, zone: "frozen" })] }));
    expect(within(rows()[1]!).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(rows()[2]!).getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("records a print only after the labels were sent", async () => {
    printBrowser.mockReturnValue(3);
    recordParcelPrints.mockResolvedValue({ recorded: 3 });
    show(detail());
    await userEvent.click(screen.getByRole("button", { name: "Print all 3 labels" }));
    await waitFor(() => expect(recordParcelPrints).toHaveBeenCalledTimes(1));
    expect(printBrowser.mock.invocationCallOrder[0]!).toBeLessThan(recordParcelPrints.mock.invocationCallOrder[0]!);
    expect(recordParcelPrints.mock.calls[0]![0]).toMatchObject({ parcelIds: ["p-1", "p-2", "p-3"], layout: "a6", path: "browser" });
    // Each label is its own page of the print.
    expect(printBrowser.mock.calls[0]![0]).toHaveLength(3);
  });

  it("a blocked print window records nothing and says why (FR-018)", async () => {
    printBrowser.mockReturnValue(0);
    show(detail());
    await userEvent.click(screen.getByRole("button", { name: "Print all 3 labels" }));
    expect(await screen.findByText(/blocked the print window/)).toBeInTheDocument();
    expect(recordParcelPrints).not.toHaveBeenCalled();
  });

  it("prints only the labels that need it once some are printed", async () => {
    const printed = { count: 1, firstAt: "2026-10-21T08:00:00Z", lastAt: "2026-10-21T08:00:00Z", current: true };
    printBrowser.mockReturnValue(1);
    recordParcelPrints.mockResolvedValue({ recorded: 1 });
    show(detail({ parcels: [bag(1, { printed }), bag(2, { printed }), bag(3, { zone: "frozen" })] }));
    await userEvent.click(screen.getByRole("button", { name: "Print 1 new label" }));
    await waitFor(() => expect(recordParcelPrints).toHaveBeenCalled());
    expect(recordParcelPrints.mock.calls[0]![0].parcelIds).toEqual(["p-3"]);
  });

  it("pack-scans a typed code with the shared rule's outcome, and says it in the rule's words", async () => {
    packScanParcels.mockResolvedValue(detail());
    show(detail());
    await userEvent.type(screen.getByRole("textbox", { name: "Scan or type a code" }), "wtm zhx");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Bag 2 of 3")).toBeInTheDocument();
    await waitFor(() => expect(packScanParcels).toHaveBeenCalled());
    expect(packScanParcels.mock.calls[0]![1]).toEqual([
      expect.objectContaining({ raw: "wtm zhx", method: "typed", outcome: "accepted", parcelCode: "WTMZHX" }),
    ]);
  });

  it("a label from another order is refused on screen and still reported", async () => {
    packScanParcels.mockResolvedValue(detail());
    show(detail());
    await userEvent.type(screen.getByRole("textbox", { name: "Scan or type a code" }), "EFY1:22222X");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Not expected here")).toBeInTheDocument();
    await waitFor(() => expect(packScanParcels.mock.calls[0]![1][0]).toMatchObject({ outcome: "not_on_this_work" }));
  });
});
