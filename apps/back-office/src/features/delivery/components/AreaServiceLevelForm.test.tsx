import type { AreaDTO } from "@effy/shared-types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AreaServiceLevelForm } from "./AreaServiceLevelForm";

const area = (over: Partial<AreaDTO> = {}): AreaDTO => ({
  zoneId: "z1",
  zoneCode: "REGIONAL",
  postcode: "3350",
  places: [{ name: "Alfredton", state: "VIC" }],
  state: "unconfigured",
  decision: null,
  serviceLevels: [
    { method: "standard", enabled: false, feeAmount: null, leadDaysMin: null, leadDaysMax: null, sameDayCutoff: null },
    { method: "scheduled", enabled: false, feeAmount: null, leadDaysMin: null, leadDaysMax: null, sameDayCutoff: null },
    { method: "same_day", enabled: false, feeAmount: null, leadDaysMin: null, leadDaysMax: null, sameDayCutoff: null },
  ],
  siblingPostcodes: [],
  shops: [],
  ...over,
});

const MELBOURNE_SHOP = { shopName: "Melbourne", postcode: "3000", inZone: false };
const BALLARAT_SHOP = { shopName: "Ballarat", postcode: "3350", inZone: true };

describe("AreaServiceLevelForm", () => {
  /**
   * ⚠ THE ZONE-WIDE DISCLOSURE — FR-006's problem one level up.
   *
   * `delivery_offering` is keyed on ZONE, so setting a fee for Ballarat sets it for Bendigo too. An
   * admin who is not told believes they made a narrow decision when they made a broad one — the same
   * failure as choosing a suburb and enabling twenty.
   */
  it("says how many other areas this change also affects", () => {
    render(
      <AreaServiceLevelForm
        area={area()}
        siblingCount={1}
        shops={[]}
        saving={false}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByTestId("zone-wide-notice")).toHaveTextContent(
      /apply to all 2 areas in REGIONAL/i,
    );
  });

  it("says nothing about siblings when the zone has only this area", () => {
    render(
      <AreaServiceLevelForm area={area()} siblingCount={0} shops={[]} saving={false} onSave={vi.fn()} />,
    );

    expect(screen.queryByTestId("zone-wide-notice")).not.toBeInTheDocument();
  });

  /**
   * ⚠ SAME-DAY IS A PROMISE, NOT A PRICE.
   *
   * A fee is a business choice the platform can absorb. Same-day is a physical claim about time —
   * only true if a shop holding the goods can reach that area today. So the shops are SHOWN, and the
   * admin owns the decision. Never a computed radius: the platform has no routing capability, and
   * invented precision on a promise is worse than an honest human judgement.
   */
  it("shows which shops are in the zone when same-day is enabled", async () => {
    const user = userEvent.setup();
    render(
      <AreaServiceLevelForm
        area={area()}
        siblingCount={0}
        shops={[BALLARAT_SHOP, MELBOURNE_SHOP]}
        saving={false}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("toggle-same_day"));

    expect(screen.getByTestId("same-day-feasibility")).toHaveTextContent(/1 shop in this zone/i);
    expect(screen.getByTestId("same-day-feasibility")).toHaveTextContent(/Ballarat/);
  });

  /** ⚠ With no shop nearby the admin must acknowledge — and Save stays disabled until they do. */
  it("requires an acknowledgement when no shop is in the zone", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <AreaServiceLevelForm
        area={area()}
        siblingCount={0}
        shops={[MELBOURNE_SHOP]}
        saving={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByTestId("toggle-same_day"));
    expect(screen.getByTestId("same-day-feasibility")).toHaveTextContent(/No shop is in this zone/i);

    const save = screen.getByRole("button", { name: /^save$/i });
    expect(save).toBeDisabled();

    await user.click(screen.getByTestId("ack-no-nearby-shop"));
    expect(save).toBeEnabled();
  });

  /**
   * ⚠ A shop with no location is a DATA GAP the admin should see, not one the interface conceals.
   * `shop.postcode` is nullable, and such a shop resolves to no zone.
   */
  it("surfaces a shop whose location has never been set", async () => {
    const user = userEvent.setup();
    render(
      <AreaServiceLevelForm
        area={area()}
        siblingCount={0}
        shops={[{ shopName: "Warehouse", postcode: null, inZone: false }]}
        saving={false}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("toggle-same_day"));
    expect(screen.getByTestId("same-day-feasibility")).toHaveTextContent(/location not set/i);
  });

  /** Standard delivery is not a timing promise, so it carries no feasibility gate. */
  it("does not gate standard delivery on shop proximity", async () => {
    const user = userEvent.setup();
    render(
      <AreaServiceLevelForm area={area()} siblingCount={0} shops={[]} saving={false} onSave={vi.fn()} />,
    );

    await user.click(screen.getByTestId("toggle-standard"));

    expect(screen.queryByTestId("same-day-feasibility")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
  });

  /** ⚠ FR-029: exactly the platform's three methods — no more, no fewer. */
  it("offers every delivery method the platform has, and no others", () => {
    render(
      <AreaServiceLevelForm area={area()} siblingCount={0} shops={[]} saving={false} onSave={vi.fn()} />,
    );

    expect(screen.getByTestId("toggle-standard")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-scheduled")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-same_day")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /offered/i })).toHaveLength(3);
  });
});
