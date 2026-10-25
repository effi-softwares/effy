import { isDomainError } from "@effy/api-client"

export function stockErrorText(err: unknown): string {
  if (!isDomainError(err)) return "Something went wrong. Please try again."

  const field = err.fields?.[0]?.field
  if (err.status === 400 || err.status === 422) {
    switch (field) {
      case "onHand":
        return "Enter a whole number of units, zero or more."
      case "delta":
        return "Enter a whole number to add or remove. It cannot be zero."
      case "threshold":
      case "defaultThreshold":
        return "Enter a whole number, or leave it blank to use the shop default."
      case "reason":
        return "Choose a reason for this change."
      case "tracked":
        return "Choose whether to track stock for this product."
      default:
        return "Please check the values and try again."
    }
  }

  if (err.status === 409) {
    return "Stock is not being tracked for this product. Turn tracking on first."
  }
  if (err.kind === "forbidden") {
    return "You don't have permission to change stock for this product."
  }
  if (err.kind === "not-found") return "That product no longer exists."
  if (err.kind === "unavailable") {
    return "The service is waking up or unreachable. Try again in a moment."
  }
  return "Something went wrong. Please try again."
}
