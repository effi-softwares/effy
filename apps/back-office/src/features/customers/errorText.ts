import { isDomainError } from "@effy/api-client";

/**
 * The console's own words for a points refusal (074). Keyed off the problem's `type` (the server's
 * stable refusal code), never its free-form `detail` — the same rule as `orders/errorText.ts`.
 */
const BY_CODE: Readonly<Record<string, string>> = {
  "over-agent-limit": "That's more than you can credit at once. Ask a manager to credit it.",
  "insufficient-points": "The customer doesn't have that many points to remove.",
  "note-required": "Add a note — it's required when the reason is Other.",
  "order-not-found": "That order isn't this customer's.",
  "points-invalid": "Enter a whole number of points, from 1 to 1,000,000.",
  "reason-invalid": "Choose one of the listed reasons.",
  "setting-invalid": "One of those values is out of range.",
};

export function pointsActionError(err: unknown): string {
  if (isDomainError(err)) {
    const code = err.type?.split("/problems/")[1];
    if (code && BY_CODE[code]) return BY_CODE[code]!;
    if (err.kind === "forbidden") return "Your role can't do that.";
    if (err.kind === "not-found") return "That customer no longer exists.";
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment.";
  }
  return "That didn't work. Try again.";
}
