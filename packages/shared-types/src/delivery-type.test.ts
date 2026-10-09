import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  courierLines, DELIVERED_BY_WORDS, DELIVERY_TYPE_WORDS, deliverySummary, type DeliverySummary, type DeliverySummaryInput,
} from "./delivery-type";

const here = dirname(fileURLToPath(import.meta.url));
const apps = resolve(here, "../../../apps");
const CUSTOMER_FIXTURE = resolve(apps, "customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/checkout/DeliveryTypeFixture.kt");
const CUSTOMER_WORDS = resolve(apps, "customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/presentation/DeliveryTypeWords.kt");
const SHOP_WORDS = resolve(apps, "shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/orders/domain/DeliveredByWords.kt");

interface Case { name: string; now: string; input: DeliverySummaryInput; expect: DeliverySummary }
const fixtures = JSON.parse(readFileSync(resolve(here, "delivery-type.fixtures.json"), "utf8")) as {
  words: Record<string, string>; shopWords: Record<string, string>; cases: Case[];
};

const kotlinConstant = (source: string, name: string) =>
  new RegExp(`const val ${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(source)?.[1];

describe("deliverySummary — how an order is delivered, as words (079 P16)", () => {
  it.each(fixtures.cases)("$name", (c) => {
    expect(deliverySummary(c.input, new Date(c.now))).toEqual(c.expect);
  });

  it("the fixture's words are the constants", () => {
    expect(fixtures.words).toEqual(DELIVERY_TYPE_WORDS);
    expect(fixtures.shopWords).toEqual(DELIVERED_BY_WORDS);
  });

  it("a courier order never says same-day, standard, a day or a time", () => {
    for (const c of fixtures.cases.filter((x) => x.input.delivery?.type === "courier")) {
      const said = [c.expect.heading, ...c.expect.lines].join(" ");
      expect(said).not.toMatch(/same-day|standard|today|tomorrow|\b(am|pm)\b|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i);
    }
  });

  it("the estimate is always said as an estimate, never as a date", () => {
    expect(courierLines("2–4 business days")[1]).toMatch(/estimate, not a guaranteed date\.$/);
  });

  it("081 — a move never says why, and says nothing was given by saying nothing", () => {
    for (const c of fixtures.cases.filter((x) => x.input.delivery?.moved)) {
      const said = c.expect.lines.join(" ");
      expect(said).not.toMatch(/reason|because|courier fee|difference|cost/i);
      if (!c.input.delivery?.moved?.compensation) expect(said).not.toMatch(/added|refunded/);
    }
  });

  it("one order is one line however many suppliers filled it", () => {
    const three = fixtures.cases.find((c) => c.name.includes("three suppliers"))!;
    expect(three.input.arrivalEstimates).toHaveLength(3);
    expect(deliverySummary(three.input, new Date(three.now)).lines).toHaveLength(1);
  });
});

describe("the apps are held to the same fixture and the same words (079 P16)", () => {
  it.runIf(existsSync(CUSTOMER_FIXTURE))("the customer app's embedded fixture is this JSON, to the character", () => {
    const kt = readFileSync(CUSTOMER_FIXTURE, "utf8");
    const embedded = kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')).trim();
    expect(JSON.parse(embedded)).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });

  it.runIf(existsSync(CUSTOMER_WORDS))("the customer app's words are these words", () => {
    const kt = readFileSync(CUSTOMER_WORDS, "utf8");
    expect({
      effy: kotlinConstant(kt, "EFFY"),
      courier: kotlinConstant(kt, "COURIER"),
      courierPartner: kotlinConstant(kt, "COURIER_PARTNER"),
      courierEstimatePrefix: kotlinConstant(kt, "COURIER_ESTIMATE_PREFIX"),
      courierEstimateSuffix: kotlinConstant(kt, "COURIER_ESTIMATE_SUFFIX"),
      noWindowsLeft: kotlinConstant(kt, "NO_WINDOWS_LEFT"),
      courierInsteadOfWindows: kotlinConstant(kt, "COURIER_INSTEAD_OF_WINDOWS"),
      trackParcel: kotlinConstant(kt, "TRACK_PARCEL"),
      trackingByEmail: kotlinConstant(kt, "TRACKING_BY_EMAIL"),
      withCourier: kotlinConstant(kt, "WITH_COURIER"),
      sameDay: kotlinConstant(kt, "SAME_DAY"),
      standard: kotlinConstant(kt, "STANDARD"),
      scheduled: kotlinConstant(kt, "SCHEDULED"),
      movedToCourier: kotlinConstant(kt, "MOVED_TO_COURIER"),
      movedToEffy: kotlinConstant(kt, "MOVED_TO_EFFY"),
      compensationPoints: kotlinConstant(kt, "COMPENSATION_POINTS"),
      compensationRefund: kotlinConstant(kt, "COMPENSATION_REFUND"),
    }).toEqual(DELIVERY_TYPE_WORDS);
  });

  it.runIf(existsSync(SHOP_WORDS))("the shop app's two words are these words", () => {
    const kt = readFileSync(SHOP_WORDS, "utf8");
    expect({ effy_driver: kotlinConstant(kt, "EFFY_DRIVER"), courier: kotlinConstant(kt, "COURIER") }).toEqual(DELIVERED_BY_WORDS);
  });
});
