import { describe, expect, it } from "vitest";

import { AudienceInvalid, countSql, parseAudience } from "./audience";

/** 115 T027: one automatic run's people is a filter the worker writes; staff can never send it. */
describe("115 - the automationRun audience", () => {
  const RUN = "00000000-0000-4000-8000-000000000000";

  it("the shared parser refuses it, so no route (count, create, edit) accepts it", () => {
    expect(() => parseAudience("customer", { automationRun: RUN })).toThrow(AudienceInvalid);
    expect(() => parseAudience("customer", { orderedWithinDays: 30, automationRun: RUN })).toThrow(AudienceInvalid);
  });

  it("the worker's filter selects that run's recipients, beside the automation's own filter", () => {
    const q = countSql("customer", { postcodes: ["3000"], automationRun: RUN }, "offers");
    expect(q.text).toMatch(/message_automation_recipient ar WHERE ar\.run_id = \$\d+::uuid AND ar\.customer_id = c\.id/);
    expect(q.text).toMatch(/customer_address a WHERE a\.customer_id = c\.id AND a\.postal_code/);
    expect(q.values).toContain(RUN);
  });
});
