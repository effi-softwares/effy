import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourierReachDTO, CourierServiceDTO, CoverageListDTO, CoveragePlaceResultDTO } from "@effy/shared-types";

const repo = vi.hoisted(() => ({
  listCoverage: vi.fn(),
  searchCoveragePlaces: vi.fn(),
  checkCoverage: vi.fn(),
  addCoveragePostcodes: vi.fn(),
  patchCoveragePostcodes: vi.fn(),
  removeCoveragePostcode: vi.fn(),
  createCoverageGroup: vi.fn(),
  renameCoverageGroup: vi.fn(),
  removeCoverageGroup: vi.fn(),
  updateCourier: vi.fn(),
  addCourierExclusion: vi.fn(),
  removeCourierExclusion: vi.fn(),
  listCourierServices: vi.fn(),
  createCourierService: vi.fn(),
  updateCourierService: vi.fn(),
}));
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), ...repo }));

const { CoveragePanel } = await import("./CoveragePanel");

const courier = (over: Partial<CourierReachDTO> = {}): CourierReachDTO => ({
  offered: false, whenNoWindows: false, collectionDefault: "hub", defaultService: null,
  blockedBy: [], pending: false, canBeOffered: true, exclusions: [], ...over,
});

const service = (over: Partial<CourierServiceDTO> = {}): CourierServiceDTO => ({
  id: "s1", courierName: "Test Courier", serviceName: "Parcel", estimateText: "2–4 business days", maxBusinessDays: 5,
  pickupWeekdays: [1, 2, 3, 4, 5], pickupCutoff: "14:00", collectsFromSupplier: true, status: "active", isDefault: true, ...over,
});
const ready = courier({ defaultService: { id: "s1", label: "Test Courier · Parcel", estimateText: "2–4 business days" } });

const list = (over: Partial<CoverageListDTO> = {}): CoverageListDTO => ({
  postcodes: [
    { postcode: "3121", places: ["RICHMOND", "BURNLEY", "CREMORNE"], state: "VIC", groupId: "g1", distanceKm: "3.40", distanceSource: "computed", needsReview: false },
    { postcode: "3900", places: ["BOX ONLY"], state: "VIC", groupId: null, distanceKm: "18.50", distanceSource: "manual", needsReview: true },
  ],
  groups: [{ id: "g1", name: "Inner East", postcodeCount: 1, driverCount: 2 }],
  ungrouped: { postcodeCount: 1, driverCount: 0 },
  courier: courier({
    blockedBy: ["no_fee_table", "no_service"],
    exclusions: [{ postcode: "7255", places: ["FLINDERS ISLAND"], reason: "No chilled courier service" }],
  }),
  counts: { listed: 2, manualDistance: 1, needsReview: 1 },
  ...over,
});

const place = (over: Partial<CoveragePlaceResultDTO> = {}): CoveragePlaceResultDTO => ({
  postcode: "3141", state: "VIC", matched: "SOUTH YARRA", places: ["SOUTH YARRA"], listed: false, computedDistanceKm: "3.10", ...over,
});

/** A refusal as `@effy/api-client` throws it: a plain object, NOT an Error (053's lesson). */
const refusal = (status: number, code: string) => ({ kind: "unknown", status, title: "Refused", code });

function renderPanel(canManage = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<CoveragePanel canManage={canManage} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.listCoverage.mockResolvedValue(list());
  repo.listCourierServices.mockResolvedValue({ items: [], collectionDefault: "hub" });
});

describe("Coverage — the list of postcodes Effy delivers to (076)", () => {
  it("shows each postcode with its places, group, distance and how the distance was obtained", async () => {
    renderPanel();
    const row = (await screen.findByText("3121")).closest("tr")!;
    expect(within(row).getByText(/RICHMOND, BURNLEY, CREMORNE/)).toBeInTheDocument();
    expect(within(row).getByText("Inner East")).toBeInTheDocument();
    expect(within(row).getByText("3.40 km")).toBeInTheDocument();
    expect(within(row).getByText("worked out")).toBeInTheDocument();

    const manual = screen.getByText("3900").closest("tr")!;
    expect(within(manual).getByText("No group")).toBeInTheDocument();
    expect(within(manual).getByText("entered by hand")).toBeInTheDocument();
    expect(within(manual).getByText("Review")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-counts")).toHaveTextContent("2 postcodes listed · 1 with a distance entered by hand · 1 to review");
  });

  it("⚠ has no control for distance tiers, same-day zones or a shop's same-day exception (FR-030)", async () => {
    renderPanel();
    await screen.findByText("3121");
    expect(screen.queryByText(/ring/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/same-day/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/zone/i)).not.toBeInTheDocument();
  });

  it("a customer-service agent reads everything and can change nothing (FR-026)", async () => {
    renderPanel(false);
    await screen.findByText("3121");
    for (const name of [/add places/i, /^remove$/i, /^distance$/i, /add group/i, /^rename$/i, /^exclude$/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /offer courier delivery/i })).toBeDisabled();
    // The checker is for everyone.
    expect(screen.getByRole("button", { name: /^check$/i })).toBeInTheDocument();
  });

  it("filters ask the service, not the page", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("3121");
    await user.selectOptions(screen.getByLabelText("Group"), "none");
    await waitFor(() => expect(repo.listCoverage).toHaveBeenLastCalledWith(expect.objectContaining({ group: "none" }), undefined));
    await user.selectOptions(screen.getByLabelText("Distance"), "review");
    await waitFor(() => expect(repo.listCoverage).toHaveBeenLastCalledWith(expect.objectContaining({ review: true }), undefined));
    await user.type(screen.getByLabelText("Find in the list"), "rich");
    await user.click(screen.getByRole("button", { name: "Find" }));
    await waitFor(() => expect(repo.listCoverage).toHaveBeenLastCalledWith(expect.objectContaining({ q: "rich" }), undefined));
  });

  it("removing a postcode says what stops and that placed orders are not affected", async () => {
    const user = userEvent.setup();
    repo.removeCoveragePostcode.mockResolvedValue(undefined);
    renderPanel();
    const row = (await screen.findByText("3121")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("RICHMOND, BURNLEY, CREMORNE will no longer be Delivered by Effy");
    expect(dialog).toHaveTextContent("Orders already placed there are not affected");
    await user.click(within(dialog).getByRole("button", { name: /remove from the list/i }));
    await waitFor(() => expect(repo.removeCoveragePostcode).toHaveBeenCalledWith("3121"));
  });

  it("moving postcodes to nowhere a driver reaches asks first, then goes ahead when told to", async () => {
    const user = userEvent.setup();
    repo.patchCoveragePostcodes.mockRejectedValueOnce(refusal(409, "no_driver_covers")).mockResolvedValueOnce(undefined);
    renderPanel();
    await screen.findByText("3121");
    await user.click(screen.getByRole("checkbox", { name: "Select 3121" }));
    await user.selectOptions(screen.getByLabelText("Move to group"), "none");
    await user.click(screen.getByRole("button", { name: "Move" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("no driver is cleared to deliver everywhere");
    expect(repo.patchCoveragePostcodes).toHaveBeenLastCalledWith({ postcodes: ["3121"], groupId: null });
    await user.click(within(dialog).getByRole("button", { name: /move anyway/i }));
    await waitFor(() => expect(repo.patchCoveragePostcodes).toHaveBeenLastCalledWith({ postcodes: ["3121"], groupId: null, confirmNoDrivers: true }));
  });
});

describe("Coverage — adding places by name", () => {
  it("tells same-named places apart, shows what each brings, and adds without a postcode or distance typed", async () => {
    const user = userEvent.setup();
    repo.searchCoveragePlaces.mockResolvedValue({ results: [
      place({ postcode: "2753", state: "NSW", matched: "RICHMOND", places: ["RICHMOND", "HOBARTVILLE"], computedDistanceKm: "712.80" }),
      place({ postcode: "3121", state: "VIC", matched: "RICHMOND", places: ["RICHMOND", "BURNLEY"], listed: true }),
    ] });
    repo.addCoveragePostcodes.mockResolvedValue({ added: ["2753"], alreadyListed: [] });
    renderPanel();
    await user.click(await screen.findByRole("button", { name: /add places/i }));
    await user.type(screen.getByLabelText("Place or postcode"), "richmond");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const results = await screen.findByTestId("add-results");
    expect(results).toHaveTextContent("NSW");
    expect(results).toHaveTextContent("Also brings HOBARTVILLE");
    expect(results).toHaveTextContent("712.80 km from the hub");
    // Already on the list: shown, and cannot be picked again.
    expect(within(results).getByRole("checkbox", { name: /RICHMOND VIC 3121/ })).toBeDisabled();

    await user.click(within(results).getByRole("checkbox", { name: /RICHMOND NSW 2753/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 postcode" }));
    await waitFor(() => expect(repo.addCoveragePostcodes).toHaveBeenCalledWith({ postcodes: [{ postcode: "2753", manualDistanceKm: null }], groupId: null }));
  });

  it("a place with no known location needs a distance from a person before it can be added", async () => {
    const user = userEvent.setup();
    repo.searchCoveragePlaces.mockResolvedValue({ results: [place({ postcode: "3901", matched: "NEW ESTATE", places: ["NEW ESTATE"], computedDistanceKm: null })] });
    repo.addCoveragePostcodes.mockResolvedValue({ added: ["3901"], alreadyListed: [] });
    renderPanel();
    await user.click(await screen.findByRole("button", { name: /add places/i }));
    await user.type(screen.getByLabelText("Place or postcode"), "new");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("checkbox", { name: /NEW ESTATE VIC 3901/ }));

    expect(screen.getByRole("button", { name: "Add 1 postcode" })).toBeDisabled();
    await user.type(screen.getByLabelText("Distance from the hub (km)"), "42.5");
    await user.click(screen.getByRole("button", { name: "Add 1 postcode" }));
    await waitFor(() => expect(repo.addCoveragePostcodes).toHaveBeenCalledWith({ postcodes: [{ postcode: "3901", manualDistanceKm: "42.5" }], groupId: null }));
  });

  it("⚠ adding where no driver can deliver is a question, not an error — and 'Add anyway' says so to the service", async () => {
    const user = userEvent.setup();
    repo.searchCoveragePlaces.mockResolvedValue({ results: [place()] });
    repo.addCoveragePostcodes.mockRejectedValueOnce(refusal(409, "no_driver_covers")).mockResolvedValueOnce({ added: ["3141"], alreadyListed: [] });
    renderPanel();
    await user.click(await screen.findByRole("button", { name: /add places/i }));
    await user.type(screen.getByLabelText("Place or postcode"), "south");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("checkbox", { name: /SOUTH YARRA VIC 3141/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 postcode" }));

    expect(await screen.findByTestId("add-no-drivers")).toHaveTextContent("no driver is cleared to deliver everywhere");
    await user.click(screen.getByRole("button", { name: "Add anyway" }));
    await waitFor(() => expect(repo.addCoveragePostcodes).toHaveBeenLastCalledWith({ postcodes: [{ postcode: "3141", manualDistanceKm: null }], groupId: null, confirmNoDrivers: true }));
  });
});

describe("Coverage — the checker, groups and courier reach", () => {
  it("the checker says who delivers and why, in words a person can repeat", async () => {
    const user = userEvent.setup();
    repo.checkCoverage.mockResolvedValue({ matches: [
      { postcode: "3121", places: ["RICHMOND", "BURNLEY"], state: "VIC", coverage: "effy", reason: "listed", groupName: "Inner East", distanceKm: "3.40", distanceSource: "computed", exclusionReason: null },
      { postcode: "7255", places: ["FLINDERS ISLAND"], state: "TAS", coverage: "none", reason: "courier_excluded", groupName: null, distanceKm: null, distanceSource: null, exclusionReason: "No chilled courier service" },
      { postcode: "9999", places: [], state: null, coverage: "none", reason: "unknown_postcode", groupName: null, distanceKm: null, distanceSource: null, exclusionReason: null },
    ] });
    renderPanel();
    await user.type(await screen.findByLabelText("Check a postcode or place"), "richmond");
    await user.click(screen.getByRole("button", { name: /^check$/i }));
    const items = within(await screen.findByTestId("check-results")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Delivered by Effy");
    expect(items[0]).toHaveTextContent("On Effy's list. Group: Inner East. 3.40 km from the hub (worked out).");
    expect(items[1]).toHaveTextContent("Cannot deliver");
    expect(items[1]).toHaveTextContent("excluded from courier delivery. Reason: No chilled courier service.");
    expect(items[2]).toHaveTextContent("Not a known postcode.");
  });

  it("each group shows how many drivers can deliver there, and ungrouped postcodes with none are flagged", async () => {
    renderPanel();
    const groups = await screen.findByTestId("coverage-groups-list");
    expect(groups).toHaveTextContent("Inner East");
    expect(groups).toHaveTextContent("2 drivers can deliver here");
    expect(screen.getByTestId("coverage-ungrouped")).toHaveTextContent("No driver can deliver here (those cleared for everywhere)");
  });

  it("removing a group says its postcodes stay listed", async () => {
    const user = userEvent.setup();
    repo.removeCoverageGroup.mockResolvedValue({ ungrouped: 1 });
    renderPanel();
    const groups = await screen.findByTestId("coverage-groups-list");
    await user.click(within(groups).getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("stay on the list, in no group, and are still Delivered by Effy");
    await user.click(within(dialog).getByRole("button", { name: "Remove group" }));
    await waitFor(() => expect(repo.removeCoverageGroup).toHaveBeenCalledWith("g1", false));
  });

  it("⚠ courier delivery cannot be switched on without a price and a default service, and the screen says which; exclusions are listed", async () => {
    renderPanel();
    expect(await screen.findByRole("switch", { name: /offer courier delivery/i })).toBeDisabled();
    expect(screen.getByTestId("courier-locked")).toHaveTextContent("Make a courier fee table active on the Pricing tab.");
    expect(screen.getByTestId("courier-locked")).toHaveTextContent("Add a courier service below and make it the default.");
    expect(screen.getByTestId("courier-exclusions")).toHaveTextContent("7255");
    expect(screen.getByTestId("courier-exclusions")).toHaveTextContent("No chilled courier service");
    // 080 — nothing is seeded: the list starts empty and says why it matters.
    expect(await screen.findByTestId("courier-services-empty")).toHaveTextContent("can't be switched on until there is a default");
  });

  it("080 — the customer's words are the default service's timeframe, as a whole sentence; 079's free-text field is gone", async () => {
    repo.listCoverage.mockResolvedValue(list({ courier: ready }));
    renderPanel();
    expect(await screen.findByTestId("courier-estimate-preview")).toHaveTextContent(
      "Usually arrives in 2–4 business days — an estimate, not a guaranteed date.",
    );
    expect(screen.getByTestId("courier-estimate-preview")).toHaveTextContent("Test Courier · Parcel, the default service");
    expect(screen.queryByLabelText("How long a courier usually takes")).not.toBeInTheDocument();
  });

  it("080 — how parcels reach the courier is a platform default, changed in one click", async () => {
    repo.updateCourier.mockResolvedValue({ offered: false, whenNoWindows: false, collectionDefault: "supplier" });
    renderPanel();
    const hub = await screen.findByRole("radio", { name: "Via the hub" });
    expect(hub).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Pickup from the supplier" }));
    await waitFor(() => expect(repo.updateCourier).toHaveBeenCalledWith({ collectionDefault: "supplier" }));
  });

  it("079 — ready: the switch works, and on means offered", async () => {
    repo.listCoverage.mockResolvedValue(list({ courier: ready }));
    repo.updateCourier.mockResolvedValue({ offered: true, whenNoWindows: false });
    const { unmount } = renderPanel();
    const sw = await screen.findByRole("switch", { name: /offer courier delivery/i });
    expect(sw).toBeEnabled();
    expect(screen.queryByTestId("courier-locked")).not.toBeInTheDocument();
    await userEvent.click(sw);
    await waitFor(() => expect(repo.updateCourier).toHaveBeenCalledWith({ offered: true }));
    unmount();

    // ⚠ 083 — on is offered: there is no "starts with the new delivery model" notice any more.
    repo.listCoverage.mockResolvedValue(list({ courier: { ...ready, offered: true } }));
    renderPanel();
    await screen.findByRole("switch", { name: "Offer courier delivery" });
    expect(screen.queryByTestId("courier-pending")).not.toBeInTheDocument();
    expect(screen.queryByText(/starts with the new delivery model/)).not.toBeInTheDocument();
  });

  it("079 — the no-window fallback is its own switch, and a refusal is said in words", async () => {
    repo.updateCourier.mockRejectedValueOnce(refusal(409, "courier_service_missing")).mockResolvedValue({ offered: false, whenNoWindows: true });
    renderPanel();
    const sw = await screen.findByRole("switch", { name: /offer courier when no delivery window is available/i });
    await userEvent.click(sw);
    expect(await screen.findByRole("alert")).toHaveTextContent("Add a courier service and make it the default before switching courier delivery on.");
    await userEvent.click(sw);
    await waitFor(() => expect(repo.updateCourier).toHaveBeenLastCalledWith({ whenNoWindows: true }));
  });

  it("080 — courier services: listed with the customer's words and pickups; the first added becomes the default; a refusal names the field", async () => {
    repo.listCourierServices.mockResolvedValue({ items: [service(), service({ id: "s2", serviceName: "Express", isDefault: false, collectsFromSupplier: false, pickupWeekdays: [1, 3, 5] })], collectionDefault: "hub" });
    repo.updateCourierService.mockResolvedValue(service({ id: "s2", isDefault: true }));
    renderPanel();
    const table = await screen.findByTestId("courier-services");
    const first = within(table).getByText(/Test Courier · Parcel/).closest("tr")!;
    expect(within(first).getByText("Default")).toBeInTheDocument();
    expect(within(first).getByText("Mon, Tue, Wed, Thu, Fri, by 14:00")).toBeInTheDocument();
    // ⚠ The default cannot be retired from under checkout — the button is not there.
    expect(within(first).queryByRole("button", { name: "Retire" })).not.toBeInTheDocument();
    const second = within(table).getByText(/Express/).closest("tr")!;
    expect(within(second).getByText("Mon, Wed, Fri, by 14:00")).toBeInTheDocument();
    await userEvent.click(within(second).getByRole("button", { name: "Make default" }));
    await waitFor(() => expect(repo.updateCourierService).toHaveBeenCalledWith("s2", { isDefault: true }));
  });

  it("080 — adding the first service makes it the default; field refusals are shown beside the field", async () => {
    repo.createCourierService
      .mockRejectedValueOnce({ kind: "unknown", status: 422, title: "Refused", code: "invalid_service", fields: [{ field: "estimateText", message: "x" }] })
      .mockResolvedValue(service());
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Add a courier service" }));
    const form = screen.getByRole("form", { name: "New courier service" });
    await userEvent.type(within(form).getByLabelText("Courier"), "Test Courier");
    await userEvent.type(within(form).getByLabelText("Service"), "Parcel");
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    expect(await within(form).findByText("3 to 60 characters on one line, like \"2–4 business days\".")).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText("Customers are told it usually arrives in"), "2–4 business days");
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(repo.createCourierService).toHaveBeenLastCalledWith(expect.objectContaining({
      courierName: "Test Courier", serviceName: "Parcel", estimateText: "2–4 business days", isDefault: true,
    })));
  });
});
