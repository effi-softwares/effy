// Secret retrieval at RUNTIME via the AWS Parameters and Secrets Lambda Extension (research C6):
// the value never enters the CloudFormation template or the env — only its ARN does. The extension
// listens on localhost:2773 and caches with a TTL; we additionally memoize in module scope, and
// expose invalidate() for the DB rotation-retry path (28P01 → drop memo + pool → refetch once).
//
// ⚠ GENERALISED FROM getDbPassword ALONE (042). A second caller needed a secret that is not the
// database password, and the honest choice was between copying twenty lines of extension protocol
// into another file or promoting them here. Principle II settles that: this is shared infrastructure,
// and two copies of a secret-fetching path is exactly the shape that ends up with one of them missing
// a fix. `getDbPassword` now reads its own secret through the generic function below and adds only
// the part that is genuinely specific to it — the RDS JSON envelope.
const EXTENSION_URL = "http://localhost:2773/secretsmanager/get";

/** Memoized per ARN — one Lambda container may legitimately hold more than one secret. */
const memo = new Map<string, string>();

/**
 * The raw `SecretString` for an ARN.
 *
 * ⚠ Errors carry the STATUS ONLY, never the response body, which could contain secret material. That
 * rule predates this generalisation and is the reason it is restated here rather than assumed.
 */
export async function getSecretString(arn: string): Promise<string> {
  const cached = memo.get(arn);
  if (cached !== undefined) return cached;

  const token = process.env.AWS_SESSION_TOKEN;
  if (!token) throw new Error("secrets: AWS_SESSION_TOKEN missing (extension auth header)");

  const res = await fetch(`${EXTENSION_URL}?secretId=${encodeURIComponent(arn)}`, {
    headers: { "X-Aws-Parameters-Secrets-Token": token },
  });
  if (!res.ok) {
    throw new Error(`secrets: extension returned ${res.status}`);
  }

  const payload = (await res.json()) as { SecretString?: string };
  if (!payload.SecretString) throw new Error("secrets: empty SecretString");

  memo.set(arn, payload.SecretString);
  return payload.SecretString;
}

export async function getDbPassword(): Promise<string> {
  const arn = process.env.DB_SECRET_ARN;
  if (!arn) throw new Error("secrets: DB_SECRET_ARN is not set");

  // The RDS-managed master secret is JSON: {"username": "...", "password": "..."}.
  const parsed = JSON.parse(await getSecretString(arn)) as { password?: string };
  if (!parsed.password) throw new Error("secrets: secret JSON has no password field");
  return parsed.password;
}

export function invalidateDbPassword(): void {
  const arn = process.env.DB_SECRET_ARN;
  if (arn) memo.delete(arn);
}
