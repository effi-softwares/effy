/**
 * The per-address hourly send counter: the only persisted state of sign-in (the code is never stored,
 * and attempts come from Cognito's `session[]`). DynamoDB rather than Postgres: the sign-in path must
 * not depend on the dev database's public endpoint or a 5 s connection acquire. Tests mock this module.
 */

import { createHmac } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { OTP_SENDS_PER_HOUR } from "./policy.js";

const WINDOW_SECONDS = 3600;
/** Two hours against a one-hour window. TTL deletion is not prompt, so the window is always recomputed. */
const TTL_SECONDS = WINDOW_SECONDS * 2;

let doc: DynamoDBDocumentClient | undefined;

/** Module scope (Cognito's 5 s budget). */
function client(): DynamoDBDocumentClient {
  doc ??= DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return doc;
}

/** The address is hashed into the key, never stored. */
function partitionKey(userPoolId: string, email: string, key: string): string {
  const hashed = createHmac("sha256", key).update(email.trim().toLowerCase(), "utf8").digest("hex");
  return `${userPoolId}#${hashed}`;
}

function windowStart(nowSeconds: number): number {
  return Math.floor(nowSeconds / WINDOW_SECONDS) * WINDOW_SECONDS;
}

export type IssuanceVerdict =
  | { readonly allowed: true; readonly count: number }
  | { readonly allowed: false; readonly retryAfterSeconds: number }
  /** Store unreachable (fails open, see `reserve`). */
  | { readonly allowed: true; readonly count: -1; readonly degraded: true };

export interface ReserveInput {
  readonly userPoolId: string;
  readonly email: string;
  readonly hmacKey: string;
  readonly nowSeconds: number;
  /** The auth session's identity: Cognito may retry a trigger, and one session reserving twice counts once. */
  readonly sendMarker: string;
}

/**
 * Called for unknown addresses too, or the counter's absence would reveal existence. Fails open: it
 * is anti-abuse, not authorization, and failing closed would turn a DynamoDB blip into a sign-in
 * outage. `otp_ratelimit_store_unavailable` alarms.
 */
export async function reserve(input: ReserveInput): Promise<IssuanceVerdict> {
  const table = process.env.OTP_TABLE_NAME;
  if (!table) return { allowed: true, count: -1, degraded: true };

  const pk = partitionKey(input.userPoolId, input.email, input.hmacKey);
  const start = windowStart(input.nowSeconds);

  try {
    const result = await client().send(
      new UpdateCommand({
        TableName: table,
        Key: { pk, windowStart: start },
        // `if_not_exists` starts a new window without a read; the set's size counts distinct sends, so retries are no-ops.
        UpdateExpression:
          "SET expiresAt = if_not_exists(expiresAt, :ttl) ADD sends :marker",
        ExpressionAttributeValues: {
          ":ttl": start + TTL_SECONDS,
          ":marker": new Set([input.sendMarker]),
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    const sends = result.Attributes?.["sends"];
    const count = sends instanceof Set ? sends.size : Number(sends ?? 1);

    if (count > OTP_SENDS_PER_HOUR) {
      return { allowed: false, retryAfterSeconds: start + WINDOW_SECONDS - input.nowSeconds };
    }
    return { allowed: true, count };
  } catch {
    // Swallowed: fails open. The caller emits the metric.
    return { allowed: true, count: -1, degraded: true };
  }
}

export function resetIssuanceForTests(): void {
  doc = undefined;
}
