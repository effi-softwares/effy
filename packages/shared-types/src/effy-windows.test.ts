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

describe("effyWindowsView - the delivery-window picker, as words", () => {
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

describe("085 - a day with no time, and as soon as possible", () => {
  const c = cases.find((x) => x.name.startsWith("085"))!;
  const view = effyWindowsView(c.input, new Date(c.now));

  it("⚠ today is never offered without a time, even if the quote carries one", () => {
    expect(c.input.days[0]!.anyTime).toBeTruthy();
    expect(view.today!.anyTime).toBeNull();
  });

  it("a day whose windows are all taken can still be chosen without a time - and the reverse", () => {
    const [, saturday, monday] = view.later;
    expect(saturday!.windows).toHaveLength(0);
    expect(saturday!.anyTime).toEqual({ slotId: "anytime", date: "2026-10-10" });
    expect(monday!.windows.length).toBeGreaterThan(0);
    expect(monday!.anyTime).toBeNull();
  });

  it("the any-time window is never listed among a day's windows", () => {
    for (const d of view.later) expect(d.windows.map((w) => w.slotId)).not.toContain("anytime");
  });

  it("as soon as possible carries the estimate and no day", () => {
    expect(view.asap).toEqual({ title: DELIVERY_WINDOW_WORDS.asapTitle, hint: DELIVERY_WINDOW_WORDS.asapHint, estimate: "usually within 2–3 days" });
    expect(JSON.stringify(view.asap)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("a quote from before 085 shows neither", () => {
    const old = effyWindowsView(cases[0]!.input, new Date(cases[0]!.now));
    expect(old.asap).toBeNull();
    for (const d of old.later) expect(d.anyTime).toBeNull();
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
      anyTimeDay: value("ANY_TIME_DAY"),
      timeOptionOpen: value("TIME_OPTION_OPEN"),
      timeOptionHint: value("TIME_OPTION_HINT"),
      timeRequired: value("TIME_REQUIRED"),
      asapTitle: value("ASAP_TITLE"),
      asapHint: value("ASAP_HINT"),
      asapEstimatePrefix: value("ASAP_ESTIMATE_PREFIX"),
    }).toEqual(DELIVERY_WINDOW_WORDS);
  });
});
