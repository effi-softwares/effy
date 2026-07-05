// Manual field validation → typed field errors. Deliberately no schema library
// (ARCHITECTURE.md: keep bundles small; validation is code you can read). The
// bootstrap surface is read-only — the first write route consumes these helpers;
// they are conformance-tested now so the pattern is locked in.
import type { FieldError } from "./lib/http";

export interface Validation<T> {
  value?: T;
  errors: FieldError[];
}

// parseJsonBody: malformed or absent JSON is a validation failure, never a crash.
export function parseJsonBody<T extends Record<string, unknown>>(
  body: string | undefined,
): Validation<T> {
  if (!body) return { errors: [{ field: "body", message: "a JSON body is required" }] };
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { errors: [{ field: "body", message: "body must be a JSON object" }] };
    }
    return { value: parsed as T, errors: [] };
  } catch {
    return { errors: [{ field: "body", message: "body is not valid JSON" }] };
  }
}

export function requireNonEmptyString(
  obj: Record<string, unknown>,
  field: string,
): FieldError | undefined {
  const v = obj[field];
  if (typeof v !== "string" || v.trim().length === 0) {
    return { field, message: "must be a non-empty string" };
  }
  return undefined;
}

export function optionalPositiveInt(
  obj: Record<string, unknown>,
  field: string,
): FieldError | undefined {
  const v = obj[field];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    return { field, message: "must be a positive integer" };
  }
  return undefined;
}
