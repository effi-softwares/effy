import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrderPackage } from "../model"
import { PackageRows } from "./PackageRows"

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
  milestones: [],
}

describe("PackageRows - 089", () => {
  it("shows each package's code, as printed on its label", () => {
    render(
      <PackageRows
        orderId="o1"
        packages={[pkg]}
        canRecord={false}
        busy={false}
        onHandoff={() => {}}
        onArrival={() => {}}
      />,
    )
    expect(screen.getByLabelText("Package code")).toHaveTextContent("7K3Q9M")
  })
})

describe("PackageRows - where the goods are", () => {
  const taken = {
    assignmentId: "a1",
    driver: { id: "d1", name: "Sam Rivera" },
    opensAt: null,
    dueAt: null,
    roundId: "r1",
    how: null,
    unassignedReason: null,
    movable: false,
  }
  const at = (status: "with_driver" | "at_hub" | "out_for_delivery" | "delivered", deliver: typeof taken | null) =>
    render(
      <PackageRows
        orderId="o1"
        packages={[
          {
            ...pkg,
            statusView: { status, word: status, detail: null, driverName: null },
            collect: taken,
            deliver,
          },
        ]}
        canRecord={false}
        busy={false}
        onHandoff={() => {}}
        onArrival={() => {}}
      />,
    )

  it("says the collecting driver has it while it is with them", () => {
    at("with_driver", null)
    expect(screen.getByText("In their van")).toBeInTheDocument()
  })

  it("does not say so once it is checked in at the hub, though the collection cannot be moved", () => {
    at("at_hub", null)
    expect(screen.queryByText("In their van")).toBeNull()
  })

  it("says so once, on the delivering driver, while it is out for delivery", () => {
    at("out_for_delivery", taken)
    expect(screen.getAllByText("In their van")).toHaveLength(1)
    expect(screen.getByText("Delivers")).toBeInTheDocument()
    expect(screen.getByText("In their van").closest(".rounded-lg")).toHaveTextContent("Delivers")
  })

  it("does not say so once it is delivered", () => {
    at("delivered", taken)
    expect(screen.queryByText("In their van")).toBeNull()
  })
})

describe("PackageRows - 096 bags", () => {
  const bags = {
    ...pkg,
    parcels: [
      {
        parcelId: "b1",
        code: "7K3Q9M",
        seq: 1,
        of: 2,
        zone: "ambient" as const,
        voided: false,
        printedCount: 1,
        custody: "with_driver" as const,
      },
      {
        parcelId: "b2",
        code: "WTMZHX",
        seq: 2,
        of: 2,
        zone: "frozen" as const,
        voided: false,
        printedCount: 2,
        custody: "packed" as const,
      },
      {
        parcelId: "b3",
        code: "R8PWX2",
        seq: 3,
        of: 2,
        zone: "ambient" as const,
        voided: true,
        printedCount: 1,
        custody: "at_shop" as const,
      },
    ],
  }

  it("lists each bag with its label and where it is; a removed bag is struck through", () => {
    render(
      <PackageRows
        orderId="o1"
        packages={[bags]}
        canRecord={false}
        busy={false}
        onHandoff={() => {}}
        onArrival={() => {}}
      />,
    )
    const table = screen.getByRole("list", { name: "Bags" })
    expect(table).toHaveTextContent("1 of 2")
    expect(table).toHaveTextContent("printed 2×")
    expect(table).toHaveTextContent("With driver")
    expect(table).toHaveTextContent("Removed")
    // Each bag's hand-overs are in the order's activity (104), not under the package.
    expect(screen.queryByText("Packed at the shop")).toBeNull()
  })

  it("highlights the bag a scan opened the order for", () => {
    render(
      <PackageRows
        orderId="o1"
        packages={[bags]}
        canRecord={false}
        busy={false}
        onHandoff={() => {}}
        onArrival={() => {}}
        highlight={{ parcelId: "b2" }}
      />,
    )
    expect(document.getElementById("parcel-b2")).toHaveAttribute("aria-current", "true")
    expect(document.getElementById("package-f1")).toHaveAttribute("data-highlighted", "true")
  })
})
