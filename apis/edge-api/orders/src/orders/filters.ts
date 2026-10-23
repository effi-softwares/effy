import { ADMIN_ORDER_DELIVERY_FILTERS, ADMIN_ORDER_PROMISE_FILTERS } from "@effy/shared-types";
import type { AdminOrderDeliveryFilter } from "@effy/shared-types";

/** Shared by the list and view-count routes, so a tab's count uses its list's filters. Validated against the shared consts. */
export type BaseFilters = {
  q?: string;
  status?: string;
  deliveryType?: AdminOrderDeliveryFilter;
  promise?: (typeof ADMIN_ORDER_PROMISE_FILTERS)[number];
};

export function parseBaseFilters(
  qs: Record<string, string | undefined>,
): { ok: true; filters: BaseFilters } | { ok: false; title: string; detail: string } {
  // An unknown value is refused rather than listing everything.
  if (qs.deliveryType !== undefined && !(ADMIN_ORDER_DELIVERY_FILTERS as readonly string[]).includes(qs.deliveryType)) {
    return { ok: false, title: "Bad delivery type", detail: "deliveryType is effy or courier" };
  }
  const deliveryType = qs.deliveryType as AdminOrderDeliveryFilter | undefined;
  if (qs.promise !== undefined && !(ADMIN_ORDER_PROMISE_FILTERS as readonly string[]).includes(qs.promise)) {
    return { ok: false, title: "Bad promise", detail: "promise is window, day or asap" };
  }
  return {
    ok: true,
    filters: {
      q: qs.q?.trim() || undefined,
      status: qs.status || undefined,
      deliveryType,
      promise: qs.promise as BaseFilters["promise"],
    },
  };
}
