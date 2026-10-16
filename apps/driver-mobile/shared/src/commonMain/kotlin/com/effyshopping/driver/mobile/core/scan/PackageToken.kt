package com.effyshopping.driver.mobile.core.scan

/**
 * 090 — what a label read means: the package code it carries, or null for anything that is not an Effy
 * package label (a product's barcode, a courier's, a misread).
 *
 * ⚠ THE KOTLIN TWIN of `packages/shared-types/src/package-code.ts`. Both are tested against the same
 * rows (`package-code.fixtures.json`), so the phone and the platform can never disagree about a label.
 */
object PackageToken {
    /** No look-alikes: no 0/O, no 1/I/L, no U. */
    const val ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
    const val PREFIX = "EFY1:"
    private const val LENGTH = 6

    fun isCode(value: String): Boolean = value.length == LENGTH && value.all { it in ALPHABET }

    /** Surrounding whitespace — what a keyboard-style scanner sends — is ignored; nothing else is forgiven. */
    fun parse(read: String): String? {
        val s = read.trim()
        if (!s.startsWith(PREFIX)) return null
        val code = s.removePrefix(PREFIX)
        return code.takeIf(::isCode)
    }
}
