// One domain error type for the fleet service (056). Three kinds, because the caller's next move
// differs for each: fix the input (validation), stop looking (not_found), or reconcile with someone
// else's change (conflict).
//
// ⚠ `fields` matters more than it looks. It is serialised by `problem()` into the wire's `errors`
// key — NOT `fields`. 053 recorded that `@effy/api-client`'s toDomainError read `problem.fields`
// while the wire has always carried `errors`, so DomainError.fields was undefined on EVERY refusal
// on EVERY surface; 054 fixed the client. FR-011 and FR-014 both require a NAMED refusal to survive
// to the screen, so this is load-bearing rather than decorative.
import type { FieldError } from "@effy/edge-shared";

export type FleetErrorKind = "validation" | "not_found" | "conflict";

export class FleetError extends Error {
  constructor(
    readonly kind: FleetErrorKind,
    message: string,
    readonly fields?: FieldError[],
  ) {
    super(message);
    this.name = "FleetError";
  }
}

export function validationError(message: string, fields?: FieldError[]): FleetError {
  return new FleetError("validation", message, fields);
}

export function notFound(message: string): FleetError {
  return new FleetError("not_found", message);
}

export function conflict(message: string, fields?: FieldError[]): FleetError {
  return new FleetError("conflict", message, fields);
}
