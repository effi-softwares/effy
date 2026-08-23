// Driver identity + duty use-cases (049). The access decision lives here: a valid driver-pool token
// is necessary but NOT sufficient — the platform record must exist and be active (Principle IV).

import type { DriverMeDTO, DutyResponse } from "@effy/shared-types";

import * as repo from "./repository";
import { DriverAccessError, type DriverRecord } from "./types";

const HUB_LABEL = "Effy Hub"; // single central hub (v1); 047 delivery_settings has no name column.

/**
 * Resolve the authenticated driver, refusing when the record is absent or disabled.
 * - absent  → not_provisioned (drivers are back-office-provisioned; no JIT create — research I2)
 * - disabled → disabled (record is authoritative; a valid token never overrides it)
 */
export async function requireDriver(sub: string): Promise<DriverRecord> {
  const record = await repo.findBySubject(sub);
  if (!record) throw new DriverAccessError("not_provisioned");
  if (record.status === "disabled") throw new DriverAccessError("disabled");
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
export async function setDuty(record: DriverRecord, onDuty: boolean): Promise<DutyResponse> {
  if (onDuty) {
    await repo.goOnDuty(record.id);
    const fresh = await repo.findBySubject(record.subject);
    return { dutyStatus: "on_duty", since: fresh?.onDutySince ?? null };
  }
  await repo.goOffDuty(record.id);
  return { dutyStatus: "off_duty", since: null };
}

export async function recordLocation(record: DriverRecord, lat: number, lng: number): Promise<void> {
  await repo.recordLocation(record.id, lat, lng);
}
