// Three kinds for three next moves: fix the input, stop looking, reconcile with someone else's change.
// `fields` is serialised as the wire's `errors`, which carries a named refusal to the screen.
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
