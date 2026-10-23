import { claim, type AuthedEvent } from "@effy/edge-shared";

/**
 * The operator's email from the access token, or null: the shop pool's `username` may be a UUID, so a
 * guess could write a UUID into the email column. Provisioning is authoritative; COALESCE keeps the stored address.
 */
export function resolveEmail(event: AuthedEvent): string | null {
  const emailClaim = claim(event, "email");
  if (emailClaim && looksLikeEmail(emailClaim)) return emailClaim;

  const username = claim(event, "username");
  if (username && looksLikeEmail(username)) return username;

  return null;
}

function looksLikeEmail(value: string): boolean {
  // Only decides "address or opaque id", never validity.
  return value.includes("@") && !value.startsWith("@") && !value.endsWith("@");
}
