// DB credential retrieval at RUNTIME via the AWS Parameters and Secrets Lambda
// Extension (research C6): the password never enters the CloudFormation template or
// the env — only its ARN does. The extension listens on localhost:2773 and caches
// with a TTL; we additionally memoize in module scope beside the pg pool, and expose
// invalidate() for the rotation-retry path (28P01 → drop memo + pool → refetch once).
const EXTENSION_URL = "http://localhost:2773/secretsmanager/get";

let memo: string | undefined;

export async function getDbPassword(): Promise<string> {
  if (memo !== undefined) return memo;

  const arn = process.env.DB_SECRET_ARN;
  if (!arn) throw new Error("secrets: DB_SECRET_ARN is not set");
  const token = process.env.AWS_SESSION_TOKEN;
  if (!token) throw new Error("secrets: AWS_SESSION_TOKEN missing (extension auth header)");

  const res = await fetch(`${EXTENSION_URL}?secretId=${encodeURIComponent(arn)}`, {
    headers: { "X-Aws-Parameters-Secrets-Token": token },
  });
  if (!res.ok) {
    // Status only — never the response body, which could carry secret material.
    throw new Error(`secrets: extension returned ${res.status}`);
  }

  const payload = (await res.json()) as { SecretString?: string };
  if (!payload.SecretString) throw new Error("secrets: empty SecretString");

  // The RDS-managed master secret is JSON: {"username": "...", "password": "..."}.
  const parsed = JSON.parse(payload.SecretString) as { password?: string };
  if (!parsed.password) throw new Error("secrets: secret JSON has no password field");

  memo = parsed.password;
  return memo;
}

export function invalidateDbPassword(): void {
  memo = undefined;
}

// Generic secret-string fetch via the same extension (050 — the notifications worker's FCM
// service-account JSON). Returns the raw SecretString; the caller parses it. Memoized per ARN.
const secretMemo = new Map<string, string>();

export async function getSecretString(arn: string): Promise<string> {
  const cached = secretMemo.get(arn);
  if (cached !== undefined) return cached;

  const token = process.env.AWS_SESSION_TOKEN;
  if (!token) throw new Error("secrets: AWS_SESSION_TOKEN missing (extension auth header)");

  const res = await fetch(`${EXTENSION_URL}?secretId=${encodeURIComponent(arn)}`, {
    headers: { "X-Aws-Parameters-Secrets-Token": token },
  });
  if (!res.ok) throw new Error(`secrets: extension returned ${res.status}`);

  const payload = (await res.json()) as { SecretString?: string };
  if (!payload.SecretString) throw new Error("secrets: empty SecretString");

  secretMemo.set(arn, payload.SecretString);
  return payload.SecretString;
}
