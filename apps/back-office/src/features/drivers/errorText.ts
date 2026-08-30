import { isDomainError } from "@effy/api-client";

/**
 * Uniform, non-leaking failure copy for the driver console (056).
 *
 * ⚠ THIS FILE EXISTS BECAUSE THE PLATFORM HAS SHIPPED THE SAME DEFECT BEFORE. 053's order console
 * did:
 *
 *     onError: (e) => setError(e instanceof Error ? e.message : "Could not do that.")
 *
 * `@effy/api-client` throws a `DomainError` — a PLAIN OBJECT, not an `Error` instance — so the
 * `instanceof` check was always false and the operator ALWAYS saw the generic fallback. The server
 * had already got the refusal right; the console threw it away. Every test stayed green, because
 * nothing asserted on the message.
 *
 * That matters more here than it did there. FR-014's refusal has to NAME the existing driver, and
 * FR-020's has to ITEMISE the held work — a generic sentence turns both into "something went wrong",
 * which is exactly the state this feature was built to end.
 *
 * ⚠ AND THE FIX IS NOT "RENDER `detail` VERBATIM". `detail` is free-form server prose that can leak
 * internals; 005's FR-008 forbids showing it. But a refusal the SERVICE composed deliberately, for a
 * human, is not the same thing as an unhandled error's message — so the two cases below that render
 * server text do so only for conflicts this console's own API defines, and everything else is the
 * console's own copy keyed off `kind` and `status`.
 */

export type DriverAction =
  | "create"
  | "update"
  | "status"
  | "resolve"
  | "release"
  | "end-duty";

const FORBIDDEN: Record<DriverAction, string> = {
  create: "Adding a driver needs a manager or an administrator.",
  update: "Editing a driver needs a manager or an administrator.",
  status: "Changing a driver's status needs a manager or an administrator.",
  resolve: "Resolving this needs a manager or an administrator.",
  release: "Releasing work needs a manager or an administrator.",
  "end-duty": "Ending a duty session needs a manager or an administrator.",
};

const NOT_FOUND: Record<DriverAction, string> = {
  create: "That driver no longer exists.",
  update: "That driver no longer exists. They may have been removed since this page loaded.",
  status: "That driver no longer exists.",
  resolve: "That report no longer exists.",
  release: "That work is no longer stranded — someone may have released it already.",
  "end-duty": "That duty session no longer exists.",
};

export function driverActionError(err: unknown, action: DriverAction): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return FORBIDDEN[action];
    if (err.kind === "not-found") return NOT_FOUND[action];
    if (err.kind === "unauthenticated") return "Your session has expired. Sign in again.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";

    if (err.status === 409) {
      // ⚠ The two conflicts this console cannot phrase better than the service can, because only the
      // service knows WHICH driver holds the address or WHAT work is held. Both are composed for a
      // person by the fleet service, on purpose, and both are useless as a generic sentence.
      if ((action === "create" || action === "status") && err.detail) return err.detail;
      if (action === "update")
        return "Someone else changed this driver while you were editing. Reload the page and reapply your change — saving now would quietly undo theirs.";
      if (action === "resolve") return "Someone else already resolved this report.";
      if (action === "end-duty") return "That duty session has already ended.";
      return "That has already changed. Reload and try again.";
    }

    if (err.status === 400) {
      // Field errors travel in `DomainError.fields` (054 fixed the client to read the wire's
      // `errors` key). Where the service named the fields, say so — a validation refusal that
      // cannot say WHICH field is wrong is a generic sentence with extra steps.
      const named = err.fields?.map((f) => f.field).filter(Boolean);
      if (named && named.length > 0) {
        return `Check ${named.map(fieldLabel).join(", ")} and try again.`;
      }
      return "Some of those details aren't valid. Check the form and try again.";
    }
  }
  return "Something went wrong. Try again.";
}

/** Field names as they appear on the form, so the message points at the right box. */
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
};

export function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field;
}

/**
 * The held-work refusal's itemised list (FR-020). The service puts one entry per held item in
 * `fields`, each `message` describing the item and its order.
 */
export function heldWorkItems(err: unknown): string[] {
  if (!isDomainError(err)) return [];
  return (err.fields ?? []).map((f) => f.message).filter(Boolean);
}
