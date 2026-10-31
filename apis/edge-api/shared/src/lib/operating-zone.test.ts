import { afterEach, describe, expect, it, vi } from "vitest";

/** Colombo is the case Melbourne cannot catch: its offset is not a whole number of hours, and it has no DST. */
async function colombo() {
  vi.resetModules();
  vi.stubEnv("OPERATING_TZ", "Asia/Colombo");
  const zone = await import("./collection-deadline");
  const { melbourneDate } = await import("../delivery/schedule");
  const { OPERATING_CITY } = await import("@effy/shared-types");
  return { ...zone, melbourneDate, OPERATING_CITY };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the operating zone", () => {
  it("is Melbourne when nothing sets it", async () => {
    vi.resetModules();
    vi.stubEnv("OPERATING_TZ", "");
    const { OPERATING_TZ, OPERATING_CITY } = await import("@effy/shared-types");
    expect(OPERATING_TZ).toBe("Australia/Melbourne");
    expect(OPERATING_CITY).toBe("Melbourne");
  });

  it("names the city it was given", async () => {
    expect((await colombo()).OPERATING_CITY).toBe("Colombo");
  });

  it("keeps the half hour in Colombo's offset", async () => {
    const { zoneOffsetMinutes, operatingStamp } = await colombo();
    const at = new Date("2026-10-31T10:00:00Z");
    expect(zoneOffsetMinutes(at)).toBe(330);
    expect(operatingStamp(at)).toBe("2026-10-31T15:30:00+05:30");
  });

  it("builds a wall-clock instant on the half hour", async () => {
    const { instantAtLocalTime } = await colombo();
    expect(instantAtLocalTime(2026, 10, 31, 9, 0).toISOString()).toBe("2026-10-31T03:30:00.000Z");
  });

  it("turns the day over at Colombo's midnight, not UTC's", async () => {
    const { melbourneDate } = await colombo();
    expect(melbourneDate(new Date("2026-10-31T18:29:59Z"))).toBe("2026-10-31");
    expect(melbourneDate(new Date("2026-10-31T18:30:00Z"))).toBe("2026-11-01");
  });
});
