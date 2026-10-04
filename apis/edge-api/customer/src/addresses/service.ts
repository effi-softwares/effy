import { normaliseDeliveryInstructions, type AddressDTO } from "@effy/shared-types";

import { findByCognitoSub } from "../customer/repo";
import { CustomerBarredError, CustomerNotFoundError } from "../customer/service";
import { toDTO } from "./model";
import { type AddressInput, create, listByCustomer, remove, update } from "./repo";

/** The id is not the customer's (or does not exist) → 404. */
export class AddressNotFoundError extends Error {
  constructor() {
    super("address not found");
    this.name = "AddressNotFoundError";
  }
}

/** Refused delete of the default while other addresses remain → 409 (FR-016a). */
export class DefaultDeleteBlockedError extends Error {
  constructor() {
    super("cannot delete the default while other addresses exist");
    this.name = "DefaultDeleteBlockedError";
  }
}

/** Missing required create fields → 400. */
export class AddressValidationError extends Error {
  constructor() {
    super("missing required address fields");
    this.name = "AddressValidationError";
  }
}

/**
 * THE ACCESS DECISION, shared with the profile endpoints (FR-020, SC-005). Resolves the caller's
 * `sub` to the platform's INTERNAL customer id and refuses a barred account holding a valid token —
 * the record is the authority, not the credential. A caller with no record (never completed a GET
 * /me) is refused too; the account UI always reads /me first.
 */
async function resolveActiveCustomerId(sub: string): Promise<string> {
  const row = await findByCognitoSub(sub);
  if (!row) throw new CustomerNotFoundError();
  if (row.status !== "active") throw new CustomerBarredError();
  // 034 FR-041 — an account inside the closure grace window is refused here too. ⚠ This gate is
  // SEPARATE from the profile one by design (it resolves an internal id), so a closure check added
  // only there would leave the address book fully usable by a customer who asked to be deleted.
  if (row.closure_state === "closing") throw new CustomerBarredError();
  return row.id;
}

/**
 * 066 — the saved delivery instructions failed the shared rule → 400.
 *
 * ⚠ Carries WHICH field and WHY, never the value: a note can hold a gate code, and an error object
 * is exactly what the catch-all handler logs.
 */
export class AddressInstructionsError extends Error {
  constructor(
    readonly field: "handover" | "note",
    readonly reason: "invalid" | "too_long",
  ) {
    super(`delivery instructions: ${field} ${reason}`);
    this.name = "AddressInstructionsError";
  }
}

/**
 * Validate the request's default instructions with the ONE shared rule (Principle II) and hand the
 * repository a normalised value — or `undefined` when the request did not mention them at all.
 */
export function withValidInstructions(input: AddressRequestInput): AddressInput {
  const { rawDefaultDeliveryInstructions: raw, ...rest } = input;
  if (raw === undefined) return rest;
  const out = normaliseDeliveryInstructions(raw);
  if (!out.ok) throw new AddressInstructionsError(out.field, out.reason);
  return { ...rest, defaultDeliveryInstructions: out.value };
}

/** What the HTTP layer hands over: the repository's input plus the still-unvalidated instructions. */
export type AddressRequestInput = AddressInput & { rawDefaultDeliveryInstructions?: unknown };

export async function listAddresses(sub: string): Promise<AddressDTO[]> {
  const customerId = await resolveActiveCustomerId(sub);
  const rows = await listByCustomer(customerId);
  return rows.map(toDTO);
}

export async function createAddress(sub: string, request: AddressRequestInput): Promise<AddressDTO> {
  const input = withValidInstructions(request);
  if (!input.recipientName || !input.line1 || !input.city || !input.postalCode) {
    throw new AddressValidationError();
  }
  const customerId = await resolveActiveCustomerId(sub);
  const row = await create(customerId, input);
  return toDTO(row);
}

export async function updateAddress(
  sub: string,
  id: string,
  request: AddressRequestInput,
): Promise<AddressDTO> {
  const input = withValidInstructions(request);
  const customerId = await resolveActiveCustomerId(sub);
  const row = await update(customerId, id, input);
  if (!row) throw new AddressNotFoundError();
  return toDTO(row);
}

export async function deleteAddress(sub: string, id: string): Promise<void> {
  const customerId = await resolveActiveCustomerId(sub);
  const outcome = await remove(customerId, id);
  if (outcome === "not_found") throw new AddressNotFoundError();
  if (outcome === "default_blocked") throw new DefaultDeleteBlockedError();
}
