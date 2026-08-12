/**
 * Shared input-shape rules (044).
 *
 * ⚠ THIS IS AN EXTRACTION, NOT A NEW RULE. Both values below were already enforced by
 * `apis/edge-api/customer/src/newsletter/service.ts`, where they were declared privately. They are
 * here so the storefront can refuse **exactly** what the backend refuses — a client that holds a
 * stricter opinion than the server is a bug the customer cannot work around, and a client that holds
 * a looser one is how a code gets emailed to an address that cannot exist (044 D-08).
 *
 * Constitution Principle II: a cross-cutting rule has ONE definition. Copy-pasting this regex into
 * `app/(auth)/` is the shape in which the newsletter and the sign-in screen quietly end up
 * disagreeing about what a valid address is.
 */

/**
 * ⚠ A LENGTH BOUND BEFORE ANY WORK. RFC 5321 caps a path at 254 octets; anything longer is not an
 * address, and accepting it would let a caller push arbitrary megabytes through the validator and
 * into a query parameter.
 */
export const EMAIL_MAX_LENGTH = 254;

/**
 * ⚠ DELIBERATELY PERMISSIVE, and that is the correct trade. A strict RFC 5322 regex is famously
 * ~6 KB long, still wrong, and rejects addresses that genuinely exist. The real validation is the
 * message itself: an address that cannot receive mail never confirms and never signs in. This check
 * exists to catch typing mistakes and obvious junk **before any work is done and before anything is
 * sent**.
 *
 * ⚠ The `[^\s@.]+` before the dot is the load-bearing part: it makes a dot in the domain MANDATORY,
 * which is what refuses `person@example` — an address the browser's own `type="email"` rule accepts,
 * and the one that produced 044's headline defect (a shopper parked on a code screen for a mailbox
 * that cannot exist, with nothing on the platform able to tell them why).
 */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Does this look like an address worth sending to?
 *
 * ⚠ IT ANSWERS "IS THIS WELL-FORMED", NEVER "DOES THIS EXIST". A well-formed address with no account
 * behind it MUST pass — refusing it would turn this function into an account-existence oracle and
 * spend the enumeration defence 035 built (044 FR-044).
 *
 * Trims before testing: people paste addresses with whitespace around them, and that is a formatting
 * artefact rather than a mistake worth refusing.
 */
export function isEmailShape(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 && trimmed.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(trimmed)
  );
}
