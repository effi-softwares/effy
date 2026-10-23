// DB credentials at runtime through the Parameters and Secrets Lambda Extension: the password never
// enters the template or the env, only its ARN. Memoised beside the pool; invalidate serves the
// rotation retry (28P01: drop memo and pool, refetch once).
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
    // Status only: the body could carry secret material.
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

// A raw SecretString through the same extension, memoised per ARN; the caller parses it.
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

/** Drops one memoised secret. The payment webhook calls it when a signature fails, so a warm container picks up a replaced signing secret. */
export function invalidateSecret(arn: string): void {
  secretMemo.delete(arn);
}
