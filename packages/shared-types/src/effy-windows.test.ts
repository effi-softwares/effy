import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DELIVERY_WINDOW_WORDS, type EffyWindowsDTO } from "./delivery";
import { effyWindowsView, type EffyWindowsView } from "./effy-windows";

const here = dirname(fileURLToPath(import.meta.url));
const MOBILE = resolve(
  here,
  "../../../apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/checkout/EffyWindowsFixture.kt",
);
const WORDS = resolve(
  here,
  "../../../apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/presentation/DeliveryWindowWords.kt",
);

const fixtures = JSON.parse(readFileSync(resolve(here, "effy-windows.fixtures.json"), "utf8")) as { cases: unknown[] };

interface Case { name: string; now: string; input: EffyWindowsDTO; expect: EffyWindowsView }
const cases = fixtures.cases as unknown as Case[];

describe("effyWindowsView — the delivery-window picker, as words", () => {
  it.each(cases)("$name", (c) => {
    expect(effyWindowsView(c.input, new Date(c.now))).toEqual(c.expect);
  });

  it("covers every sentence a day can show, and the one for no day at all", () => {
    const said = new Set(cases.flatMap((c) => [c.expect.unavailable, c.expect.today?.sentence, ...c.expect.later.map((d) => d.sentence)]));
    for (const s of [DELIVERY_WINDOW_WORDS.todayClosed, DELIVERY_WINDOW_WORDS.todayNotDeliveryDay, DELIVERY_WINDOW_WORDS.dayFull, DELIVERY_WINDOW_WORDS.noWindows]) {
      expect(said, s).toContain(s);
    }
  });
});

describe("the customer app is held to the same fixture and the same words (P17, P18)", () => {
  it("its embedded fixture is this JSON, to the character", () => {
    const kt = readFileSync(MOBILE, "utf8");
    const embedded = kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')).trim();
    expect(JSON.parse(embedded)).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });

  it("its words are these words", () => {
    const kt = readFileSync(WORDS, "utf8");
    const value = (name: string) => new RegExp(`const val ${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(kt)?.[1];
    expect({
      sectionSameDay: value("SECTION_SAME_DAY"),
      sectionStandard: value("SECTION_STANDARD"),
      todayClosed: value("TODAY_CLOSED"),
      todayNotDeliveryDay: value("TODAY_NOT_DELIVERY_DAY"),
      dayFull: value("DAY_FULL"),
      noWindows: value("NO_WINDOWS"),
      cutoffPrefix: value("CUTOFF_PREFIX"),
    }).toEqual(DELIVERY_WINDOW_WORDS);
  });
});
