/**
 * The HMAC key, fetched once per container from the Parameters-and-Secrets Lambda extension.
 *
 * Same mechanism as `@effy/edge-shared`'s `secrets.ts`: the extension serves a local HTTP endpoint
 * and handles caching and rotation, so a warm invocation pays nothing. ⚠ That matters here more
 * than elsewhere — every millisecond spent on this comes out of Cognito's 5-second budget, which
 * `createAuthChallenge` already shares with an SES send.
 *
 * ⚠ The key is memoised in module scope. Rotating the secret therefore takes effect on the next
 * cold start rather than immediately, and any code in flight at that moment fails to verify.
 * Acceptable for a 5-minute secret — but do not rotate during a sign-in spike.
 */

const EXTENSION_ENDPOINT = "http://localhost:2773/secretsmanager/get";

let cached: string | undefined;

export async function hmacKey(): Promise<string> {
  if (cached) return cached;

  const arn = process.env.OTP_HMAC_SECRET_ARN;
  if (!arn) throw new Error("OTP_HMAC_SECRET_ARN is not configured");

  const token = process.env.AWS_SESSION_TOKEN;
  if (!token) throw new Error("AWS_SESSION_TOKEN is not available");

  const response = await fetch(`${EXTENSION_ENDPOINT}?secretId=${encodeURIComponent(arn)}`, {
    headers: { "X-Aws-Parameters-Secrets-Token": token },
  });
  if (!response.ok) {
    // Infrastructure failure, not user data — but still no detail that could reach a caller.
    throw new Error("secret fetch failed");
  }

  const body = (await response.json()) as { SecretString?: string };
  const raw = body.SecretString;
  if (!raw) throw new Error("secret is empty");

  // The secret may be stored as a bare string or as `{"key":"..."}`. Accept both so the operator
  // is not forced into one shape by this code.
  let value = raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed?.["key"] === "string") value = parsed["key"] as string;
  } catch {
    // Bare string — use as-is.
  }

  cached = value;
  return value;
}

/** Test seam. */
export function resetSecretForTests(): void {
  cached = undefined;
}
