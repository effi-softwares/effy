// Manual field validation into typed field errors. No schema library: small bundles, readable code.
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

