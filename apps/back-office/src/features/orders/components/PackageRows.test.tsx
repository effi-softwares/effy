import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OrderPackage } from "../model";
import { PackageRows } from "./PackageRows";

const pkg: OrderPackage = {
  statusView: null,
  collect: null,
  deliver: null,
  fulfillmentId: "f1",
  packageCode: "7K3Q9M",
  shopId: "s1",
  shopName: "Shop One",
  status: "collected",
  itemCount: 2,
  subtotalAmount: "20.00",
  deliveredBy: "effy",
  consignment: null,
  dueOut: null,
  late: false,
  deliveryMethod: "same_day",
  handoff: null,
  arrival: null,
  promisedDate: null,
  window: null,
  overCapacity: false,
  handoverDueOn: null,
  atRisk: false,
  onTime: null,
};

describe("PackageRows — 089", () => {
  it("shows each package's code, as printed on its label", () => {
    render(
      <PackageRows orderId="o1" packages={[pkg]} canRecord={false} busy={false} onHandoff={() => {}} onArrival={() => {}} />,
    );
    expect(screen.getByLabelText("Package code")).toHaveTextContent("7K3Q9M");
  });

  it("091 — lists recorded hand-overs, and nothing when none were recorded", () => {
    const { unmount } = render(
      <PackageRows
        orderId="o1"
        packages={[{ ...pkg, handovers: [{ step: "collect", method: "scan", at: "2026-10-16T01:00:00.000Z", driverName: "Ada" }] }]}
        canRecord={false} busy={false} onHandoff={() => {}} onArrival={() => {}}
      />,
    );
    expect(screen.getByLabelText("Hand-overs")).toHaveTextContent("Collected · scanned · Ada");
    unmount();
    render(<PackageRows orderId="o1" packages={[pkg]} canRecord={false} busy={false} onHandoff={() => {}} onArrival={() => {}} />);
    expect(screen.queryByLabelText("Hand-overs")).toBeNull();
  });
});

describe("PackageRows — 096 bags", () => {
  const bags = {
    ...pkg,
    parcels: [
      { parcelId: "b1", code: "7K3Q9M", seq: 1, of: 2, zone: "ambient" as const, voided: false, printedCount: 1, custody: "with_driver" as const, handovers: [] },
      { parcelId: "b2", code: "WTMZHX", seq: 2, of: 2, zone: "frozen" as const, voided: false, printedCount: 2, custody: "packed" as const, handovers: [] },
      { parcelId: "b3", code: "R8PWX2", seq: 3, of: 2, zone: "ambient" as const, voided: true, printedCount: 1, custody: "at_shop" as const, handovers: [] },
    ],
    handovers: [
      { step: "pack" as const, method: "scan" as const, at: "2026-10-22T01:00:00Z", driverName: null, actor: "shop_staff" as const, parcelCode: "WTMZHX" },
      { step: "checkin" as const, method: "typed" as const, at: "2026-10-22T03:00:00Z", driverName: null, actor: "admin_staff" as const, parcelCode: "7K3Q9M" },
    ],
  };

  it("lists each bag with its label and where it is; a removed bag is struck through; staff are said by role", () => {
    render(<PackageRows orderId="o1" packages={[bags]} canRecord={false} busy={false} onHandoff={() => {}} onArrival={() => {}} />);
    const table = screen.getByRole("table", { name: "Bags" });
    expect(table).toHaveTextContent("1 of 2");
    expect(table).toHaveTextContent("Printed 2×");
    expect(table).toHaveTextContent("With driver");
    expect(table).toHaveTextContent("Removed");
    expect(screen.getByText("Packed at the shop")).toBeInTheDocument();
    expect(screen.getAllByText(/Shop staff/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hub staff/).length).toBeGreaterThan(0);
  });

  it("highlights the bag a scan opened the order for", () => {
    render(
      <PackageRows orderId="o1" packages={[bags]} canRecord={false} busy={false} onHandoff={() => {}} onArrival={() => {}} highlight={{ parcelId: "b2" }} />,
    );
    expect(document.getElementById("parcel-b2")).toHaveAttribute("aria-current", "true");
    expect(document.getElementById("package-f1")).toHaveAttribute("data-highlighted", "true");
  });
});
