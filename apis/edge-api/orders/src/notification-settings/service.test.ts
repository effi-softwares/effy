import { describe, expect, it } from "vitest";

import { NotificationSettingsInvalid, parseNotificationSettings } from "./service";

describe("promotion limits (111 FR-020)", () => {
  const bad = (body: Record<string, unknown> | null) => {
    try {
      parseNotificationSettings(body);
      return null;
    } catch (e) {
      return e instanceof NotificationSettingsInvalid ? e.message : "other";
    }
  };

  it("accepts whole numbers in range with the week at least the day, including 0 and 0", () => {
    expect(parseNotificationSettings({ promoPushPerDay: 2, promoPushPerWeek: 5 })).toEqual({ promoPushPerDay: 2, promoPushPerWeek: 5 });
    expect(parseNotificationSettings({ promoPushPerDay: 0, promoPushPerWeek: 0 })).toEqual({ promoPushPerDay: 0, promoPushPerWeek: 0 });
  });

  it("refuses a week below the day, a negative, a fraction, out of range, unknown fields and nothing", () => {
    expect(bad({ promoPushPerDay: 2, promoPushPerWeek: 1 })).toMatch(/can't be lower/);
    expect(bad({ promoPushPerDay: -1, promoPushPerWeek: 3 })).toMatch(/daily/);
    expect(bad({ promoPushPerDay: 1.5, promoPushPerWeek: 3 })).toMatch(/daily/);
    expect(bad({ promoPushPerDay: 1, promoPushPerWeek: 101 })).toMatch(/weekly/);
    expect(bad({ promoPushPerDay: 1, promoPushPerWeek: 3, quietHours: 2 })).toMatch(/not a notification setting/);
    expect(bad({ promoPushPerDay: 1 })).toMatch(/weekly/);
    expect(bad(null)).toMatch(/required/);
  });
});
