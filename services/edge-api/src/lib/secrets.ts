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
