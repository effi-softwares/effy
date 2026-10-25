import { isDomainError } from "@effy/api-client"

type VehicleAction = "create" | "update" | "status" | "issue" | "return"

const FORBIDDEN: Record<VehicleAction, string> = {
  create: "You do not have permission to add a vehicle.",
  update: "You do not have permission to edit a vehicle.",
  status: "You do not have permission to change a vehicle's status.",
  issue: "You do not have permission to issue a vehicle.",
  return: "You do not have permission to record a vehicle's return.",
}

const NOT_FOUND: Record<VehicleAction, string> = {
  create: "That vehicle no longer exists.",
  update: "That vehicle no longer exists. It may have been removed since this page loaded.",
  status: "That vehicle no longer exists.",
  issue: "That vehicle or driver no longer exists.",
  return: "That vehicle no longer exists.",
}

export function vehicleActionError(err: unknown, action: VehicleAction): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return FORBIDDEN[action]
    if (err.kind === "not-found") return NOT_FOUND[action]
    if (err.kind === "unauthenticated") return "Your session has expired. Sign in again."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."

    if (err.status === 409) {
      if ((action === "issue" || action === "return" || action === "status" || action === "create") && err.detail) {
        return err.detail
      }
      if (action === "update")
        return "Someone else changed this vehicle while you were editing. Reload the page and reapply your change — saving now would quietly undo theirs."
      return "That has already changed. Reload and try again."
    }

    if (err.status === 400 || err.status === 422) {
      const named = err.fields?.map((f) => f.field).filter(Boolean)
      if (named && named.length > 0) {
        return `Check ${named.map(fieldLabel).join(", ")} and try again.`
      }
      return "Some of those details aren't valid. Check the form and try again."
    }
  }
  return "Something went wrong. Try again."
}

const FIELD_LABEL: Record<string, string> = {
  registrationPlate: "the registration plate",
  make: "the make",
  model: "the model",
  bodyType: "the body type",
  fuelType: "the fuel type",
  ownership: "who owns it",
  year: "the year",
  payloadKg: "the payload",
  loadVolumeLitres: "the load volume",
  crateCapacity: "the crate capacity",
  registrationExpiresOn: "the registration expiry",
  insuranceExpiresOn: "the insurance expiry",
  roadworthyExpiresOn: "the roadworthy expiry",
  odometerKm: "the odometer reading",
  odometerStartKm: "the opening odometer reading",
  odometerEndKm: "the closing odometer reading",
  driverId: "the driver",
  status: "the status",
  reason: "the reason",
}

function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field
}

export function vehicleFieldErrors(err: unknown): { field: string; message: string }[] {
  if (!isDomainError(err)) return []
  return (err.fields ?? []).filter((f) => Boolean(f?.message))
}
