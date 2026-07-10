import { claim, type AuthedEvent } from "@effy/edge-shared";

/**
 * Resolve the operator's email from the access token — or admit that we cannot.
 *
 * The shop pool uses email-as-username, so a Cognito ACCESS token carries no `email` claim, and
 * its `username` claim may be a generated UUID rather than the address (research R6). Rather than
 * guess Cognito's semantics and write a UUID into the email column — which is what the back-office
 * service does today, a defect flagged for a 005 reconciliation — we return null and let the
 * operator provisioning step be authoritative.
 *
 * The repository's COALESCE ensures a null here never clobbers a stored address.
 */
export function resolveEmail(event: AuthedEvent): string | null {
  const emailClaim = claim(event, "email");
  if (emailClaim && looksLikeEmail(emailClaim)) return emailClaim;

  const username = claim(event, "username");
  if (username && looksLikeEmail(username)) return username;

  return null;
}

function looksLikeEmail(value: string): boolean {
  // Deliberately loose: this only decides "is this an address or an opaque id", never validity.
  return value.includes("@") && !value.startsWith("@") && !value.endsWith("@");
}
