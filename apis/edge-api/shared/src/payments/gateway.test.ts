import { describe, expect, it } from "vitest";

import {
  EVENT_PAYMENT_FAILED,
  EVENT_PAYMENT_SUCCEEDED,
  EVENT_REFUND_CREATED,
  EVENT_REFUND_FAILED,
  EVENT_REFUND_UPDATED,
  mapIntentStatus,
  STRIPE_API_VERSION,
  summarisePaymentMethod,
  toWebhookEvent,
} from "./gateway";

const ev = (type: string, object: unknown) => ({ id: "evt_1", type, data: { object } });

describe("toWebhookEvent", () => {
  it("payment succeeded / failed carry the intent id and our status", () => {
    expect(toWebhookEvent(ev(EVENT_PAYMENT_SUCCEEDED, { id: "pi_1" }))).toMatchObject({
      id: "evt_1", paymentIntentId: "pi_1", intentStatus: "succeeded",
    });
    expect(toWebhookEvent(ev(EVENT_PAYMENT_FAILED, { id: "pi_1" })).intentStatus).toBe("failed");
  });

  it.each([EVENT_REFUND_CREATED, EVENT_REFUND_UPDATED, EVENT_REFUND_FAILED])(
    "%s is keyed on the REFUND's id, with the amount and the intent it was taken against",
    (type) => {
      const out = toWebhookEvent(
        ev(type, { id: "re_1", status: "failed", amount: 1250, failure_reason: "lost_or_stolen_card", payment_intent: "pi_9" }),
      );
      expect(out).toMatchObject({
        refundId: "re_1", refundStatus: "failed", refundAmountCents: 1250,
        failureReason: "lost_or_stolen_card", refundPaymentIntentId: "pi_9", paymentIntentId: "pi_9",
      });
    },
  );

  it("reads the intent whether the provider sends an id or an expanded object", () => {
    const out = toWebhookEvent(ev(EVENT_REFUND_UPDATED, { id: "re_1", status: "succeeded", amount: 1, payment_intent: { id: "pi_x" } }));
    expect(out.refundPaymentIntentId).toBe("pi_x");
  });

  it("an event type the platform does not act on is passed through with no payload", () => {
    expect(toWebhookEvent(ev("charge.dispute.created", { id: "dp_1" }))).toEqual({
      id: "evt_1", type: "charge.dispute.created", paymentIntentId: "",
    });
  });
});

describe("mapIntentStatus", () => {
  it.each([
    ["succeeded", "succeeded"],
    ["requires_action", "requires_action"],
    ["requires_confirmation", "requires_action"],
    ["canceled", "canceled"],
    ["requires_payment_method", "requires_payment"],
    ["processing", "requires_payment"],
    ["requires_capture", "requires_payment"],
    ["something_new", "requires_payment"],
  ])("%s → %s", (input, want) => {
    expect(mapIntentStatus(input)).toBe(want);
  });
});

describe("summarisePaymentMethod", () => {
  const d = (x: object) => x as never;

  it("a card", () => {
    expect(summarisePaymentMethod(d({ type: "card", card: { brand: "visa", last4: "4242" } }))).toEqual({
      type: "card", brand: "visa", last4: "4242",
    });
  });
  it("a card paid through a wallet reports the wallet", () => {
    expect(summarisePaymentMethod(d({ type: "card", card: { brand: "visa", last4: "4242", wallet: { type: "apple_pay" } } }))).toEqual({
      type: "wallet", brand: "apple_pay", last4: "4242",
    });
  });
  it.each([["klarna", "klarna"], ["afterpay_clearpay", "afterpay"], ["zip", "zip"]])("%s is pay-over-time", (key, brand) => {
    expect(summarisePaymentMethod(d({ type: key, [key]: {} }))).toEqual({ type: "pay_over_time", brand, last4: "" });
  });
  it("an unrecognised method is `other` — never a guessed brand", () => {
    expect(summarisePaymentMethod(d({ type: "au_becs_debit" }))).toEqual({ type: "other", brand: "au_becs_debit", last4: "" });
  });
  it("no details at all is an empty summary, not an error", () => {
    expect(summarisePaymentMethod(null)).toEqual({ type: "", brand: "", last4: "" });
  });
});

it("pins the API version the adapter was proven against", () => {
  expect(STRIPE_API_VERSION).toBe("2025-08-27.basil");
});
