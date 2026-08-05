import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The DynamoDB counter (FR-012).
 *
 * ⚠ The SDK is faked at the `send` boundary rather than by mocking our own module — this file is
 * testing `issuance.ts` itself, so mocking it would be the fixture agreeing with the code instead
 * of with the world (027 R13's lesson, and 033's).
 */

const send = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", async (orig) => {
  const actual = await orig<typeof import("@aws-sdk/lib-dynamodb")>();
  return {
    ...actual,
    DynamoDBDocumentClient: { from: () => ({ send }) },
  };
});

const KEY = "test-key";
const NOW = 1_800_003_600; // exactly on an hour boundary

async function load() {
  const mod = await import("./issuance.js");
  mod.resetIssuanceForTests();
  return mod;
}

beforeEach(() => {
  send.mockReset();
  process.env.OTP_TABLE_NAME = "effy-test-otp-issuance";
  vi.resetModules();
});

afterEach(() => {
  delete process.env.OTP_TABLE_NAME;
});

function reserveArgs(overrides: Partial<Parameters<Awaited<ReturnType<typeof load>>["reserve"]>[0]> = {}) {
  return {
    userPoolId: "ap-southeast-2_TEST",
    email: "shopper@example.com",
    hmacKey: KEY,
    nowSeconds: NOW,
    sendMarker: "shopper@example.com:1800003600",
    ...overrides,
  };
}

describe("reserve", () => {
  it("allows the first send and reports the count", async () => {
    send.mockResolvedValue({ Attributes: { sends: new Set(["a"]) } });
    const { reserve } = await load();
    expect(await reserve(reserveArgs())).toEqual({ allowed: true, count: 1 });
  });

  it("allows up to the limit and refuses beyond it (FR-012, SC-005)", async () => {
    const { reserve, } = await load();
    const { OTP_SENDS_PER_HOUR } = await import("./policy.js");

    send.mockResolvedValue({
      Attributes: { sends: new Set(Array.from({ length: OTP_SENDS_PER_HOUR }, (_, i) => `s${i}`)) },
    });
    expect((await reserve(reserveArgs())).allowed).toBe(true);

    send.mockResolvedValue({
      Attributes: {
        sends: new Set(Array.from({ length: OTP_SENDS_PER_HOUR + 1 }, (_, i) => `s${i}`)),
      },
    });
    const verdict = await reserve(reserveArgs());
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("⚠ a retried invocation counts ONCE (contract invariant 12)", async () => {
    // Cognito "may retry" a trigger. With `ADD 1` a shopper would be charged twice for one email,
    // and five genuine retries would lock them out of their own account. The set makes re-adding
    // the same marker a no-op — this asserts we send a Set, not a number.
    send.mockResolvedValue({ Attributes: { sends: new Set(["m1"]) } });
    const { reserve } = await load();
    await reserve(reserveArgs({ sendMarker: "m1" }));

    const command = send.mock.calls[0]?.[0];
    const values = command.input.ExpressionAttributeValues;
    expect(values[":marker"]).toBeInstanceOf(Set);
    expect(command.input.UpdateExpression).toContain("ADD sends :marker");
    // ⚠ Proves we are NOT incrementing a scalar, which is the shape that double-counts.
    expect(command.input.UpdateExpression).not.toMatch(/ADD\s+count/);
  });

  it("⚠ hashes the address into the key — the table never holds a plaintext email (FR-014)", async () => {
    send.mockResolvedValue({ Attributes: { sends: new Set(["a"]) } });
    const { reserve } = await load();
    await reserve(reserveArgs({ email: "shopper@example.com" }));

    const key = send.mock.calls[0]?.[0].input.Key;
    expect(key.pk).not.toContain("shopper@example.com");
    expect(key.pk).toMatch(/^ap-southeast-2_TEST#[0-9a-f]{64}$/);
  });

  it("is case- and whitespace-insensitive on the address, so the limit cannot be trivially evaded", async () => {
    send.mockResolvedValue({ Attributes: { sends: new Set(["a"]) } });
    const { reserve } = await load();
    await reserve(reserveArgs({ email: "shopper@example.com" }));
    await reserve(reserveArgs({ email: "  SHOPPER@Example.COM  " }));

    const first = send.mock.calls[0]?.[0].input.Key.pk;
    const second = send.mock.calls[1]?.[0].input.Key.pk;
    expect(second).toBe(first);
  });

  it("sets a TTL beyond the window, so a boundary request still sees its window", async () => {
    send.mockResolvedValue({ Attributes: { sends: new Set(["a"]) } });
    const { reserve } = await load();
    await reserve(reserveArgs());

    const values = send.mock.calls[0]?.[0].input.ExpressionAttributeValues;
    expect(values[":ttl"]).toBeGreaterThan(NOW + 3600);
  });

  it("⚠ FAILS OPEN when the store is unreachable, and says so (research R3)", async () => {
    // Deliberate exception to FR-017, which governs VERIFICATION. Failing this closed would make
    // a DynamoDB blip a sign-in outage for all four audiences.
    send.mockRejectedValue(new Error("ProvisionedThroughputExceededException"));
    const { reserve } = await load();
    const verdict = await reserve(reserveArgs());
    expect(verdict.allowed).toBe(true);
    expect("degraded" in verdict && verdict.degraded).toBe(true);
  });

  it("fails open when the table is not configured", async () => {
    delete process.env.OTP_TABLE_NAME;
    const { reserve } = await load();
    const verdict = await reserve(reserveArgs());
    expect(verdict.allowed).toBe(true);
    expect("degraded" in verdict && verdict.degraded).toBe(true);
  });
});
