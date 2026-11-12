import { describe, expect, it } from "vitest";

import { isMessageError } from "../errors";
import { nextRunFor, parseAutomation, triggerChanged } from "./service";

/** 115 US3/US4 - an automatic message from the wire: the message's rules, then a trigger or a repeat (contracts/routes.md). */
const winBack = {
  name: "Win back after 30 days",
  kind: "offer",
  audience: "customer",
  filter: {},
  destination: { kind: "home" },
  title: "We miss you",
  body: "Hi {first name}, here's 10% off your next Effy order.",
  pictureKey: null,
  push: true,
  email: true,
  nameFallback: "there",
  mode: "trigger",
  trigger: { kind: "not_ordered_days", value: 30 },
  repeat: null,
};

const weekly = {
  ...winBack,
  name: "Friday hub notice",
  kind: "announcement",
  audience: "driver",
  filter: {},
  destination: { kind: "today" },
  title: "Friday at the hub",
  body: "The hub closes at 6 on Fridays.",
  email: false,
  mode: "repeat",
  trigger: null,
  repeat: { every: "week", days: [5], date: null, time: "09:00", startsOn: "2026-11-13", endsOn: null },
};

function refusedField(body: unknown, field: string, code = "invalid_automation"): void {
  try {
    parseAutomation(body);
  } catch (err) {
    expect(isMessageError(err), String(err)).toBe(true);
    expect((err as { code: string }).code).toBe(code);
    if (code === "invalid_automation") expect((err as { extra: { errors: { field: string }[] } }).extra.errors[0]!.field).toBe(field);
    return;
  }
  throw new Error("expected a refusal");
}

describe("115 - parseAutomation", () => {
  it("accepts a win-back trigger and a weekly repeat", () => {
    expect(parseAutomation(winBack)).toMatchObject({ mode: "trigger", triggerKind: "not_ordered_days", triggerValue: 30, repeatEvery: null });
    expect(parseAutomation(weekly)).toMatchObject({ mode: "repeat", repeatEvery: "week", repeatDays: [5], repeatTime: "09:00", triggerKind: null });
  });

  it("a trigger is for offers and news to customers only (FR-014, FR-021)", () => {
    refusedField({ ...winBack, kind: "important" }, "trigger");
    refusedField({ ...winBack, audience: "driver", destination: { kind: "today" }, kind: "announcement", email: false }, "trigger");
  });

  it("a trigger's number is in range", () => {
    refusedField({ ...winBack, trigger: { kind: "not_ordered_days", value: 3 } }, "trigger.value");
    refusedField({ ...winBack, trigger: { kind: "cart_left_hours", value: 100 } }, "trigger.value");
    expect(parseAutomation({ ...winBack, trigger: { kind: "cart_left_hours", value: 4 } })).toMatchObject({ triggerKind: "cart_left_hours", triggerValue: 4 });
  });

  it("the title never holds the first name", () => {
    refusedField({ ...winBack, title: "Hi {first name}" }, "title");
  });

  it("an automatic offer must say it's from Effy", () => {
    refusedField({ ...winBack, title: "We miss you", body: "10% off" }, "", "message_must_name_effy");
  });

  it("a weekly repeat needs a day; a monthly one a date 1–28; the end is not before the start", () => {
    refusedField({ ...weekly, repeat: { ...weekly.repeat, days: [] } }, "repeat.days");
    refusedField({ ...weekly, repeat: { ...weekly.repeat, every: "month", date: 31 } }, "repeat.date");
    refusedField({ ...weekly, repeat: { ...weekly.repeat, endsOn: "2026-11-01" } }, "repeat.endsOn");
    refusedField({ ...weekly, repeat: { ...weekly.repeat, time: "9am" } }, "repeat.time");
    refusedField({ ...weekly, repeat: { ...weekly.repeat, startsOn: "2026-02-30" } }, "repeat.startsOn");
  });

  it("a direct message is never automatic; unknown fields are refused", () => {
    refusedField({ ...winBack, kind: "direct" }, "kind");
    refusedField({ ...winBack, extra: 1 }, "extra");
  });
});

describe("115 - nextRunFor (Effy's clock, Melbourne)", () => {
  const now = new Date("2026-11-12T03:00:00Z"); // Thu 14:00 Melbourne (AEDT, +11)
  it("a daily trigger looks next at 07:00 tomorrow; an hourly one at the next hour", () => {
    expect(nextRunFor(parseAutomation(winBack), now)!.toISOString()).toBe("2026-11-12T20:00:00.000Z");
    expect(nextRunFor(parseAutomation({ ...winBack, trigger: { kind: "cart_left_hours", value: 4 } }), now)!.toISOString()).toBe("2026-11-12T04:00:00.000Z");
  });
  it("a Friday 09:00 repeat runs next Friday morning", () => {
    expect(nextRunFor(parseAutomation(weekly), now)!.toISOString()).toBe("2026-11-12T22:00:00.000Z");
  });
});

describe("115 - a changed trigger never sends to a backlog (L7)", () => {
  it("changing the number or kind resets activated_at; changing the words does not", () => {
    const before = parseAutomation(winBack);
    expect(triggerChanged(before, parseAutomation({ ...winBack, trigger: { kind: "not_ordered_days", value: 14 } }))).toBe(true);
    expect(triggerChanged(before, parseAutomation({ ...winBack, trigger: { kind: "cart_left_hours", value: 4 } }))).toBe(true);
    expect(triggerChanged(before, parseAutomation({ ...winBack, title: "Come back to Effy" }))).toBe(false);
  });
});
