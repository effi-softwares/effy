import { isDomainError } from "@effy/api-client"

function isConflict(err: unknown): boolean {
  return isDomainError(err) && err.status === 409
}

const STALE_STATE_MESSAGE =
  "This order changed elsewhere — someone else may be working it. Reload to see its current state."

const BAG_REFUSALS: Record<string, string> = {
  zone_bag_required: "This order has chilled or frozen items — it needs at least one bag of each.",
  parcel_count: "An order's portion has between 1 and 50 bags.",
  parcels_with_driver: "These bags have already left the shop, so they can't be changed.",
  first_bag_not_voidable: "Bag 1 can't be removed. Change the number of bags instead.",
  void_last_bag_only:
    "Only the last bag can be removed once labels are printed. Change the number of bags and reprint every label.",
  labels_not_printed: "Print every bag's label before marking this ready for pickup.",
  bags_not_packed: "Scan every bag as packed before marking this ready for pickup.",
}

function bagRefusal(err: unknown): string | null {
  if (!isDomainError(err) || !err.type) return null
  const code = err.type.split("/").pop() ?? ""
  return BAG_REFUSALS[code] ?? null
}

export function bagRefusalText(err: unknown): string {
  return bagRefusal(err) ?? fulfillmentMutationError(err)
}

export function fulfillmentMutationError(err: unknown): string {
  const named = bagRefusal(err)
  if (named) return named
  if (isConflict(err)) return STALE_STATE_MESSAGE
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have access to this order."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."
    if (err.status === 400 || err.status === 422)
      return "That quantity is more than was ordered. Check the numbers and try again."
  }
  return "Something went wrong. Please try again."
}

export function orderEditError(err: unknown): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have access to this order."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."
    if (err.status === 400 || err.status === 422)
      return "That wasn't accepted — tags are up to 10 short words, and a note can't be empty."
  }
  return "Something went wrong. Please try again."
}

export function courierHandoverError(err: unknown): string {
  if (isConflict(err))
    return "This pickup isn't booked any more, or the parcel isn't marked ready. Refresh and check with Effy."
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "This parcel isn't collected by a courier from your shop any more."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."
  }
  return "Something went wrong. Please try again."
}
