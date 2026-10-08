import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CoverageListDTO, CoveragePlaceResultDTO } from "@effy/shared-types";

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
  setCourierOffered: vi.fn(),
  addCourierExclusion: vi.fn(),
  removeCourierExclusion: vi.fn(),
}));
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), ...repo }));

const { CoveragePanel } = await import("./CoveragePanel");

const list = (over: Partial<CoverageListDTO> = {}): CoverageListDTO => ({
  postcodes: [
    { postcode: "3121", places: ["RICHMOND", "BURNLEY", "CREMORNE"], state: "VIC", groupId: "g1", distanceKm: "3.40", distanceSource: "computed", needsReview: false },
    { postcode: "3900", places: ["BOX ONLY"], state: "VIC", groupId: null, distanceKm: "18.50", distanceSource: "manual", needsReview: true },
  ],
  groups: [{ id: "g1", name: "Inner East", postcodeCount: 1, driverCount: 2 }],
  ungrouped: { postcodeCount: 1, driverCount: 0 },
  courier: { offered: false, canBeOffered: false, exclusions: [{ postcode: "7255", places: ["FLINDERS ISLAND"], reason: "No chilled courier service" }] },
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

  it("⚠ courier delivery cannot be switched on yet, and the screen says why; exclusions are listed", async () => {
    renderPanel();
    expect(await screen.findByRole("switch", { name: /offer courier delivery/i })).toBeDisabled();
    expect(screen.getByTestId("courier-locked")).toHaveTextContent("once customers can place courier orders");
    expect(screen.getByTestId("courier-exclusions")).toHaveTextContent("7255");
    expect(screen.getByTestId("courier-exclusions")).toHaveTextContent("No chilled courier service");
  });
});
