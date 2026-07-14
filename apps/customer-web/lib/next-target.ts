/**
 * The `?next=` destination validator (FR-020, FR-022).
 *
 * When a guest is asked to sign in at the point of ordering, we carry their intended
 * destination through the sign-in and send them back to it afterwards. That parameter is
 * ATTACKER-CONTROLLED — it arrives in a URL anyone can craft and send to anyone.
 *
 * The bug this prevents is an OPEN REDIRECT: `/sign-in?next=https://evil.example/login` gets
 * the customer a real Effy sign-in page, then lands them on a convincing fake — with the
 * referrer proving they just came from us. It is the single most common vulnerability in
 * exactly this feature, which is why the validation lives in one tested function rather than
 * being re-derived at each call site.
 *
 * The rule is a strict allowlist, not a blocklist: we accept ONLY a same-origin relative path.
 * If anything at all is off, we return the fallback rather than trying to sanitize — a
 * redirect target we do not fully understand is one we do not use.
 */

const FALLBACK = "/"

export function safeNextTarget(
  next: string | null | undefined,
  fallback: string = FALLBACK,
): string {
  if (!next) return fallback

  // Percent-encoding is the standard evasion (`%2f%2fevil.com`, `%09//evil.com`). Decode
  // before inspecting — and if the input is malformed enough that decoding throws, that alone
  // is disqualifying.
  let candidate: string
  try {
    candidate = decodeURIComponent(next)
  } catch {
    return fallback
  }

  // Control characters and whitespace are used to smuggle a scheme past naive checks
  // (`\t/\tevil.com`, `java\nscript:`). Nothing legitimate contains them.
  if (/[\x00-\x20\x7f]/.test(candidate)) return fallback

  // Must be a path. This single check rejects every absolute URL — `https://evil.com`,
  // `//evil.com` (protocol-relative, the one people forget), `javascript:...`, `data:...`.
  if (!candidate.startsWith("/")) return fallback

  // `//evil.com` and `/\evil.com` are protocol-relative URLs, NOT paths. Browsers treat both
  // as absolute. This is the check that most hand-rolled validators miss.
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback

  // Belt and braces: parse it against a throwaway origin and confirm nothing escaped.
  try {
    const url = new URL(candidate, "https://effy.invalid")
    if (url.origin !== "https://effy.invalid") return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
