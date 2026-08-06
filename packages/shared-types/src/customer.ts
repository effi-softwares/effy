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
 * Where a customer sits in the closure lifecycle (034).
 *
 * `"closing"` means they asked to be deleted and the grace window is running. Every request is
 * refused while it holds — with exactly ONE exception, the explicit restore call (FR-041a).
 */
export type ClosureState = "open" | "closing";

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

  /**
   * A self-asserted contact phone (034 FR-060).
   *
   * ⚠ NEVER VERIFIED by feature 034, and that has two hard consequences (FR-060a): it MUST NOT be
   * rendered with a verified/confirmed indicator, and it MUST NOT be accepted by any identity,
   * recovery or authentication path. There is deliberately no `phoneVerified` companion — a field
   * whose only honest value is `false` is a trap, because someone will eventually render it as a
   * badge.
   *
   * ⚠ DISTINCT from `AddressDTO.phone`, which is the per-address DELIVERY contact a driver calls
   * (FR-060b). This one is a profile convenience; it does not override the address's, and nothing
   * copies one into the other. Two fields disagreeing about who to ring is worse than one gap.
   */
  phone: string | null;

  status: CustomerStatus;

  /**
   * Has this customer asked to be deleted? (034 FR-041.)
   *
   * ⚠ DELIBERATELY NOT a third value of `status`. `status` is a PLATFORM SANCTION, and its entire
   * safety property is that the customer cannot influence it; closure is the customer's OWN
   * decision. Collapsing them would make "barred AND closing" unrepresentable — and FR-049 requires
   * an answer to exactly that case.
   *
   * There is no `"closed"`: once erasure runs, the row is gone. A terminal state would be a row
   * every future read must remember to exclude.
   */
  closureState: ClosureState;

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

  /**
   * How reliably the platform can reach this account's email address (037 FR-030).
   *
   * ⚠ AUTHENTICATED SURFACES ONLY. This MUST NOT be exposed on any unauthenticated surface, and no
   * sign-in screen may branch on it. Delivery state is only knowable for an address the platform has
   * actually emailed, so disclosing it to whoever typed an address answers "does this address have an
   * Effy account?" — an enumeration oracle, and a direct regression against 035's phantom-send and
   * timing-parity defences. The unauthenticated escape hatch is UNIFORM instead (FR-030a).
   *
   * ⚠ Defaults to `"reachable"` when the platform holds no outcome for the address. Absence of
   * evidence is not evidence of failure, and the overwhelmingly common case is an address that has
   * simply never bounced.
   *
   * ⚠ There is deliberately no `reason` or `diagnostic` companion. Those are the receiving server's
   * own words, written for a postmaster — on an account page they are noise at best and alarming at
   * worst. They live in the back-office console, where an operator has asked for them.
   */
  emailDelivery: EmailDeliveryState;

  createdAt: string;
}

/**
 * The platform's conclusion about whether it can reach an address (037).
 *
 * Derived from per-message outcomes, never from a single send: `SendEmail` returns success and a
 * message id even for an address the mail service has permanently blocked, so "the call succeeded"
 * is not evidence of delivery.
 *
 * - `reachable`      — last outcome was a delivery, or nothing is known.
 * - `soft_failing`   — a transient failure (mailbox full, a delay, an out-of-office). Informational;
 *                      it gates nothing.
 * - `undeliverable`  — a PERMANENT failure. ⚠ For driver, shop and back-office this is a total
 *                      account lockout: email is their only credential and there is no fallback.
 * - `complained`     — the recipient marked a message as spam. ⚠ Recorded and surfaced, but it MUST
 *                      NOT bar anyone from signing in to their own account — a complaint usually
 *                      means someone typed a stranger's address into sign-in, and barring on it locks
 *                      out an account that stranger may legitimately own later (FR-031).
 */
export type EmailDeliveryState =
  | "reachable"
  | "soft_failing"
  | "undeliverable"
  | "complained";

/**
 * What a customer may change about themselves (FR-026).
 *
 * `email` is deliberately absent: changing it is an identity operation, and a customer who can
 * rewrite their own email can walk onto another customer's record (the well-known Cognito
 * takeover). `status` is absent because it is platform-owned. `hasPassword` is absent because it is
 * a CONSEQUENCE of the password endpoints, never an input to them.
 *
 * ⚠ `closureState` IS ABSENT FOR THE SAME REASON AS `status`, and the omission is load-bearing.
 * Closure is written only by the closure endpoints, after a freshly issued verification code. A
 * profile PATCH must never be able to open or close an account — it would turn a routine name edit
 * into an un-delete, and it would bypass the proof-of-control FR-043 exists to demand.
 */
export interface UpdateCustomerDTO {
  givenName: string | null;
  familyName: string | null;

  /**
   * ⚠ Send `""` to CLEAR it, never `null`.
   *
   * The mobile client serialises with `explicitNulls = false`, which drops nulls from the payload
   * entirely — so a `null` phone is indistinguishable from "field not sent" and the clear silently
   * no-ops. The backend maps `""` → `NULL`, on the identical path the name parts already use.
   */
  phone: string | null;
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

// ── Account closure / deletion (034) ──────────────────────────────────────────────────────────

/**
 * Why a customer cannot be deleted yet (034 FR-042).
 *
 * ⚠ THIS REQUIREMENT HAS BEEN WRONG TWICE, so the shape encodes the lesson rather than trusting a
 * comment. First it blocked on any non-terminal order — but an order's only terminal state is a
 * fulfilment reaching `collected`, which ships behind a dev-only stub with no route in any
 * environment, so EVERY customer who had ever paid became permanently undeletable. The fix bounded
 * it at 30 days, matched to the grace period — and that was the same dead end in disguise, because
 * Effy is a WEEKLY-RE-BUY grocery platform: a shopper who buys every week is always within 30 days
 * of an order, so the platform's most engaged customers still could never delete.
 *
 * Hence `clearsAt` is NON-NULLABLE: a blocker that cannot say when it ends is unrepresentable, not
 * merely discouraged.
 */
export type ClosureBlockerKind =
  /** Checkout started, money not taken. The customer resolves this themselves, in-app. */
  | "order_awaiting_payment"
  /** Paid, goods plausibly still in transit. Clears on fulfilment or after a short bound. */
  | "order_in_transit";

export interface ClosureBlockerDTO {
  kind: ClosureBlockerKind;
  /** Shopper-facing reference, e.g. `EFY-HVX2AE`. */
  reference: string;
  /** Where the customer goes to act on it — FR-042's "direct route". Web routes on this. */
  href: string;
  /** The same destination in the closed vocabulary mobile needs, having no URL router. */
  target: { kind: "order"; id: string };
  /** ⚠ NEVER null. FR-042 forbids a block that cannot state its own end. */
  clearsAt: string;
  /** Can the customer act on it, or only wait? Both are acceptable; a dead end is not. */
  resolvableByShopper: boolean;
}

/**
 * A category of data kept after erasure, and why (FR-045).
 *
 * ⚠ The reason is carried as data, not hardcoded per surface, because SC-010 requires every claim in
 * the disclosure to be TRUE of the built system — and Apple has demanded that developers cite the
 * specific law behind a retention claim. One source, two surfaces, no drift.
 */
export interface RetainedCategoryDTO {
  category: string;
  reason: string;
}

/** Everything the customer must see BEFORE any irreversible step (FR-040). Side-effect free. */
export interface ClosurePreviewDTO {
  /** Empty ⇒ closure may proceed. */
  blockers: ClosureBlockerDTO[];
  retained: RetainedCategoryDTO[];
  /** Advisory until a request actually exists. */
  eraseAfterIfRequestedNow: string;
  /** Present only when a request is already live. */
  activeRequest: { requestedAt: string; eraseAfter: string } | null;
}

/** The step-up challenge for closure — the same masked-destination shape the password flow uses. */
export interface ClosureChallengeResultDTO {
  maskedDestination: string;
}

/** Confirming closure. The code is what pays for it (FR-043); a valid session alone may not. */
export interface ClosureRequestDTO {
  code: string;
}

export interface ClosureResultDTO {
  /** The date the customer is now owed (FR-040). */
  eraseAfter: string;
  allSessionsRevoked: true;
}

/**
 * Cancelling a live closure request during the grace window (FR-041a).
 *
 * ⚠ RESTORE IS AN EXPLICIT CALL, never an inference from an authenticated read. Making it implicit
 * is unimplementable — the refusal and the restore run through the SAME identity lookup, so the gate
 * would refuse the very request meant to restore — and unsafe, because anyone holding the customer's
 * token during the window would silently un-delete the account merely by opening the app.
 */
export interface ClosureRestoreResultDTO {
  restoredAt: string;
}
