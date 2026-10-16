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
