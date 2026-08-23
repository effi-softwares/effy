// Back-office driver management use-cases (049). Provisioning is one coherent, idempotent operation:
// Cognito-first (ensureDriverUser) → the platform record upsert keyed on the returned sub (006/009).
import type {
  AdminDriverCreateRequest,
  AdminDriverRow,
  AdminDriverUpdateRequest,
} from "@effy/shared-types";

import { disableDriverUser, ensureDriverUser, enableDriverUser } from "./cognito";
import * as repo from "./repository";

export class DriverAdminError extends Error {
  constructor(
    readonly kind: "validation" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "DriverAdminError";
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function listDrivers(): Promise<AdminDriverRow[]> {
  return repo.listDrivers();
}

export async function getDriver(id: string): Promise<AdminDriverRow> {
  const row = await repo.getDriver(id);
  if (!row) throw new DriverAdminError("not_found", "driver not found");
  return row;
}

export async function createDriver(input: AdminDriverCreateRequest): Promise<AdminDriverRow> {
  const name = input.name?.trim();
  const email = input.workEmail?.trim().toLowerCase();
  if (!name) throw new DriverAdminError("validation", "name is required");
  if (!email || !EMAIL_RE.test(email)) throw new DriverAdminError("validation", "a valid work email is required");

  const sub = await ensureDriverUser(email, name);
  const id = await repo.upsertDriver({
    sub,
    name,
    workEmail: email,
    zoneId: input.zoneId ?? null,
    vehicleType: input.vehicleType ?? null,
    vehiclePlate: input.vehiclePlate ?? null,
  });
  return getDriver(id);
}

export async function updateDriver(id: string, patch: AdminDriverUpdateRequest): Promise<AdminDriverRow> {
  await getDriver(id); // 404 if absent
  await repo.updateDriver(id, {
    name: patch.name?.trim(),
    zoneId: patch.zoneId,
    vehicleType: patch.vehicleType,
    vehiclePlate: patch.vehiclePlate,
  });
  return getDriver(id);
}

export async function setStatus(id: string, status: "active" | "disabled"): Promise<AdminDriverRow> {
  const email = await repo.setStatus(id, status);
  if (!email) throw new DriverAdminError("not_found", "driver not found");
  // Defense in depth: mirror the record status onto the identity account (a disabled driver cannot
  // obtain a session even before the record check runs).
  if (status === "disabled") await disableDriverUser(email);
  else await enableDriverUser(email);
  return getDriver(id);
}
