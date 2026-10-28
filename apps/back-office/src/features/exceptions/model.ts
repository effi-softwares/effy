import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"
import type { DeliveryExceptionDTO, DeliveryFailureReason } from "@effy/shared-types"

const REASON_LABEL: Record<DeliveryFailureReason, string> = {
  nobody_home: "Nobody home",
  wrong_address: "Wrong address",
  customer_refused: "Customer refused",
  access_blocked: "Access blocked",
  other: "Other",
}

export function reasonLabel(reason: DeliveryFailureReason): string {
  return REASON_LABEL[reason] ?? reason
}

export function locationLabel(e: DeliveryExceptionDTO): string {
  if (e.packageLocation === "with_driver") return `With ${e.driverName} — to return`
  // Back at the hub; when, if a return recorded it.
  return e.returnedAt ? `Returned ${new Date(e.returnedAt).toLocaleString()}` : "At hub"
}

export const EXCEPTION_VIEWS = ["open", "resolved", "all"] as const

/** Failed deliveries' view in the address (103), mirroring the fleet service's `EXCEPTION_LIST_SPEC`. */
export const exceptionsList = defineListSearch({
  id: "exceptions",
  mode: "offset",
  sorts: ["when"] as const,
  defaultSort: "when",
  sortDir: { when: "desc" },
  filters: { view: searchFilter.oneOf(EXCEPTION_VIEWS) },
})
