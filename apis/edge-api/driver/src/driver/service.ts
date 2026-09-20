// Driver identity + duty use-cases (049). The access decision lives here: a valid driver-pool token
// is necessary but NOT sufficient — the platform record must exist and be active (Principle IV).

import type { DriverMeDTO, DutyResponse } from "@effy/shared-types";

import * as repo from "./repository";
import { DriverAccessError, type DriverRecord } from "./types";

const HUB_LABEL = "Effy Hub"; // single central hub (v1); 047 delivery_settings has no name column.

/**
 * Resolve the authenticated driver, refusing when the record is absent or not active.
 * - absent      → not_provisioned (drivers are back-office-provisioned; no JIT create — research I2)
 * - not active  → not_active (record is authoritative; a valid token never overrides it)
 *
 * ⚠ CORRECTED BY 056, AND THIS WAS A REAL DEFECT, NOT A TIDY-UP. This read
 * `if (record.status === "disabled")` — a NEGATIVE test against a two-value enum. The moment 056
 * widened that enum to three values, a **suspended** driver satisfied the condition's negation and
 * was handed a working session: stood down in the console, still able to sign in and be assigned
 * work. Nothing would have failed; the console would have said "suspended" while the app let them
 * work.
 *
 * This is the 055 lesson recurring on the very next slice: 053's account-closure blocker was
 * `<> 'delivered'`, two new terminal states walked through it, and it held a customer for seven days
 * over a package nobody was carrying. A negative test against an enum that can widen is a latent
 * defect with a timer on it. The rule is to name the permitted state, not the forbidden ones — so
 * adding a fourth status later refuses by default instead of admitting by default.
 */
export async function requireDriver(sub: string): Promise<DriverRecord> {
  const record = await repo.findBySubject(sub);
  if (!record) throw new DriverAccessError("not_provisioned");
  if (record.status !== "active") throw new DriverAccessError("not_active");
  return record;
}

export function toMeDTO(record: DriverRecord): DriverMeDTO {
  return {
    id: record.id,
    name: record.name,
    workEmail: record.workEmail,
    zone: record.zoneName,
    hub: HUB_LABEL,
    vehicle: { type: record.vehicleType, plate: record.vehiclePlate },
    dutyStatus: record.dutyStatus,
  };
}

/** Go on/off duty; returns the resulting duty status. */
export async function setDuty(
  record: DriverRecord,
  onDuty: boolean,
  expectedEndAt?: string | null,
): Promise<DutyResponse> {
  if (onDuty) {
    // ⚠ An absent or malformed value is stored as NULL, which MEANS UNKNOWN (FR-033). It is never
    // replaced with an assumed shift length: a guess that looks like a fact is worse than a gap,
    // because the dispatch slice will decide someone's workload from it.
    const expected = normaliseExpectedEnd(expectedEndAt);
    await repo.goOnDuty(record.id, expected);
    const fresh = await repo.findBySubject(record.subject);
    return {
      dutyStatus: "on_duty",
      since: fresh?.onDutySince ?? null,
      expectedEndAt: fresh?.expectedEndAt ?? null,
    };
  }
  await repo.goOffDuty(record.id);
  return { dutyStatus: "off_duty", since: null, expectedEndAt: null };
}

/** ISO 8601 or nothing. ⚠ An unparseable value becomes NULL rather than throwing — a driver must
 *  never be prevented from going on duty by an optional convenience field. */
function normaliseExpectedEnd(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
// ⚠ `recordLocation` STOOD HERE AND IS GONE (061, FR-035/FR-036). Effy does not track driver
// position. It was a receiver with no sender — no caller in the mobile app, no location permission
// declared on either platform — and dormant surface is how this platform accumulates defects.
