import type { AddressDTO } from "@effy/shared-types";

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
  return row.id;
}

export async function listAddresses(sub: string): Promise<AddressDTO[]> {
  const customerId = await resolveActiveCustomerId(sub);
  const rows = await listByCustomer(customerId);
  return rows.map(toDTO);
}

export async function createAddress(sub: string, input: AddressInput): Promise<AddressDTO> {
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
  input: AddressInput,
): Promise<AddressDTO> {
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
