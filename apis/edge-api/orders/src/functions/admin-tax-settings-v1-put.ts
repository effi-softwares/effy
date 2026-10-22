import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, problem, unavailable } from "@effy/edge-shared";

import { requireAdmin } from "../lib/guard";
import { VALIDATION_FAILED } from "../lib/problems";
import { TaxSettingsRefusal, putTaxSettings } from "../tax-settings/service";

/**
 * PUT /orders/v1/admin/tax-settings — set Effy's legal name, ABN and fee treatment, and turn tax
 * invoices on or off (096 US8, FR-084). Admin only. 422 `abn_invalid`; 409 `tax_setup_incomplete`
 * (with `missing`) when turning invoices on before everything they need is set.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireAdmin(event, context);
  if (!guard.ok) return guard.response;
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) return problem(400, VALIDATION_FAILED, "Validation failed", "a JSON body is required", guard.scope, parsed.errors);
  try {
    return json(200, await putTaxSettings(guard.sub, parsed.value), guard.scope);
  } catch (err) {
    if (err instanceof TaxSettingsRefusal) {
      // What is missing travels as field issues — the shape every client already reads (`errors`).
      return problem(err.status, `https://effyshopping.com/problems/${err.code}`, "Refused", err.message, guard.scope,
        err.missing.map((m) => ({ field: "setup", message: m })));
    }
    guard.scope.log.error({ err }, "orders: tax settings write failed");
    return unavailable(guard.scope);
  }
};
