// 089 — a package's code and the token printed on its label (driver backlog H1).
//
// ⚠ ONE DEFINITION. The database generates codes from the same alphabet
// (`db/migrations/20261016150000_package_code.sql`, pinned by `package-code.test.ts`); the shop console
// prints the token; the driver app (H5) will parse it with a Kotlin twin pinned to the same rules.

/** No look-alikes: no 0/O, no 1/I/L, no U. A code is read aloud and typed off a wet bag. */
export const PACKAGE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

export const PACKAGE_CODE_LENGTH = 6

/** What every Effy package label encodes before the code — so a product's own barcode never matches. */
export const PACKAGE_TOKEN_PREFIX = "EFY1:"

const CODE = new RegExp(`^[${PACKAGE_CODE_ALPHABET}]{${PACKAGE_CODE_LENGTH}}$`)

export function isPackageCode(value: string): boolean {
  return CODE.test(value)
}

/** The value a label's QR code and barcode carry: `EFY1:7K3Q9M`. */
export function packageToken(code: string): string {
  if (!isPackageCode(code)) throw new Error(`not a package code: ${code}`)
  return `${PACKAGE_TOKEN_PREFIX}${code}`
}

/**
 * The package code a scan read, or null for anything that is not an Effy package label (a product's
 * EAN, a courier's barcode, a misread). Surrounding whitespace — what a keyboard-style scanner sends —
 * is ignored; nothing else is forgiven.
 */
export function parsePackageToken(read: string): string | null {
  const s = read.trim()
  if (!s.startsWith(PACKAGE_TOKEN_PREFIX)) return null
  const code = s.slice(PACKAGE_TOKEN_PREFIX.length)
  return isPackageCode(code) ? code : null
}
