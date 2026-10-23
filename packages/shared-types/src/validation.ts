/**
 * Shared input-shape rules, so the storefront refuses exactly what the backend refuses (a client
 * stricter than the server is a bug; a looser one emails an address that cannot exist).
 */

/** A length bound before any work: RFC 5321 caps a path at 254 octets. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Deliberately permissive (a strict RFC 5322 regex is huge and still wrong): it catches typos and junk
 * before anything is sent. The `[^\s@.]+` before the dot makes a dot in the domain mandatory, refusing
 * `person@example`, which the browser's `type="email"` accepts.
 */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Does this look like an address worth sending to? Well-formedness only, never existence (that would be
 * an account-existence oracle). Trims first: pasted whitespace is not a mistake.
 */
export function isEmailShape(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 && trimmed.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(trimmed)
  );
}
