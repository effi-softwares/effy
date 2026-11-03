import type { DeliveryDaysDTO, DeliveryDaysInput } from "@effy/shared-types"

/**
 * The saved delivery-day settings as a PUT body. The three settings pages that share this one record (Delivery days,
 * Hub and runs, Driver work) each send it whole with only their own fields changed, so no page resets another's.
 */
export function daysInput(v: DeliveryDaysDTO): DeliveryDaysInput {
  const { dates: _dates, ...rest } = v
  return rest
}
