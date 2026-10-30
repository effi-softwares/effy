import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  formatArrival,
  formatDeliveryDay,
  windowStateAt,
  type ArrivalPromise,
  type DeliveryWindow,
  type DeliveryWindowState,
} from "./delivery-window";

/** The fixture is shared with Kotlin: the customer app's arrival formatter and the driver app's window state read it. */
interface Fixture {
  arrival: { name: string; now: string; input: ArrivalPromise; expect: string }[];
  state: { name: string; now: string; expect: DeliveryWindowState }[];
  stateWindow: DeliveryWindow;
}

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./delivery-window.fixtures.json", import.meta.url)), "utf8"),
) as Fixture;

describe("formatArrival", () => {
  it("has cases to run (a fixture that loads empty proves nothing)", () => {
    expect(fixture.arrival.length).toBeGreaterThan(10);
  });

  for (const c of fixture.arrival) {
    it(c.name, () => {
      expect(formatArrival(c.input, new Date(c.now))).toBe(c.expect);
    });
  }

  it("ignores a window with only one end - half a window is not a promise", () => {
    const now = new Date("2026-10-08T09:00:00+11:00");
    expect(
      formatArrival(
        { promisedFrom: "2026-10-08", promisedTo: "2026-10-08", windowStart: "2026-10-08T17:00:00+11:00", windowEnd: null },
        now,
      ),
    ).toBe("Today");
  });
});

describe("windowStateAt", () => {
  for (const c of fixture.state) {
    it(c.name, () => {
      expect(windowStateAt(new Date(c.now), fixture.stateWindow)).toBe(c.expect);
    });
  }
});

describe("formatDeliveryDay", () => {
  it("returns an unparseable value unchanged rather than 'Invalid Date'", () => {
    expect(formatDeliveryDay("not-a-date")).toBe("not-a-date");
  });
});

/**
 * The Kotlin copies: each app embeds this fixture as a string in its tests, so this reads those files
 * and fails, naming the app, if an embedded copy is not this fixture exactly.
 */
describe("the Kotlin copies of the fixture", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const copies = {
    "customer-mobile":
      "apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/checkout/DeliveryWindowFixture.kt",
    "driver-mobile":
      "apps/driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile/features/delivery/DeliveryWindowFixture.kt",
  };

  for (const [app, path] of Object.entries(copies)) {
    it(`${app} embeds this fixture exactly`, () => {
      const kotlin = readFileSync(root + path, "utf8");
      const start = kotlin.indexOf('"""');
      const end = kotlin.lastIndexOf('"""');
      expect(start, "the embedded string was not found").toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      expect(JSON.parse(kotlin.slice(start + 3, end))).toEqual(fixture);
    });
  }
});
