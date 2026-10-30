import type { CustomerDTO, PasswordWriteDTO } from "@effy/shared-types"
import { checkPasswordPolicy } from "@effy/shared-types"
import { BreachCheckUnavailableError, isPasswordBreached } from "@effy/edge-shared"

import { toDTO, type CustomerRow } from "../customer/model"
import { findByCognitoSub, markPasswordSet, markPasswordSetByEmail } from "../customer/repo"
import * as cognito from "./cognito"
import { notifyPasswordChanged } from "./notify"

/** Whether a password may be written. Handlers parse; `cognito.ts` talks to AWS. */

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PasswordPolicyError"
  }
}
/** The wrong mode for the account's state. */
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

async function requireActive(cognitoSub: string): Promise<CustomerRow> {
  const row = await findByCognitoSub(cognitoSub)
  if (!row) throw new CustomerNotFoundError()
  // A valid credential is not permission: the record decides.
  if (row.status !== "active") throw new CustomerBarredError()
  // Nor inside the closure grace window.
  if (row.closure_state === "closing") throw new CustomerBarredError()
  return row
}

/**
 * Run before Cognito: the cheap length rule first, then the breach check, which fails closed (a
 * password is optional on Effy, so an outage costs nobody their sign-in).
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

/** Grants nothing and stores nothing; the code matters only when it comes back with the new password. */
export async function sendPasswordChallenge(
  cognitoSub: string,
  accessToken: string,
): Promise<{ maskedDestination: string }> {
  const row = await requireActive(cognitoSub)

  // Refused when the flow does not apply.
  if (row.has_password) {
    throw new WrongModeError("this account already has a password")
  }

  const destination = await cognito.sendEmailVerificationCode(accessToken)
  return { maskedDestination: destination ?? mask(row.email) }
}

/**
 * In `set`, the code is verified before the password is written, in one request: there is no stored
 * step-up grant to steal.
 */
export async function writePassword(
  cognitoSub: string,
  accessToken: string,
  input: PasswordWriteDTO,
): Promise<CustomerDTO> {
  const row = await requireActive(cognitoSub)

  // The rules first, before any credential state is touched.
  await assertPasswordAcceptable(input.newPassword)

  if (input.mode === "set") {
    if (row.has_password) {
      throw new WrongModeError("this account already has a password - change it instead")
    }

    // Prove the inbox (throws CodeMismatch/ExpiredCode → 400).
    await cognito.verifyEmailCode(accessToken, input.code)

    // Only now. No `PreviousPassword`: there is none.
    await cognito.unsafeSetFirstPassword(accessToken, input.newPassword)
  } else {
    if (!row.has_password) {
      throw new WrongModeError("this account has no password - set one instead")
    }

    // Cognito verifies the current password itself.
    await cognito.changePassword(accessToken, input.currentPassword, input.newPassword)
  }

  // Every session, every device, this one included.
  await cognito.globalSignOut(accessToken)

  const updated = await markPasswordSet(cognitoSub)
  if (!updated) throw new CustomerNotFoundError()

  // Fire-and-forget: the change is committed and cannot be unwound.
  await notifyPasswordChanged({ to: row.email, isFirstPassword: input.mode === "set" })

  return toDTO(updated)
}

/** Unauthenticated (the caller proves the inbox). Must not disclose whether an email is registered. */
export async function confirmRecovery(input: {
  clientId: string
  email: string
  code: string
  newPassword: string
}): Promise<void> {
  await assertPasswordAcceptable(input.newPassword)

  await cognito.confirmForgotPassword(input.clientId, input.email, input.code, input.newPassword)

  // The only moment the platform learns a password exists. Keyed on email: recovery has no `sub`.
  const row = await markPasswordSetByEmail(input.email)

  // No row is not an error: the credential already changed, and the next authenticated request creates it.
  if (row) {
    await notifyPasswordChanged({ to: row.email, isFirstPassword: true })
  }
}

/** `janith@example.com` → `j•••@example.com`. */
function mask(email: string): string {
  const at = email.indexOf("@")
  if (at <= 0) return "•••"
  return `${email[0]}•••${email.slice(at)}`
}
