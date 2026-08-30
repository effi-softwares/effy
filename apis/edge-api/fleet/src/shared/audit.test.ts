import { describe, expect, it } from "vitest";

import { auditDetail, REDACTED_FIELDS } from "./audit";

/**
 * FR-050 — a driver's contact details must not reach admin.audit_log.
 *
 * ⚠ WHY THIS MATTERS MORE THAN IT LOOKS. The audit trail is readable by every back-office role that
 * can read any driver, including csa. It is also a table nobody's deletion request knows to look in.
 * Recording "phone changed from X to Y" would put a person's phone number — and their emergency
 * contact's, who never dealt with Effy at all — in a governance table, permanently, as a side effect
 * of an edit. The column's own comment already says "NO PII beyond governance"; this test is what
 * makes that comment true.
 */
describe("audit detail — records that a field changed, never a PII value", () => {
  const FULL_EDIT = {
    name: "Sam Rivers",
    contactPhone: "0400 000 111",
    emergencyContactName: "Alex Rivers",
    emergencyContactPhone: "0400 000 222",
    licenceReference: "VIC-12345678",
    zoneId: "11111111-1111-1111-1111-111111111111",
    vehiclePlate: "ABC123",
    notes: "prefers morning runs",
  };

  it("lists every changed field by name, so the trail is complete", () => {
    const detail = auditDetail(FULL_EDIT);
    expect(detail.changed).toEqual(Object.keys(FULL_EDIT).sort());
  });

  it("omits the VALUE of every redacted field while keeping its name", () => {
    const detail = auditDetail(FULL_EDIT) as { values: Record<string, unknown> };
    for (const field of REDACTED_FIELDS) {
      if (field in FULL_EDIT) {
        expect(detail.values, `${field} must not carry a value`).not.toHaveProperty(field);
      }
    }
  });

  it("keeps non-PII values, so the trail still says what actually changed", () => {
    const detail = auditDetail(FULL_EDIT) as { values: Record<string, unknown> };
    expect(detail.values.name).toBe("Sam Rivers");
    expect(detail.values.zoneId).toBe("11111111-1111-1111-1111-111111111111");
    expect(detail.values.vehiclePlate).toBe("ABC123");
  });

  it("⚠ contains NO PII anywhere in the serialised payload", () => {
    // The property that actually matters: serialise the whole thing the way it reaches the database
    // and look for the values themselves. A future refactor that nests them somewhere new still
    // fails this, where a per-key assertion would not.
    const serialised = JSON.stringify(auditDetail(FULL_EDIT));
    for (const secret of [
      FULL_EDIT.contactPhone,
      FULL_EDIT.emergencyContactName,
      FULL_EDIT.emergencyContactPhone,
      FULL_EDIT.licenceReference,
    ]) {
      expect(serialised, `"${secret}" reached the audit payload`).not.toContain(secret);
    }
  });

  it("never records an OLD value, only the new one", () => {
    // A before/after pair doubles the exposure for no governance gain: the audit trail is a
    // sequence, so the previous row already holds the "before".
    const detail = auditDetail({ name: "New Name" }) as { values: Record<string, unknown> };
    expect(Object.keys(detail.values)).toEqual(["name"]);
    expect(JSON.stringify(detail)).not.toContain("previous");
  });

  it("handles an empty change set without inventing entries", () => {
    expect(auditDetail({})).toEqual({ changed: [], values: {} });
  });
});
