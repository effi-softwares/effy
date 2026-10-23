import { normaliseDeliveryInstructions, type AddressDTO } from "@effy/shared-types";

import { findByCognitoSub } from "../customer/repo";
import { CustomerBarredError, CustomerNotFoundError } from "../customer/service";
import { toDTO } from "./model";
import { type AddressInput, create, listByCustomer, remove, update } from "./repo";

/** Not the customer's, or does not exist → 404. */
export class AddressNotFoundError extends Error {
  constructor() {
    super("address not found");
    this.name = "AddressNotFoundError";
  }
}

/** Deleting the default while others remain → 409. */
export class DefaultDeleteBlockedError extends Error {
  constructor() {
    super("cannot delete the default while other addresses exist");
    this.name = "DefaultDeleteBlockedError";
  }
}

/** → 400. */
export class AddressValidationError extends Error {
  constructor() {
    super("missing required address fields");
    this.name = "AddressValidationError";
  }
}

/** The access decision: resolves `sub` to the internal id and refuses a barred account or one with no record. */
async function resolveActiveCustomerId(sub: string): Promise<string> {
  const row = await findByCognitoSub(sub);
  if (!row) throw new CustomerNotFoundError();
  if (row.status !== "active") throw new CustomerBarredError();
  // An account inside the closure grace window is refused here too (this gate is separate from the profile one).
  if (row.closure_state === "closing") throw new CustomerBarredError();
  return row.id;
}

/** → 400 naming which field and why, never the value: a note can hold a gate code. */
export class AddressInstructionsError extends Error {
  constructor(
    readonly field: "handover" | "note",
    readonly reason: "invalid" | "too_long",
  ) {
    super(`delivery instructions: ${field} ${reason}`);
    this.name = "AddressInstructionsError";
  }
}

/** Validated with the shared rule; `undefined` when the request did not mention them. */
export function withValidInstructions(input: AddressRequestInput): AddressInput {
  const { rawDefaultDeliveryInstructions: raw, ...rest } = input;
  if (raw === undefined) return rest;
  const out = normaliseDeliveryInstructions(raw);
  if (!out.ok) throw new AddressInstructionsError(out.field, out.reason);
  return { ...rest, defaultDeliveryInstructions: out.value };
}

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
