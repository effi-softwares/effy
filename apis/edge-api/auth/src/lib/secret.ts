/**
 * The HMAC key, fetched once per container through the secrets extension. Memoised, so a rotation
 * applies at the next cold start and in-flight codes fail: do not rotate during a sign-in spike.
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
    throw new Error("secret fetch failed");
  }

  const body = (await response.json()) as { SecretString?: string };
  const raw = body.SecretString;
  if (!raw) throw new Error("secret is empty");

  // Stored either as a bare string or as `{"key":"..."}`.
  let value = raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed?.["key"] === "string") value = parsed["key"] as string;
  } catch {
  }

  cached = value;
  return value;
}

export function resetSecretForTests(): void {
  cached = undefined;
}
