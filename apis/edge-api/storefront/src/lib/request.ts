/**
 * Query-string access for storefront routes.
 *
 * ⚠ READ FROM `rawQueryString`, NOT `queryStringParameters`. The gateway joins a repeated
 * parameter into one comma-separated string (`brand=a&brand=b` → "a,b"), which cannot be told apart
 * from one brand whose name contains a comma. The raw string keeps each occurrence.
 */
import type { APIGatewayProxyEventV2 } from "aws-lambda";

export function queryOf(event: APIGatewayProxyEventV2): URLSearchParams {
  return new URLSearchParams(event.rawQueryString ?? "");
}

/** Trimmed, non-empty values of a repeated parameter; null when there are none. */
export function nonEmptyValues(values: readonly string[]): string[] | null {
  const out = values.map((v) => v.trim()).filter((v) => v !== "");
  return out.length > 0 ? out : null;
}

/** Characteristic facets arrive as repeated `attr.<key>=<value>` parameters. */
export function attributeFacets(q: URLSearchParams): Record<string, string[]> | null {
  const facets: Record<string, string[]> = {};
  for (const key of new Set(q.keys())) {
    if (!key.startsWith("attr.")) continue;
    const kept = nonEmptyValues(q.getAll(key));
    if (kept) facets[key.slice("attr.".length)] = kept;
  }
  return Object.keys(facets).length > 0 ? facets : null;
}

/** "a, b,,c" → ["a","b","c"]. */
export function splitCsv(s: string): string[] {
  return s.split(",").map((p) => p.trim()).filter((p) => p !== "");
}

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Whether a price bound is a number at all. Empty is valid (no bound).
 *
 * A non-numeric bound sent to `::numeric` raises in the database; without this the caller's typo
 * would be reported as the service being unavailable.
 */
export function validPrice(s: string): boolean {
  return s === "" || DECIMAL.test(s);
}

/** A bare `{"error": "<code>"}` 400 — the shape these routes have always answered with. */
export function badRequest(code: string, requestId: string) {
  return {
    statusCode: 400,
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify({ error: code }),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string | undefined): s is string {
  return typeof s === "string" && UUID.test(s);
}
