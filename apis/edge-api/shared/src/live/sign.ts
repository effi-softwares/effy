import { createHash, createHmac } from "node:crypto";

/**
 * Signs one publish request (SigV4) with `node:crypto`: the request has a fixed shape, and the sdk's
 * signer is only a transitive dependency. `sign.test.ts` pins it to the sdk's output.
 */

export interface SigningCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const SERVICE = "appsync";

const sha256 = (data: string): string => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

/** Basic ISO 8601 with no milliseconds, e.g. `20261005T031244Z`. */
function amzDate(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function signPublish(
  host: string,
  body: string,
  region: string,
  credentials: SigningCredentials,
  now: Date = new Date(),
): SignedRequest {
  const timestamp = amzDate(now);
  const date = timestamp.slice(0, 8);

  // Header names lower-case and in byte order — both required of the canonical form.
  const bodyHash = sha256(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": timestamp,
  };
  if (credentials.sessionToken) headers["x-amz-security-token"] = credentials.sessionToken;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = ["POST", "/event", "", canonicalHeaders, signedHeaders, bodyHash].join("\n");
  const scope = `${date}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256(canonicalRequest)].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, date), region), SERVICE),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    url: `https://${host}/event`,
    body,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}
