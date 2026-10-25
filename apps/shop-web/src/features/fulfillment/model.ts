import type {
  FulfillmentDetailDTO,
  FulfillmentStatus,
  FulfillmentSummaryDTO,
  RequestableTransition,
} from "@effy/shared-types"

export type FulfillmentSummary = FulfillmentSummaryDTO
export type FulfillmentDetail = FulfillmentDetailDTO

export type { FulfillmentStatus, RequestableTransition }

export function canDeclareUnfulfillable(status: FulfillmentStatus): boolean {
  return status === "pending" || status === "received" || status === "picking" || status === "ready_for_pickup"
}

export function nextTransition(status: FulfillmentStatus): RequestableTransition | null {
  if (status === "received") return "picking"
  if (status === "picking") return "ready_for_pickup"
  return null
}
