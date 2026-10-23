/**
 * Reads `rawQueryString`: the gateway joins repeated parameters with commas, which cannot be told
 * apart from a value containing one.
 */
import type { APIGatewayProxyEventV2 } from "aws-lambda";

export function queryOf(event: APIGatewayProxyEventV2): URLSearchParams {
  return new URLSearchParams(event.rawQueryString ?? "");
}

export function nonEmptyValues(values: readonly string[]): string[] | null {
  const out = values.map((v) => v.trim()).filter((v) => v !== "");
  return out.length > 0 ? out : null;
}

export function attributeFacets(q: URLSearchParams): Record<string, string[]> | null {
  const facets: Record<string, string[]> = {};
  for (const key of new Set(q.keys())) {
    if (!key.startsWith("attr.")) continue;
    const kept = nonEmptyValues(q.getAll(key));
    if (kept) facets[key.slice("attr.".length)] = kept;
  }
  return Object.keys(facets).length > 0 ? facets : null;
}

export function splitCsv(s: string): string[] {
  return s.split(",").map((p) => p.trim()).filter((p) => p !== "");
}

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** Empty is valid. A non-numeric bound would raise at `::numeric` and read as an outage. */
export function validPrice(s: string): boolean {
  return s === "" || DECIMAL.test(s);
}

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
