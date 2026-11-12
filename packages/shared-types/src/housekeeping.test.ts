import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { abandonWords, ABANDON_LIMITS, HOUSEKEEPING_JOB_KEYS, HOUSEKEEPING_JOBS, runWords } from "./housekeeping";

const here = dirname(fileURLToPath(import.meta.url));
const migrations = resolve(here, "../../../db/migrations");

/** The Up section of the newest migration that mentions `needle`. */
function upDefining(needle: string): string {
  const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort().reverse();
  for (const file of files) {
    const up = readFileSync(resolve(migrations, file), "utf8").split(/--\s*\+goose Down/)[0] ?? "";
    if (up.includes(needle)) return up;
  }
  throw new Error(`no migration defines ${needle}`);
}

describe("113 - clean-ups, declared once", () => {
  it("the job keys are the migration's job CHECK, in order", () => {
    const up = upDefining("housekeeping_run_job_check");
    const m = /housekeeping_run_job_check\s+CHECK\s*\(job = ANY \(ARRAY\[([^\]]*)\]/.exec(up);
    expect([...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).toEqual([...HOUSEKEEPING_JOB_KEYS]);
    expect(HOUSEKEEPING_JOBS.map((j) => j.job)).toEqual([...HOUSEKEEPING_JOB_KEYS]);
  });

  it("the abandon limits are the settings CHECK and default", () => {
    const up = upDefining("housekeeping_settings_abandon_check");
    expect(up).toContain(`abandon_after_min BETWEEN ${ABANDON_LIMITS.min} AND ${ABANDON_LIMITS.max}`);
    expect(up).toContain(`abandon_after_min integer DEFAULT ${ABANDON_LIMITS.default} NOT NULL`);
  });

  it("a job is late only after a missed run or more", () => {
    for (const j of HOUSEKEEPING_JOBS) expect(j.staleAfterMinutes).toBeGreaterThan(j.everyMinutes);
  });

  it("says a run in words, leaving zeros out", () => {
    expect(runWords("unpaid_orders", { closed: 14, stillPaying: 1, paidLate: 0 })).toBe(
      "Closed 14 unpaid orders · 1 still being paid",
    );
    expect(runWords("account_erasure", { erased: 1, pointsForfeited: 1200 })).toBe(
      "Erased 1 account · 1,200 points forfeited",
    );
    expect(runWords("phone_registrations", { removed: 0 })).toBe("Nothing to do");
  });

  it("says the abandon time in the largest whole unit", () => {
    expect(abandonWords(1440)).toBe("24 hours");
    expect(abandonWords(10080)).toBe("7 days");
    expect(abandonWords(2880)).toBe("2 days");
    expect(abandonWords(720)).toBe("12 hours");
    expect(abandonWords(60)).toBe("1 hour");
    expect(abandonWords(90)).toBe("90 minutes");
  });
});
