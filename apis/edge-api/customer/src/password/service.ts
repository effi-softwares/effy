import type { CustomerDTO, PasswordWriteDTO } from "@effy/shared-types"
import { checkPasswordPolicy } from "@effy/shared-types"
import { BreachCheckUnavailableError, isPasswordBreached } from "@effy/edge-shared"

import { toDTO, type CustomerRow } from "../customer/model"
import { findByCognitoSub, markPasswordSet, markPasswordSetByEmail } from "../customer/repo"
import * as cognito from "./cognito"
import { notifyPasswordChanged } from "./notify"

/**
 * THE PASSWORD DECISIONS (012 US3).
 *
 * Everything that decides *whether* a password may be written lives here, and it is unit-tested.
 * The handlers parse and translate; `cognito.ts` speaks to AWS. This file is the argument.
 */

// ── Failures the handlers translate into HTTP ─────────────────────────────────────────────────

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PasswordPolicyError"
  }
}
/** The account is in the wrong state for the requested mode (FR-014). */
export class WrongModeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WrongModeError"
  }
}
export class CustomerBarredError extends Error {
  constructor() {
    super("customer is barred")
    this.name = "CustomerBarredError"
  }
}
export class CustomerNotFoundError extends Error {
  constructor() {
    super("customer not found")
    this.name = "CustomerNotFoundError"
  }
}

// ── The gate every path passes through ────────────────────────────────────────────────────────

async function requireActive(cognitoSub: string): Promise<CustomerRow> {
  const row = await findByCognitoSub(cognitoSub)
  if (!row) throw new CustomerNotFoundError()
  // FR-034 — a valid credential is NOT permission. The record decides.
  if (row.status !== "active") throw new CustomerBarredError()
  return row
}

/**
 * The password rules (FR-022), run BEFORE Cognito is touched.
 *
 * Order matters for a boring but real reason: checking the cheap local rule first means a
 * too-short password never costs a network round trip to the breach service.
 *
 * ⚠ THE BREACH CHECK IS FAIL-CLOSED. If the service is unreachable we REFUSE the password rather
 * than wave it through. Affordable precisely because a password is OPTIONAL on Effy — a customer
 * blocked by a third-party outage can still sign in with an emailed code, which is the safer route
 * anyway. On a password-mandatory product this call would go the other way (research R8).
 */
async function assertPasswordAcceptable(password: string): Promise<void> {
  const policy = checkPasswordPolicy(password)
  if (!policy.ok) throw new PasswordPolicyError(policy.reason)

  try {
    if (await isPasswordBreached(password)) {
      throw new PasswordPolicyError(
        "That password has appeared in a public data breach. Please choose a different one.",
      )
    }
  } catch (err) {
    if (err instanceof BreachCheckUnavailableError) {
      throw new PasswordPolicyError(
        "We can't check that password's safety right now. Please try again in a few minutes.",
      )
    }
    throw err
  }
}

// ── The step-up challenge (FR-017) ────────────────────────────────────────────────────────────

/**
 * Send the code that setting a first password will cost.
 *
 * ⚠ THIS GRANTS NOTHING. It puts a code in an inbox. No state is created, no authority is minted,
 * nothing is stored — so there is nothing here for an attacker to steal or replay. The code is only
 * worth anything when presented back, together with a new password, in ONE request (see below).
 */
export async function sendPasswordChallenge(
  cognitoSub: string,
  accessToken: string,
): Promise<{ maskedDestination: string }> {
  const row = await requireActive(cognitoSub)

  // FR-014 — the customer must not be able to reach the flow that does not apply to them, and the
  // platform refuses it even if they contrive to submit it directly.
  if (row.has_password) {
    throw new WrongModeError("this account already has a password")
  }

  const destination = await cognito.sendEmailVerificationCode(accessToken)
  return { maskedDestination: destination ?? mask(row.email) }
}

// ── The write (FR-016 / FR-017) ───────────────────────────────────────────────────────────────

/**
 * Set or change the password.
 *
 * ⚠⚠ THE ORDER OF THE `set` BRANCH IS THE SECURITY OF THIS FEATURE. ⚠⚠
 *
 * The code is verified BEFORE the password is written. A session that cannot produce a valid code
 * NEVER REACHES the password write. That is SC-004, and it is the reason this function exists at
 * all — because Cognito, left to itself, will happily let a bare session set a password (see
 * `cognito.unsafeSetFirstPassword`).
 *
 * ⚠ AND NOTE WHAT IS NOT HERE: a stored "step-up grant".
 *
 * The obvious design verifies the code, mints a short-lived grant, and lets the customer post a
 * password against it. That grant is A NEW THING TO STEAL. Doing both in one request means there is
 * no interval during which "this session may now set a password" exists as state anywhere — not in
 * a row, not in a cookie, not in a token. FR-019 ("the authority MUST be short-lived and scoped to
 * that operation") is satisfied BY CONSTRUCTION, which is strictly better than satisfying it with a
 * TTL somebody has to remember to enforce.
 */
export async function writePassword(
  cognitoSub: string,
  accessToken: string,
  input: PasswordWriteDTO,
): Promise<CustomerDTO> {
  const row = await requireActive(cognitoSub)

  // The rules first — a bad password is refused before any credential state is touched.
  await assertPasswordAcceptable(input.newPassword)

  if (input.mode === "set") {
    if (row.has_password) {
      throw new WrongModeError("this account already has a password — change it instead")
    }

    // 1. PROVE THE INBOX. Throws CodeMismatch/ExpiredCode, which the handler maps to 400.
    //    Everything below this line is unreachable without a valid, fresh, single-use code.
    await cognito.verifyEmailCode(accessToken, input.code)

    // 2. Only now. `PreviousPassword` is omitted because there isn't one.
    await cognito.unsafeSetFirstPassword(accessToken, input.newPassword)
  } else {
    if (!row.has_password) {
      throw new WrongModeError("this account has no password — set one instead")
    }

    // Cognito verifies the current password itself and refuses with NotAuthorizedException (FR-016).
    await cognito.changePassword(accessToken, input.currentPassword, input.newPassword)
  }

  // FR-024 — every session, every device, including this one. All-or-nothing is all Cognito offers,
  // and the honest response was to make the requirement stronger rather than quietly drop it.
  await cognito.globalSignOut(accessToken)

  const updated = await markPasswordSet(cognitoSub)
  if (!updated) throw new CustomerNotFoundError()

  // FR-025. Fire-and-forget by design: the credential change is ALREADY COMMITTED and cannot be
  // unwound, so a mail failure must not be reported to the customer as a failed password change.
  await notifyPasswordChanged({ to: row.email, isFirstPassword: input.mode === "set" })

  return toDTO(updated)
}

// ── Recovery (FR-022b) ────────────────────────────────────────────────────────────────────────

/**
 * Complete "forgot password" — moved behind the backend in 012.
 *
 * ⚠ UNAUTHENTICATED. There is no session and no `sub`; the caller proves the INBOX instead, and
 * Cognito checks the code. That is the whole point of recovery.
 *
 * It exists here rather than in the browser because leaving it client-side caused two defects at
 * once (research R6):
 *
 *   1. It BYPASSED the breach screening. A rule enforced on the account page but not on the recovery
 *      page is not a rule; it is a detour sign.
 *   2. It CORRUPTED `has_password`. The platform never learned a password now existed, so the
 *      account page offered the wrong control forever after.
 *
 * ⚠ IT MUST NOT DISCLOSE WHETHER AN EMAIL IS REGISTERED. The pool runs
 * `prevent_user_existence_errors = ENABLED`; this route must not quietly undo that by answering
 * differently for a known and an unknown address.
 */
export async function confirmRecovery(input: {
  clientId: string
  email: string
  code: string
  newPassword: string
}): Promise<void> {
  await assertPasswordAcceptable(input.newPassword)

  await cognito.confirmForgotPassword(input.clientId, input.email, input.code, input.newPassword)

  // The customer now has a password, and this is the only moment the platform can learn it.
  // Keyed on email because recovery has no `sub` — see the warning on the repo function.
  const row = await markPasswordSetByEmail(input.email)

  // A missing row is NOT an error to surface: Cognito accepted the code, so the credential is
  // already changed. It would mean a customer exists in the pool with no platform record — which the
  // JIT upsert will create on their next authenticated request anyway. Do not leak, do not fail.
  if (row) {
    await notifyPasswordChanged({ to: row.email, isFirstPassword: true })
  }
}

/** `janith@example.com` → `j•••@example.com`. Never the full address (FR-017's response). */
function mask(email: string): string {
  const at = email.indexOf("@")
  if (at <= 0) return "•••"
  return `${email[0]}•••${email.slice(at)}`
}
