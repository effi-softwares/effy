/**
 * The per-address issuance counter (FR-012) — ⚠ THE ONLY PERSISTED STATE IN THIS SLICE.
 *
 * The code itself is never written anywhere (see `codec.ts`), and attempt counting comes free from
 * Cognito's `session[]`. What CANNOT be derived from a single auth session is "how many codes has
 * this address been sent in the last hour", because that spans sessions by definition. Hence one
 * table, one counter, one hour.
 *
 * ⚠ WHY DYNAMODB AND NOT POSTGRES, given the constitution locks PostgreSQL.
 * Not primarily latency. The edge Lambdas reach RDS today ONLY because the dev database is publicly
 * accessible (`db_allowed_cidrs = ["0.0.0.0/0"]`), a posture `infra/envs/dev/edge-network.tf`
 * records as invalid for qa/staging/prod. Putting the sign-in path on that connection would turn
 * the eventual VPC migration into a platform-wide sign-in outage. Latency is the second reason:
 * Cognito abandons a trigger at 5s, and `@effy/edge-shared`'s pool already allows 5s just to
 * ACQUIRE a connection. Recorded as a justified exception in specs/035-six-digit-otp/plan.md.
 *
 * ⚠ ALSO THE MOCK SEAM — tests `vi.mock("./issuance")`.
 */

import { createHmac } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { OTP_SENDS_PER_HOUR } from "./policy.js";

const WINDOW_SECONDS = 3600;
/** Two hours against a one-hour window, so a request on the boundary can still see the window it
 *  belongs to. ⚠ DynamoDB TTL deletion is not prompt, which is exactly why the window is always
 *  recomputed in code and never inferred from a row's existence. */
const TTL_SECONDS = WINDOW_SECONDS * 2;

let doc: DynamoDBDocumentClient | undefined;

/** ⚠ Module scope — see the 5-second wall note in `mailer.ts`. */
function client(): DynamoDBDocumentClient {
  doc ??= DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return doc;
}

/**
 * ⚠ The address is HASHED into the key and never stored in plaintext.
 * A rate-limit table has no need to hold a list of everyone who has tried to sign in, and a store
 * that does not contain PII cannot leak it (FR-014).
 */
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
  /** ⚠ Store unreachable — see `reserve`'s note on failing open. */
  | { readonly allowed: true; readonly count: -1; readonly degraded: true };

export interface ReserveInput {
  readonly userPoolId: string;
  readonly email: string;
  readonly hmacKey: string;
  readonly nowSeconds: number;
  /**
   * ⚠ RETRY IDEMPOTENCE. AWS documents that Cognito "may retry" a trigger call. A naive `ADD 1`
   * would then charge a shopper twice for one email they received once, and after five genuine
   * retries they would be locked out of their own account. This marker is the auth session's
   * identity: the same session reserving twice counts once.
   */
  readonly sendMarker: string;
}

/**
 * Reserve one send against the address's hourly budget.
 *
 * ⚠ CALLED FOR NON-EXISTENT ADDRESSES TOO. If the counter were only written for real accounts, its
 * absence would be a second existence oracle for anyone who could read the table, and — more
 * practically — an attacker would get unlimited free probes of unknown addresses (FR-016).
 *
 * ⚠ FAILS OPEN. This is the ONE deliberate exception to FR-017's fail-closed rule, and it is
 * scoped precisely: FR-017 governs VERIFICATION, where failing closed is unconditional and nobody
 * is ever signed in without a verified code. This counter is anti-abuse, not authorization. Failing
 * it closed would make a DynamoDB blip a sign-in outage for all four audiences at once — trading a
 * certain, total outage against a bounded, temporary loss of throttling. The alarm on
 * `otp_ratelimit_store_unavailable` is what stops that being silent (research R3).
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
        // `if_not_exists` resets the counter for a new window without a separate read.
        // Adding the marker to a set is what makes a retry a no-op: re-adding an existing member
        // leaves the set unchanged, and the size — not a counter — is the number of distinct sends.
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
    // ⚠ Swallowed on purpose — see the fail-open note above. The caller emits the metric; throwing
    // here would take sign-in down for every audience whenever DynamoDB hiccups.
    return { allowed: true, count: -1, degraded: true };
  }
}

/** Test seam. */
export function resetIssuanceForTests(): void {
  doc = undefined;
}
