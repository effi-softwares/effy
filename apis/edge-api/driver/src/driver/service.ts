// A valid driver-pool token is necessary but not sufficient: the record must exist and be active.

import { CUSTODY_BY_DRIVER, query } from "@effy/edge-shared";
import type { DriverMeDTO, DutyResponse } from "@effy/shared-types";

import * as repo from "./repository";
import { DriverAccessError, type DriverRecord } from "./types";

const HUB_LABEL = "Effy Hub";

/**
 * Absent → not_provisioned; anything but `active` → not_active. Names the permitted state, so a new
 * status refuses by default.
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
    zone: record.coverageLabel,
    hub: HUB_LABEL,
    vehicle: { type: record.vehicleType, plate: record.vehiclePlate },
    dutyStatus: record.dutyStatus,
    vehicleCheck: { state: record.vehicleCheck ?? "none", vehicleLabel: record.vehicleLabel ?? null },
  };
}

/** Carries the items, not a count, so the driver can go and find them. */
export class HoldingPackagesError extends Error {
  constructor(readonly held: HeldPackage[]) {
    super("driver is still holding packages");
    this.name = "HoldingPackagesError";
  }
}

export interface HeldPackage {
  packageId: string;
  orderNumber: string;
  shopName: string;
}

export async function setDuty(
  record: DriverRecord,
  onDuty: boolean,
  expectedEndAt?: string | null,
  acknowledgeHeld = false,
): Promise<DutyResponse> {
  if (onDuty) {
    // Absent or malformed is null, meaning unknown; never an assumed shift length.
    const expected = normaliseExpectedEnd(expectedEndAt);
    await repo.goOnDuty(record.id, expected);
    const fresh = await repo.findBySubject(record.subject);
    return {
      dutyStatus: "on_duty",
      since: fresh?.onDutySince ?? null,
      expectedEndAt: fresh?.expectedEndAt ?? null,
    };
  }
  // A shift may not end silently with goods in the van: the driver must confirm. Picked-up work is
  // never reclaimed by a sweep, so unspoken it would sit in a parked van.
  if (!acknowledgeHeld) {
    const held = await query<{ package_id: string; order_number: string; shop_name: string }>(
      CUSTODY_BY_DRIVER,
      [record.id],
    );
    if (held.rows.length > 0) {
      throw new HoldingPackagesError(
        held.rows.map((r) => ({
          packageId: r.package_id,
          orderNumber: r.order_number,
          shopName: r.shop_name,
        })),
      );
    }
  }

  await repo.goOffDuty(record.id);
  return { dutyStatus: "off_duty", since: null, expectedEndAt: null };
}

/** ISO 8601 or null; never throws, so an optional field cannot block going on duty. */
function normaliseExpectedEnd(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
