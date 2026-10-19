import { ADMIN_ORDER_DELIVERY_FILTERS, ADMIN_ORDER_PROMISE_FILTERS } from "@effy/shared-types";
import type { AdminOrderDeliveryFilter } from "@effy/shared-types";

/**
 * The order list's non-view filters, read from a query string — shared by the list route and the
 * view-counts route, so a tab's count is taken under exactly the filters its list is.
 *
 * ⚠ VALIDATED AGAINST THE SHARED CONSTS, never a list restated here: a hand-written copy is how a new
 * value gets added to the type and silently REJECTED by the route (055 T073).
 */
export type BaseFilters = {
  q?: string;
  status?: string;
  deliveryType?: AdminOrderDeliveryFilter;
  stillOpen: boolean;
  promise?: (typeof ADMIN_ORDER_PROMISE_FILTERS)[number];
};

export function parseBaseFilters(
  qs: Record<string, string | undefined>,
): { ok: true; filters: BaseFilters } | { ok: false; title: string; detail: string } {
  // 079 — who delivers the order; an unknown value is refused rather than quietly listing everything.
  if (qs.deliveryType !== undefined && !(ADMIN_ORDER_DELIVERY_FILTERS as readonly string[]).includes(qs.deliveryType)) {
    return { ok: false, title: "Bad delivery type", detail: "deliveryType is effy, courier or legacy" };
  }
  const deliveryType = qs.deliveryType as AdminOrderDeliveryFilter | undefined;
  // 083 — "still open" narrows the old-kind orders only; anywhere else it would quietly mean nothing.
  if (qs.open !== undefined && (qs.open !== "true" || deliveryType !== "legacy")) {
    return { ok: false, title: "Bad filter", detail: "open=true is used with deliveryType=legacy" };
  }
  // 085 — what an Effy order was sold.
  if (qs.promise !== undefined && !(ADMIN_ORDER_PROMISE_FILTERS as readonly string[]).includes(qs.promise)) {
    return { ok: false, title: "Bad promise", detail: "promise is window, day or asap" };
  }
  return {
    ok: true,
    filters: {
      q: qs.q?.trim() || undefined,
      status: qs.status || undefined,
      deliveryType,
      stillOpen: qs.open === "true",
      promise: qs.promise as BaseFilters["promise"],
    },
  };
}
