/**
 * Customer audience contracts (011-customer-storefront-web).
 *
 * The single source of truth for the customer wire shapes (Principle II). `customer-web` and
 * `apis/edge-api/customer` both import these; neither redefines them. The forthcoming customer
 * mobile app (KMP) mirrors them.
 */

/** A customer's standing with Effy. PLATFORM-OWNED — never derived from a token claim. */
export type CustomerStatus = "active" | "barred";

/**
 * The platform's own record of a customer — distinct from their Cognito credential, and
 * authoritative for the access decision (FR-025).
 *
 * A `barred` customer is refused no matter how valid their credential is. That is the whole
 * point of holding our own record: the claim is the ORIGIN of identity, the record is the
 * AUTHORITY on access.
 *
 * Note there is no `role` here, and none is coming: the customer pool defines no RBAC groups
 * (constitution Principle IV). That is also a token-size safety measure — id + access + refresh
 * cookies already run to ~4.5 KB against a ~4 KB browser limit, and a fattened claim set would
 * silently truncate the session.
 */
export interface CustomerDTO {
  id: string;
  /** The verified email. It is the identity key across every credential route. */
  email: string;

  /**
   * First and last name, captured AT REGISTRATION (FR-009a) and mapped 1:1 onto Cognito's standard
   * `given_name` / `family_name` attributes — so they ride on the ID token with no custom claim.
   *
   * Two fields, not one: a delivery label, an order confirmation and a support conversation all need
   * the parts, and a single free-text name cannot be split back into them reliably (ask anyone with
   * two surnames, or one name). Captured at source; never inferred.
   *
   * Nullable because the FEDERATED route supplies whatever the provider asserts, and may assert
   * neither. The platform must not invent a name it was never given.
   */
  givenName: string | null;
  familyName: string | null;

  status: CustomerStatus;

  /**
   * Does this account have a password? (012 FR-013.)
   *
   * ⚠ THE PLATFORM MUST HOLD THIS ITSELF, because Cognito cannot be asked. There is no API that
   * reports whether a user has a password: `AdminGetUser` does not return it, and `UserStatus` does
   * not distinguish it — a passwordless CONFIRMED user and an email+password CONFIRMED user are
   * identical on the wire (research R5).
   *
   * ⚠ AND IT IS THE ONLY THING THE ACCOUNT PAGE MAY BRANCH ON. Never branch on "how did they sign
   * in": a Google-LINKED customer is an ordinary native user and CAN hold a password. Inferring
   * from the sign-in route would show the wrong control to a real cohort.
   */
  hasPassword: boolean;

  /**
   * When the password last changed. `null` means NEVER — which is a legitimate, complete, permanent
   * state for an email-OTP customer, not a missing value and not an incomplete profile (FR-015).
   */
  passwordUpdatedAt: string | null;

  createdAt: string;
}

/**
 * What a customer may change about themselves (FR-026).
 *
 * `email` is deliberately absent: changing it is an identity operation, and a customer who can
 * rewrite their own email can walk onto another customer's record (the well-known Cognito
 * takeover). `status` is absent because it is platform-owned. `hasPassword` is absent because it is
 * a CONSEQUENCE of the password endpoints, never an input to them.
 */
export interface UpdateCustomerDTO {
  givenName: string | null;
  familyName: string | null;
}

/** How a customer proved who they are. Telemetry + UI only — never an authorization input. */
export type CredentialRoute = "password" | "otp" | "google";

// ── Password (012) ────────────────────────────────────────────────────────────────────────────

/**
 * THE MINIMUM PASSWORD LENGTH — 12.
 *
 * A deliberate, documented deviation from NIST SP 800-63B-4, which sets the floor at 15 for a
 * password used as a SINGLE factor (which Effy's is — there is no second factor). 15 was judged too
 * costly on a storefront where a password is an OPTIONAL convenience: a customer who finds it
 * onerous can simply keep using the emailed code, which is the safer route anyway.
 *
 * ⚠ THE DEVIATION IS ONLY DEFENSIBLE WHILE BREACH SCREENING AND RATE LIMITING BOTH HOLD. If either
 * is ever removed, this number must go back up. That conditional is not decoration — it is the
 * whole basis on which 12 was chosen over 15 (spec Clarifications, research R8).
 *
 * NO COMPOSITION RULES accompany it (no required symbol/digit/mixed case). Current guidance is that
 * they are actively harmful: they push people to `Password1!` and buy nothing.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * The length rule, shared by the browser (for instant feedback) and the Lambda (for enforcement).
 *
 * ⚠ THE BROWSER'S COPY IS A COURTESY, NOT A CONTROL. A crafted request ignores it entirely. The
 * backend runs this too — and additionally runs the breach check, which lives ONLY on the backend
 * precisely so that it cannot be skipped by a hostile client (research R9).
 */
export function checkPasswordPolicy(password: string): { ok: true } | { ok: false; reason: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: `Use at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  return { ok: true };
}

/** Setting a FIRST password. The `code` is what pays for it (FR-017) — a session alone may not. */
export interface SetPasswordDTO {
  mode: "set";
  /** The step-up code, emailed to the account's verified address at the time of the request. */
  code: string;
  newPassword: string;
}

/** Changing an EXISTING password. Cognito verifies `currentPassword` itself (FR-016). */
export interface ChangePasswordDTO {
  mode: "change";
  currentPassword: string;
  newPassword: string;
}

export type PasswordWriteDTO = SetPasswordDTO | ChangePasswordDTO;

/** Recovery confirm — the "forgot password" completion, moved behind the backend (FR-022b). */
export interface ResetConfirmDTO {
  email: string;
  code: string;
  newPassword: string;
}

/**
 * The step-up challenge result. It carries a MASKED destination and nothing else — never the full
 * address (an information leak) and obviously never the code.
 */
export interface PasswordChallengeResultDTO {
  /** e.g. `j•••@example.com` */
  maskedDestination: string;
}

/**
 * What the storefront must do after a successful password write.
 *
 * `allSessionsRevoked` is always true (FR-024): Cognito's revocation is all-or-nothing, so a
 * password change ends EVERY session, including the one that made it. The customer is returned to
 * sign-in to prove the new password. See research R7 — and note the window is not zero.
 */
export interface PasswordWriteResultDTO {
  customer: CustomerDTO;
  allSessionsRevoked: true;
}
