// Back-office driver management use-cases (056).
//
// Provisioning is Cognito-first → the platform record (the 006/009 pattern), because the identity is
// what produces the `sub` the record is keyed on. ⚠ It cannot be made atomic — two systems, no shared
// transaction — so the failure mode is a Cognito account with no record. That is why `accountState`
// exists on the profile and why `fleet.driver_provision_failed` is the service's one alarm: the
// half-created driver is the single state an operator cannot fix from the console.
import type {
  AdminDriverCreateRequest,
  AdminDriverListResponse,
  AdminDriverProfile,
  AdminDriverUpdateRequest,
  DriverAccountState,
  DriverEmploymentStatus,
} from "@effy/shared-types";
import type { FieldError, RequestScope } from "@effy/edge-shared";

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
import * as repo from "./repository";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DATE_FIELDS = [
  "licenceExpiresOn",
  "vehicleRegistrationExpiresOn",
  "startedOn",
] as const;

/**
 * Validate the shape of a create/update payload. Returns field errors, so a refusal can NAME what is
 * wrong (FR-011) — a generic "validation failed" tells the operator nothing to act on.
 *
 * ⚠ AT MOST ONE ERROR PER FIELD. The screen renders these against the input they belong to, so two
 * entries for `name` would print the same sentence twice under one box. An earlier draft checked the
 * name here AND again in `createDriver`, and a test caught the duplicate.
 *
 * `nameRequired` distinguishes create (the name must be present) from update (a name that is absent
 * simply is not being changed).
 */
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

/** Trim strings; turn an empty string into null so "cleared in the UI" and "cleared" are one thing. */
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

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────

export async function listDrivers(params: repo.ListParams): Promise<AdminDriverListResponse> {
  const result = await repo.listDrivers(params);
  return { items: result.items, nextCursor: result.nextCursor };
}

/**
 * The profile, with `accountState` resolved against the identity provider.
 *
 * ⚠ The identity lookup is BEST-EFFORT. If Cognito is unreachable the profile still renders and
 * reports `ok` rather than failing the whole read — an operator who cannot open a driver at all is
 * worse off than one who cannot see whether the sign-in account exists. The failure is logged.
 */
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

// ── Writes ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Provision a driver: a record and a working sign-in, created together (FR-013).
 *
 * ⚠ A WORK EMAIL ALREADY IN USE IS REFUSED, AND THE REFUSAL NAMES THE EXISTING DRIVER (FR-014).
 * The predecessor did the opposite: `ensureDriverUser` swallowed the exists exception and RE-ENABLED
 * a disabled account, and the repository's `ON CONFLICT DO UPDATE` then overwrote that person's name,
 * zone and vehicle — reporting success. Creating a "new" driver with the email of someone who had
 * been deliberately stood down brought their sign-in back to life. Both halves are refused now, and
 * the refusal names them so the operator chooses consciously between a re-hire and a different
 * address.
 */
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

  // The record check first: it is cheap, it is the one the citext UNIQUE index guarantees, and it
  // gives the better refusal because it can name the driver.
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
      // A sign-in account with no record — the other half of a half-provisioned driver. Refuse, and
      // say so precisely: reusing it would adopt an identity nobody in this console created.
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
    // ⚠ The identity now exists and the record does not. This is the one state an operator cannot
    // repair from the console, so it is logged at the exact string the alarm's metric filter selects.
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

/** Apply a profile patch under optimistic concurrency (FR-009, FR-010, FR-012). */
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
  // ⚠ Refused, not ignored. Silently dropping it would let an operator believe they had changed a
  // driver's sign-in address (research R7).
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

/**
 * Move a driver between employment states (FR-015…FR-020).
 *
 * ⚠ FR-020'S HELD-WORK REFUSAL IS GONE, AND THE HAZARD IT GUARDED IS GONE WITH IT — FOR NOW.
 * Standing a driver down used to be refused until the operator acknowledged an itemised list of what
 * they were already carrying, because `releaseIneligibleWork` never yanked picked-up work and the
 * UNIQUE(shop_fulfillment_id) constraint then kept those packages claimed forever, with an order
 * attached to each. Nothing assigns work now, so nothing can be holding any, and a warning that can
 * never fire is a warning people learn to click through.
 *
 * ⚠ THE DISPATCH SLICE MUST REBUILD THIS, and it is not a nicety: it was 056's headline finding, it
 * was in no register because nobody knew, and it strands physical goods permanently and invisibly.
 * Releasing stranded work stays an explicit human action for the reason 056 gave — it asserts
 * something about the physical world that no query can know.
 */
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
   * ⚠⚠ STANDING A DRIVER DOWN WHILE THEY HOLD A VEHICLE IS REFUSED, AND THIS IS THE SLICE'S MOST
   * IMPORTANT SAFETY BEHAVIOUR (FR-019).
   *
   * The van is in a carpark somewhere. Suspending or offboarding the driver does not make it appear
   * at the hub — but it DOES remove them from every list an operator looks at, so the vehicle
   * silently stops being anybody's problem while remaining physically absent. 056 found exactly this
   * shape with collected packages and recorded that it strands goods "permanently and invisibly,
   * and this was in no register because nobody knew".
   *
   * ⚠ The refusal NAMES the vehicle, because "record its return first" is only actionable if the
   * operator knows which one. Recording a return is a statement about the physical world, which is
   * why it stays an explicit human act rather than something this transition does on their behalf.
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
        // ⚠ The reason is operator-authored prose about an employee. It is recorded — that is the
        // point of FR-016 — but the field list stays free of the PII columns (FR-050).
        detail: { changed: ["status"], values: { status, reason: trimmedReason } },
      },
      tx,
    );
  });
  if (!email) throw notFound("driver not found");

  // Defence in depth. ⚠ Deliberately AFTER the record write: the record is authoritative, so if the
  // identity call fails the driver is already refused by the gate, and we log rather than roll back a
  // correct record change because an external service was unavailable.
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
