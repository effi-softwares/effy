// Provisioning is Cognito first, then the record (Cognito issues the `sub`). The two cannot be atomic,
// so a Cognito account with no record is possible: `accountState` shows it and
// `fleet.driver_provision_failed` alarms on it.
import type {
  AdminDriverCreateRequest,
  AdminDriverListResponse,
  AdminDriverProfile,
  AdminDriverUpdateRequest,
  DriverAccountState,
  DriverEmploymentStatus,
} from "@effy/shared-types";
import type { FieldError, RequestScope } from "@effy/edge-shared";
import { offsetListPage } from "@effy/edge-shared";

import { auditDetail, recordAudit } from "../shared/audit";
import { conflict, notFound, validationError } from "../shared/errors";
import {
  createDriverUser,
  disableDriverUser,
  DriverUserExistsError,
  enableDriverUser,
  lookupDriverUser,
} from "./cognito";
import { heldByDriver } from "../holdings/repository";
import type { DriverListRequest } from "./list";
import * as repo from "./repository";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DATE_FIELDS = [
  "licenceExpiresOn",
  "vehicleRegistrationExpiresOn",
  "startedOn",
] as const;

/** Field errors, at most one per field, so a refusal names what is wrong. `nameRequired` on create only. */
function validateProfileFields(
  patch: Record<string, unknown>,
  nameRequired = false,
): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of DATE_FIELDS) {
    const v = patch[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" || !ISO_DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
      errors.push({ field, message: "must be a date in YYYY-MM-DD form" });
    }
  }
  if (nameRequired || "name" in patch) {
    const n = patch.name;
    if (typeof n !== "string" || n.trim() === "") {
      errors.push({ field: "name", message: "a driver's name is required" });
    }
  }
  return errors;
}

/** Trims, and an empty string becomes null. */
function normalise(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string") {
      const t = v.trim();
      out[k] = t === "" ? null : t;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function listDrivers(req: DriverListRequest): Promise<AdminDriverListResponse> {
  const r = await repo.listDrivers(req);
  return offsetListPage(r.items, req, r);
}

export const driverViewCounts = (req: DriverListRequest) => repo.driverViewCounts(req);

/** The identity lookup is best-effort: Cognito being down still renders the profile (logged). */
export async function getDriver(id: string, scope?: RequestScope): Promise<AdminDriverProfile> {
  const row = await repo.getDriver(id);
  if (!row) throw notFound("driver not found");

  let accountState: DriverAccountState = "ok";
  try {
    const identity = await lookupDriverUser(row.workEmail);
    if (!identity) accountState = "record_only";
  } catch (err) {
    scope?.log.warn(
      { err: err instanceof Error ? err.message : String(err), driverId: id },
      "fleet: identity lookup failed; account state unverified",
    );
  }
  return { ...row, accountState };
}

/** A work email already in use is refused, naming the existing driver, so a re-hire is a conscious choice. */
export async function createDriver(
  input: AdminDriverCreateRequest,
  actorSub: string,
  scope: RequestScope,
): Promise<AdminDriverProfile> {
  const patch = normalise(input as unknown as Record<string, unknown>);
  const name = typeof patch.name === "string" ? patch.name : "";
  const email = typeof patch.workEmail === "string" ? patch.workEmail.toLowerCase() : "";

  const errors: FieldError[] = validateProfileFields(patch, true);
  if (!email || !EMAIL_RE.test(email)) {
    errors.push({ field: "workEmail", message: "a valid work email is required" });
  }
  if (errors.length > 0) throw validationError("the driver could not be created", errors);

  // The record check first: cheap, guaranteed by the citext unique, and it can name the driver.
  const existing = await repo.findByWorkEmail(email);
  if (existing) {
    throw conflict(
      `${existing.name} already uses this work email (currently ${existing.status})`,
      [{ field: "workEmail", message: `already in use by driver ${existing.id}` }],
    );
  }

  let sub: string;
  try {
    sub = await createDriverUser(email, name);
  } catch (err) {
    if (err instanceof DriverUserExistsError) {
      // A sign-in account with no record: refused, never adopted.
      throw conflict(
        "a sign-in account already exists for this work email but no driver record does; " +
          "resolve the orphaned account before creating this driver",
        [{ field: "workEmail", message: "an unlinked sign-in account already uses this address" }],
      );
    }
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), stage: "identity" },
      "fleet.driver_provision_failed",
    );
    throw err;
  }

  let id: string;
  try {
    delete patch.workEmail;
    id = await repo.insertDriver({ sub, name, workEmail: email, profile: patch });
  } catch (err) {
    // Identity exists, record does not: logged at the exact string the alarm's metric filter selects.
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), stage: "record", sub },
      "fleet.driver_provision_failed",
    );
    throw err;
  }

  await recordAudit({
    actorSub,
    action: "driver.created",
    driverId: id,
    detail: auditDetail(patch),
  });
  return getDriver(id, scope);
}

/** Under optimistic concurrency. */
export async function updateDriver(
  id: string,
  input: AdminDriverUpdateRequest,
  actorSub: string,
  scope: RequestScope,
): Promise<AdminDriverProfile> {
  const raw = input as unknown as Record<string, unknown>;
  const expected = typeof raw.updatedAt === "string" ? raw.updatedAt : "";
  if (!expected) {
    throw validationError("the driver could not be updated", [
      { field: "updatedAt", message: "the version the form was loaded with is required" },
    ]);
  }

  const patch = normalise(raw);
  delete patch.updatedAt;
  // Refused, not ignored: the sign-in address cannot be changed here.
  if ("workEmail" in patch) {
    throw validationError("the driver could not be updated", [
      { field: "workEmail", message: "a work email cannot be changed; it is the sign-in identity" },
    ]);
  }

  const errors = validateProfileFields(patch);
  if (errors.length > 0) throw validationError("the driver could not be updated", errors);

  const outcome = await repo.updateDriver(id, patch, expected);
  if (outcome === "not_found") throw notFound("driver not found");
  if (outcome === "stale") {
    throw conflict(
      "this driver was changed by someone else while you were editing; reload and reapply your change",
    );
  }

  await recordAudit({
    actorSub,
    action: "driver.updated",
    driverId: id,
    detail: auditDetail(patch),
  });
  return getDriver(id, scope);
}

export interface StatusOutcome {
  profile: AdminDriverProfile;
}

export async function setStatus(
  id: string,
  status: DriverEmploymentStatus,
  reason: string,
  actorSub: string,
  scope: RequestScope,
): Promise<StatusOutcome> {
  const trimmedReason = reason?.trim() ?? "";
  if (!trimmedReason) {
    throw validationError("the status could not be changed", [
      { field: "reason", message: "a reason is required, and is recorded against the driver" },
    ]);
  }

  const current = await repo.getDriver(id);
  if (!current) throw notFound("driver not found");

  /**
   * Standing a driver down while they hold a vehicle is refused, naming the vehicle: otherwise it
   * vanishes from every list while still out. Recording its return stays an explicit human act.
   */
  if (current.status === "active" && status !== "active") {
    const held = await heldByDriver(id);
    if (held) {
      throw conflict(
        `${current.name} still has ${held.registrationPlate} (${held.make} ${held.model}). ` +
          `Record its return before standing them down — otherwise nothing at Effy knows who has it.`,
        [
          {
            field: "vehicle",
            message: `${held.registrationPlate} has been out since ${held.since.slice(0, 10)}`,
          },
        ],
      );
    }
  }

  const email = await repo.setStatus(id, status, trimmedReason, async (tx, driverId) => {
    await recordAudit(
      {
        actorSub,
        action: "driver.status_changed",
        driverId,
        // The reason is recorded; the field list stays free of the PII columns.
        detail: { changed: ["status"], values: { status, reason: trimmedReason } },
      },
      tx,
    );
  });
  if (!email) throw notFound("driver not found");

  // After the record write: the record is authoritative, so an identity failure is logged, not rolled back.
  try {
    if (status === "active") await enableDriverUser(email);
    else await disableDriverUser(email);
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), driverId: id, status },
      "fleet: identity mirror failed after status change; record is authoritative and already applied",
    );
  }

  return { profile: await getDriver(id, scope) };
}
