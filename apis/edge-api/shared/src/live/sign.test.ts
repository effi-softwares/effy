import { describe, expect, it } from "vitest";

import { signPublish } from "./sign";

// The expected signatures were produced by the AWS SDK's own signer (@smithy/signature-v4) for
// these exact inputs. If this file's implementation and the SDK's ever disagree, the service
// answers 403 to every publish — so the reference is pinned rather than re-derived here.
const HOST = "example.appsync-api.ap-southeast-2.amazonaws.com";
const BODY = JSON.stringify({ channel: "/shop/abc/2932000", events: ['{"k":"orders"}'] });
const NOW = new Date("2026-10-05T03:12:44Z");
const KEYS = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };

describe("signPublish", () => {
  it("matches the SDK signer with long-lived keys", () => {
    const signed = signPublish(HOST, BODY, "ap-southeast-2", KEYS, NOW);
    expect(signed.url).toBe(`https://${HOST}/event`);
    expect(signed.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261005/ap-southeast-2/appsync/aws4_request, " +
        "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, " +
        "Signature=5458716e1f851a57614574fbe3db93f48b56fb9954b69b71c8477a64c9894cec",
    );
    expect(signed.headers["x-amz-date"]).toBe("20261005T031244Z");
  });

  it("matches the SDK signer with a session token — what a function's role actually has", () => {
    const signed = signPublish(
      HOST,
      BODY,
      "ap-southeast-2",
      { ...KEYS, sessionToken: "SESSIONTOKENEXAMPLE" },
      NOW,
    );
    expect(signed.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261005/ap-southeast-2/appsync/aws4_request, " +
        "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token, " +
        "Signature=04dcfe3b783d53b0ca79c0701658ff77ee2ad37965fe707cf20881de43413572",
    );
    expect(signed.headers["x-amz-security-token"]).toBe("SESSIONTOKENEXAMPLE");
  });
});
