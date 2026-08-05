/**
 * The code email (035).
 *
 * ⚠ THIS FILE DELIBERATELY DIFFERS FROM `edge-customer/src/password/notify.ts`, which swallows
 * every failure and returns. That is correct there — the password had already been changed, and
 * failing the request would have told the customer a lie. It is WRONG here. Under this design a
 * code that was never sent is a sign-in that cannot complete, and three of the four audiences have
 * no password fallback. So `sendCode` throws, and the caller decides.
 *
 * ⚠ ALSO THE MOCK SEAM. This module exists as a thin separate file so tests can `vi.mock("./mailer")`
 * — the convention already used across this repo's edge services. Do not inline SES into a handler.
 */

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type { AudienceProfile } from "../lib/audience.js";
import { OTP_TTL_SECONDS } from "./policy.js";

/**
 * ⚠ Module scope, not per-invocation. Cognito abandons a trigger at 5 seconds and a cold start
 * already costs ~1s; constructing an SDK client per call spends part of a budget shared with a
 * DynamoDB write.
 */
let client: SESv2Client | undefined;

function sesClient(): SESv2Client {
  client ??= new SESv2Client({});
  return client;
}

/**
 * SES's documented mailbox simulator.
 *
 * ⚠ THIS IS A SECURITY CONTROL, NOT A TEST FIXTURE. When the address has no account we must not
 * mail a stranger — but skipping the send makes the phantom path return measurably faster than the
 * real one, and existence then leaks through latency even though every response body is identical
 * (FR-016). AWS names the problem ("account for latency") and offers no mechanism. Sending to the
 * simulator keeps the same call on the same path, so the timing distribution matches by
 * construction rather than by a sleep we guessed.
 */
const BLACKHOLE = "success@simulator.amazonses.com";

export interface SendCodeInput {
  readonly to: string;
  readonly code: string;
  readonly profile: AudienceProfile;
  /** When true, the message goes to the simulator instead of `to`. */
  readonly phantom: boolean;
}

function subjectFor(profile: AudienceProfile, code: string): string {
  // The code in the subject is a real usability win — most people can read it from the
  // notification without opening the message.
  return `${code} is your ${profile.productName} sign-in code`;
}

function bodyFor(profile: AudienceProfile, code: string): string {
  const minutes = Math.floor(OTP_TTL_SECONDS / 60);
  const who = profile.internal
    ? "Use this code to sign in to your work account."
    : "Use this code to sign in.";
  return [
    `${code}`,
    "",
    who,
    `This code expires in ${minutes} minutes and can only be used once.`,
    "",
    "If you didn't ask to sign in, you can ignore this email — nobody can use the code without it.",
    "",
    `— ${profile.productName}`,
  ].join("\n");
}

/**
 * ⚠ THROWS on send failure, by design (see the file header). The caller is responsible for turning
 * that into an opaque refusal — never into an error string, which Cognito relays to the client
 * verbatim.
 *
 * ⚠ Never log `input.code`, and never log `input.to` (FR-014). There is no logging in this function
 * at all, which is the easiest way to keep that true.
 */
export async function sendCode(input: SendCodeInput): Promise<void> {
  const from = process.env.OTP_SENDER;
  if (!from) {
    // Configuration failure, not user data — safe to be specific, because it can only happen to a
    // misdeployed service and never as a result of anything a caller sent.
    throw new Error("OTP_SENDER is not configured");
  }

  const destination = input.phantom ? BLACKHOLE : input.to;

  await sesClient().send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [destination] },
      Content: {
        Simple: {
          Subject: { Data: subjectFor(input.profile, input.code), Charset: "UTF-8" },
          Body: { Text: { Data: bodyFor(input.profile, input.code), Charset: "UTF-8" } },
        },
      },
    }),
  );
}

/** Test seam. */
export function resetMailerForTests(): void {
  client = undefined;
}
