import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Fakes the SDK at `send`, so `issuance.ts` itself is under test. */

const send = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", async (orig) => {
  const actual = await orig<typeof import("@aws-sdk/lib-dynamodb")>();
  return {
    ...actual,
    DynamoDBDocumentClient: { from: () => ({ send }) },
  };
});

const KEY = "test-key";
const NOW = 1_800_003_600;

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
    // Cognito may retry a trigger: a Set marker makes a re-add a no-op, where `ADD 1` would double-count.
    send.mockResolvedValue({ Attributes: { sends: new Set(["m1"]) } });
    const { reserve } = await load();
    await reserve(reserveArgs({ sendMarker: "m1" }));

    const command = send.mock.calls[0]?.[0];
    const values = command.input.ExpressionAttributeValues;
    expect(values[":marker"]).toBeInstanceOf(Set);
    expect(command.input.UpdateExpression).toContain("ADD sends :marker");
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
    // Fails open: a DynamoDB blip must not become a sign-in outage.
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
