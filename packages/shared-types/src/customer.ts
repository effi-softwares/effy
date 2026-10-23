/** Customer audience contracts, imported by customer-web and the customer service; mirrored by the customer app. */

import type { WireInt } from "./cart";

/** A customer's standing with Effy: platform-owned, never derived from a token claim. */
export type CustomerStatus = "active" | "barred";

/** Where a customer is in closure. `"closing"`: the grace window is running and every request is refused except restore. */
export type ClosureState = "open" | "closing";

/**
 * The platform's own record of a customer, authoritative for access: a `barred` customer is refused
 * whatever their credential. No `role`: the customer pool has no groups (which also keeps the session
 * cookies under the browser's size limit).
 */
export interface CustomerDTO {
  id: string;
  /** The verified email: the identity key across every credential route. */
  email: string;

  /**
   * First and last name, captured at registration and mapped onto Cognito's `given_name` /
   * `family_name`. Nullable: a federated provider may assert neither, and no name is invented.
   */
  givenName: string | null;
  familyName: string | null;

  /**
   * A self-asserted contact phone, never verified: never shown with a verified mark and never accepted by
   * any identity or recovery path (so there is no `phoneVerified`). Distinct from `AddressDTO.phone`, the
   * per-address delivery contact; neither overrides the other.
   */
  phone: string | null;

  status: CustomerStatus;

  /**
   * Has this customer asked to be deleted? Not a value of `status`, which is a platform sanction the
   * customer cannot influence (a customer can be barred and closing). No `"closed"`: erasure removes the row.
   */
  closureState: ClosureState;

  /**
   * Does this account have a password? The platform holds it because Cognito cannot be asked. The account
   * page branches on this only, never on how the customer signed in.
   */
  hasPassword: boolean;

  /** When the password last changed; `null` means never, a complete state for an email-code customer. */
  passwordUpdatedAt: string | null;

  /**
   * How reliably the platform can reach this email. Authenticated surfaces only: on a sign-in screen it
   * would reveal whether an address has an account. `"reachable"` when nothing is known. No reason or
   * diagnostic (those stay in back-office).
   */
  emailDelivery: EmailDeliveryState;

  createdAt: string;
}

/**
 * The platform's conclusion about reaching an address, from per-message outcomes (a successful
 * `SendEmail` proves nothing):
 * - `reachable` the last outcome was a delivery, or nothing is known.
 * - `soft_failing` a transient failure; informational, gates nothing.
 * - `undeliverable` a permanent failure; a lockout for the passwordless audiences.
 * - `complained` marked as spam; surfaced, but never bars sign-in (it usually means someone typed
 *  a stranger's address).
 */
export type EmailDeliveryState =
  | "reachable"
  | "soft_failing"
  | "undeliverable"
  | "complained";

/**
 * What a customer may change about themselves. No `email` (an identity operation), `status`
 * (platform-owned), `hasPassword` (a consequence of the password routes) or `closureState` (only the
 * closure routes write it, after a fresh code).
 */
export interface UpdateCustomerDTO {
  givenName: string | null;
  familyName: string | null;

  /** Send `""` to clear, never `null`: the mobile client drops nulls, so `null` reads as "not sent". */
  phone: string | null;
}

/** How a customer proved who they are. Telemetry and UI only, never an authorization input. */
export type CredentialRoute = "password" | "otp" | "google";

// Password

/**
 * The minimum password length. NIST sp 800-63B-4 says 15 for a single factor; 12 is defensible only
 * because the password is optional and breach screening and rate limiting both hold. If either goes,
 * this goes back up. No composition rules.
 */
export const PASSWORD_MIN_LENGTH = 12;

/** The length rule, shared by the browser (feedback) and the backend (enforcement, plus the breach check). */
export function checkPasswordPolicy(password: string): { ok: true } | { ok: false; reason: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: `Use at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  return { ok: true };
}

/** Setting a first password: the code pays for it; a session alone may not. */
export interface SetPasswordDTO {
  mode: "set";
  /** The step-up code, emailed to the account's verified address. */
  code: string;
  newPassword: string;
}

/** Changing an existing password; Cognito verifies `currentPassword`. */
export interface ChangePasswordDTO {
  mode: "change";
  currentPassword: string;
  newPassword: string;
}

export type PasswordWriteDTO = SetPasswordDTO | ChangePasswordDTO;

/** Completes "forgot password" through the backend. */
export interface ResetConfirmDTO {
  email: string;
  code: string;
  newPassword: string;
}

/** The step-up result: a masked destination only, never the address or the code. */
export interface PasswordChallengeResultDTO {
  /** e.g. `j•••@example.com` */
  maskedDestination: string;
}

/** After a password write every session is revoked (Cognito's revocation is all-or-nothing), this one included. */
export interface PasswordWriteResultDTO {
  customer: CustomerDTO;
  allSessionsRevoked: true;
}

// Account closure

/**
 * Why a customer cannot be deleted yet. Every blocker must say when it clears (`clearsAt` is
 * non-nullable): earlier rules left frequent shoppers permanently undeletable.
 */
export type ClosureBlockerKind =
  /** Checkout started, money not taken; the customer can resolve it in-app. */
  | "order_awaiting_payment"
  /** Paid, goods plausibly in transit; clears on fulfilment or after a short bound. */
  | "order_in_transit";

export interface ClosureBlockerDTO {
  kind: ClosureBlockerKind;
  /** Shopper-facing reference, e.g. `EFY-HVX2AE`. */
  reference: string;
  /** Where the customer goes to act on it (web). */
  href: string;
  /** The same destination as a closed vocabulary (mobile has no URL router). */
  target: { kind: "order"; id: string };
  /** Never null. */
  clearsAt: string;
  /** Whether the customer can act on it, or only wait. */
  resolvableByShopper: boolean;
}

/** A category of data kept after erasure, and why, carried as data so every surface states the same true reason. */
export interface RetainedCategoryDTO {
  category: string;
  reason: string;
}

/** Everything the customer sees before any irreversible step. Side-effect free. */
export interface ClosurePreviewDTO {
  /** Empty: closure may proceed. */
  blockers: ClosureBlockerDTO[];
  retained: RetainedCategoryDTO[];
  /** Advisory until a request actually exists. */
  eraseAfterIfRequestedNow: string;
  /** Present only when a request is already live. */
  activeRequest: { requestedAt: string; eraseAfter: string } | null;
  /** The points lost when closure becomes final, and their value, told before confirming. */
  pointsHeld?: WireInt;
  pointsValueAmount?: string;
}

/** The step-up challenge for closure (the password flow's masked-destination shape). */
export interface ClosureChallengeResultDTO {
  maskedDestination: string;
}

/** Confirming closure: the code pays for it; a session alone may not. */
export interface ClosureRequestDTO {
  code: string;
}

export interface ClosureResultDTO {
  /** The date the customer is now owed. */
  eraseAfter: string;
  allSessionsRevoked: true;
}

/**
 * Cancels a live closure during the grace window. An explicit call, never inferred from a read: the
 * gate would refuse it, and any holder of the token would un-delete the account by opening the app.
 */
export interface ClosureRestoreResultDTO {
  restoredAt: string;
}
