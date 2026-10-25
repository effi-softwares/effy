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

export function sortForTriage(rows: readonly DeliveryExceptionDTO[]): DeliveryExceptionDTO[] {
  return [...rows].sort((a, b) => {
    if ((a.resolvedAt === null) !== (b.resolvedAt === null)) return a.resolvedAt === null ? -1 : 1
    return b.failedAt.localeCompare(a.failedAt)
  })
}
