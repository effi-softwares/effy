import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import {
  emitMetric, forbidden, json, preamble, problem, ProblemType, subject, unavailable, validationFailed,
} from "@effy/edge-shared";
import {
  createRefundRepository, createRefundService, LinesNotYoursError, MONEY_METRIC_NAMESPACE, optionalText, parseRefundLines, refundProblem, stripeGateway,
} from "@effy/edge-shared/payments";

import { shopMayRefundOrder } from "../staff/service";

// ⚠ NO SHOP-LOCAL REFUND MECHANISM (057 FR-014). The rules are the platform's one implementation;
// all this route adds is a differently-authorized way in, and a scope check. Built once per container.
const refunds = createRefundService({ repo: createRefundRepository(), gateway: stripeGateway });

const denied = (reason: string) => emitMetric(MONEY_METRIC_NAMESPACE, "ShopRefundDenied", 1, { reason });

/**
 * POST /shop/v1/orders/{orderId}/refunds — a shop manager refunds their own portion of an order.
 *
 * ⚠ THE ORDER OF THE TWO GATES MATTERS. Authorization (may this person refund this order at all)
 * runs BEFORE line scoping (are these lines theirs), so a caller who is not a manager at a shop on
 * this order learns nothing about which lines exist.
 *
 * ⚠ The 403 is uniform: not a manager, shop suspended, no shop, or simply not this shop's order
 * all read the same — saying which would make the route a probe for which orders exist. The reason
 * is counted as a metric, where only Effy can read it. A failed check is 503, never a grant.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) {
    return problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid access token for this audience is required", scope);
  }
  const orderId = event.pathParameters?.orderId ?? "";

  let shopId: string | null;
  try {
    shopId = await shopMayRefundOrder(sub, orderId);
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "shop refund: authorization check failed");
    return unavailable(scope);
  }
  if (!shopId) {
    denied("not_permitted");
    return forbidden(scope);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(event.body ?? "");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return validationFailed(scope, "a valid refund request is required");
  }
  const reason = optionalText(body.reason);
  const note = optionalText(body.note);
  const lines = parseRefundLines(body.lines);
  if (reason === null || note === null || lines === null || (body.restock != null && typeof body.restock !== "boolean")) {
    return validationFailed(scope, "a valid refund request is required");
  }
  if (lines.length === 0) return validationFailed(scope, "select at least one item to refund");

  try {
    // ⚠ The WHOLE request is refused if any line is another shop's — never the subset it likes.
    await refunds.repo.assertLinesBelongToShop(orderId, shopId, lines);
    return json(200, await refunds.issue({
      orderId, lines, reason, note, amount: "",
      // ⚠ Always `item`. A shop may not issue goodwill: that spends Effy's money on a gesture Effy
      // did not make.
      kind: "item",
      actorSub: sub,
      actorKind: "shop",
      // ⚠ Stock goes back only when the shop says the goods are fit to sell. Absent means no.
      skipStockReturn: body.restock !== true,
    }), scope);
  } catch (err) {
    if (err instanceof LinesNotYoursError) {
      denied("not_your_lines");
      return validationFailed(scope, "those items are not part of your shop's portion of this order");
    }
    return refundProblem(scope, err, "shop issue");
  }
};
