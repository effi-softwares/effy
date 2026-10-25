import { isDomainError } from "@effy/api-client"

type DriverAction = "create" | "update" | "status" | "resolve" | "release" | "end-duty"

const FORBIDDEN: Record<DriverAction, string> = {
  create: "Adding a driver needs a manager or an administrator.",
  update: "Editing a driver needs a manager or an administrator.",
  status: "Changing a driver's status needs a manager or an administrator.",
  resolve: "Resolving this needs a manager or an administrator.",
  release: "Releasing work needs a manager or an administrator.",
  "end-duty": "Ending a duty session needs a manager or an administrator.",
}

const NOT_FOUND: Record<DriverAction, string> = {
  create: "That driver no longer exists.",
  update: "That driver no longer exists. They may have been removed since this page loaded.",
  status: "That driver no longer exists.",
  resolve: "That report no longer exists.",
  release: "That work is no longer stranded — someone may have released it already.",
  "end-duty": "That duty session no longer exists.",
}

export function driverActionError(err: unknown, action: DriverAction): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return FORBIDDEN[action]
    if (err.kind === "not-found") return NOT_FOUND[action]
    if (err.kind === "unauthenticated") return "Your session has expired. Sign in again."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."

    if (err.status === 409) {
      if ((action === "create" || action === "status") && err.detail) return err.detail
      if (action === "update")
        return "Someone else changed this driver while you were editing. Reload the page and reapply your change — saving now would quietly undo theirs."
      if (action === "resolve") return "Someone else already resolved this report."
      if (action === "end-duty") return "That duty session has already ended."
      return "That has already changed. Reload and try again."
    }

    if (err.status === 400) {
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
  name: "the driver's name",
  workEmail: "the work email",
  contactPhone: "the phone number",
  zoneId: "the delivery zone",
  licenceExpiresOn: "the licence expiry",
  vehicleRegistrationExpiresOn: "the registration expiry",
  startedOn: "the start date",
  reason: "the reason",
  note: "the note",
  updatedAt: "this page's version — reload and try again",
  status: "the status",
  taskIds: "the selected work",
}

function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field
}
