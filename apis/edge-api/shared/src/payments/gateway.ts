/**
 * The payment provider, behind a PORT (Principle VI).
 *
 * Services depend on `PaymentGateway`; the Stripe adapter implements it; tests use a fake — so
 * amount authority, idempotency and the placement transaction are all testable without a live
 * provider. This module is the ONLY place the provider SDK is imported, and it is reachable only as
 * `@effy/edge-shared/payments`, never through the library's main entry, so a function that does not
 * move money does not bundle the SDK.
 *
 * ⚠ THE SECRET NEVER LEAVES HERE. It is fetched at runtime by ARN, held in module memory, and
 * appears in no environment variable, log line or response.
 */
import Stripe from "stripe";

import { getSecretString, invalidateSecret } from "../lib/secrets";

/** Our normalised PaymentIntent status (maps onto `payment.status` and the order lifecycle). */
export type IntentStatus = "requires_payment" | "requires_action" | "succeeded" | "failed" | "canceled";

/**
 * The server-authoritative charge request. `amountMinor` is integer cents, converted from the
 * order's grand total at this boundary only. `idempotencyKey` is DETERMINISTIC so a retried create
 * returns the same intent.
 */
export interface CreateIntentInput {
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  orderId: string;
  orderNumber: string;
  /**
   * The PROVIDER customer id (051). ⚠ `setup_future_usage` is deliberately absent: whether a card
   * is kept is the shopper's decision, made at confirmation, not the server's.
   */
  customerId?: string;
}

export interface PaymentIntent {
  id: string;
  clientSecret: string;
  status: IntentStatus;
  /**
   * What the provider says can actually be used for THIS intent — its amount, its currency, this
   * account's activation state (051 US4). ⚠ The client cannot work this out.
   */
  availableMethods: string[];
}

/**
 * How an order was paid, reduced to what a receipt may show (052 FR-006).
 * ⚠ NO CARD DATA BEYOND `last4`, and no field may be added for more.
 */
export interface PaymentMethodSummary {
  /** Effy's OWN family, never the provider's type string. */
  type: "card" | "wallet" | "pay_over_time" | "other" | "";
  brand: string;
  last4: string;
}

/**
 * The provider's own refund lifecycle.
 *
 * ⚠ A REFUND IS NOT A CALL, IT IS A STATE MACHINE. The provider accepting the request means only
 * that it was SUBMITTED: the bank can reject it up to thirty days later.
 */
export type RefundStatus = "pending" | "succeeded" | "failed" | "canceled" | "requires_action";

/** The verified, provider-neutral event the webhook handler acts on. */
export interface WebhookEvent {
  id: string;
  type: string;
  paymentIntentId: string;
  intentStatus?: IntentStatus;
  // ── 055 refund events — populated only for `refund.*` ──
  /** ⚠ May name a refund this platform has no record of (issued in the provider's dashboard). */
  refundId?: string;
  refundStatus?: RefundStatus;
  failureReason?: string;
  /** Integer cents. Matters for the UNATTRIBUTED case: only the event knows how much left. */
  refundAmountCents?: number;
  /** The intent the refund was taken against — how an unattributed refund resolves to an order. */
  refundPaymentIntentId?: string;
}

export const EVENT_PAYMENT_SUCCEEDED = "payment_intent.succeeded";
export const EVENT_PAYMENT_FAILED = "payment_intent.payment_failed";
export const EVENT_REFUND_CREATED = "refund.created";
export const EVENT_REFUND_UPDATED = "refund.updated";
/** ⚠ The one that matters: how the platform learns a refund it believes it made did not happen. */
export const EVENT_REFUND_FAILED = "refund.failed";

export interface CreateRefundInput {
  paymentIntentId: string;
  amountCents: number;
  /**
   * ⚠ The PROVIDER's vocabulary. Only ever `requested_by_customer` or empty: `fraudulent`
   * blocklists the payer's card and email, and `duplicate` is a claim we cannot substantiate.
   */
  reason?: "requested_by_customer";
  /** ⚠ THE SAME KEY the platform stored, so an ambiguous retry cannot create a second refund. */
  idempotencyKey: string;
  /** Low-cardinality routing only; never PII. */
  metadata?: Record<string, string>;
}

export interface Refund {
  id: string;
  status: RefundStatus;
  failureReason: string;
  amountCents: number;
  metadata: Record<string, string>;
}

/**
 * A refusal the provider will never accept, however many times it is asked.
 *
 * ⚠ THE WHOLE POINT IS THE DISTINCTION (055 FR-005d). A timeout leaves us not knowing whether a
 * refund exists, so the only safe response is a retry the provider recognises as the same request.
 * A refusal is a DECISION, and retrying a decision fills a queue with attempts that cannot succeed.
 */
export class RefusedError extends Error {
  constructor(readonly reason: string) {
    super(`refund refused: ${reason}`);
    this.name = "RefusedError";
  }
}

/** The webhook signature did not verify. The only webhook failure answered as the caller's error. */
export class WebhookSignatureError extends Error {
  constructor() {
    super("webhook signature verification failed");
    this.name = "WebhookSignatureError";
  }
}

/**
 * A card the shopper explicitly chose to keep. ⚠ THESE ARE THE ONLY FIELDS PERMITTED TO LEAVE THE
 * PROVIDER (051 FR-025). ⚠ Never persisted: a mirrored copy rots.
 */
export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface EnsureCustomerInput {
  /** The reference already stored against the customer. Non-empty means no create is attempted. */
  existing?: string | null;
  /** The platform's own record of this shopper, never client-supplied. */
  email?: string | null;
  name?: string | null;
  /** Effy's own customer id, as provider metadata. ⚠ Not the Cognito subject. */
  customerId: string;
}

export interface PaymentGateway {
  /** Create (or, via the deterministic key, re-return) one intent. */
  createPaymentIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  /** Re-fetch an intent's authoritative status. */
  retrievePaymentIntent(intentId: string): Promise<PaymentIntent>;
  /**
   * 074 — withdraw an intent nobody will pay: a checkout that switched to paying entirely with points.
   * Returns the intent's status AFTER the attempt; a provider that refuses because the intent already
   * succeeded or is processing yields that status rather than an error, so the caller can tell
   * "cancelled" from "too late, it was paid".
   */
  cancelPaymentIntent(intentId: string): Promise<IntentStatus>;
  /** Verify the provider signature over the RAW body and return the event. */
  constructWebhookEvent(rawBody: string | Buffer, signatureHeader: string): Promise<WebhookEvent>;

  /**
   * Return money for a payment, in whole or in part.
   * ⚠ SUCCESS MEANS SUBMITTED, NOT REFUNDED. ⚠ A `RefusedError` is a decision and must never be
   * retried; anything else is ambiguous and must be retried under the SAME key.
   */
  createRefund(input: CreateRefundInput): Promise<Refund>;
  /**
   * The refunds the provider holds against a payment (070 FR-024) — how a refund left uncertain is
   * resolved without guessing: ask whether it exists.
   */
  listRefunds(paymentIntentId: string): Promise<Refund[]>;

  /**
   * How an intent was ACTUALLY paid. ⚠ A network round trip — keep it OUT of the payment
   * transaction. ⚠ A failure is not an error to propagate: a receipt without a payment line is a
   * supported state.
   */
  describePaymentMethod(intentId: string): Promise<PaymentMethodSummary>;

  /** The provider customer id for this shopper, creating one only when the platform holds none. */
  ensureCustomer(input: EnsureCustomerInput): Promise<string>;
  /** A short-lived, single-customer session for a provider-owned payment-method list (mobile). */
  createCustomerSession(providerCustomerId: string): Promise<{ clientSecret: string }>;
  /**
   * The shopper's kept cards. ⚠ MUST throw, never return empty, when the provider cannot be
   * reached: "you have no cards" and "we could not ask" are different facts (051 FR-036).
   */
  listSavedCards(providerCustomerId: string): Promise<SavedCard[]>;
  /** Remove a kept card. ⚠ The caller MUST have verified ownership first. */
  detachPaymentMethod(paymentMethodId: string): Promise<void>;
}

// ── The Stripe adapter ───────────────────────────────────────────────────────────────────────────

/**
 * The API version stripe-go v82.5.1 pinned, so the request and response shapes this adapter was
 * proven against do not change underneath it. `stripe@18.5.0` targets the same version.
 */
export const STRIPE_API_VERSION = "2025-08-27.basil";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`payments: required environment variable ${name} is not set`);
  return v;
}

let client: Stripe | undefined;

async function stripe(): Promise<Stripe> {
  if (client) return client;
  const key = (await getSecretString(requiredEnv("STRIPE_SECRET_KEY_ARN"))).trim();
  client = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    // Well inside the 25 s the money-moving functions run for; the SDK's 80 s default would let
    // one slow call outlive the function and leave its outcome unknown.
    timeout: 8_000,
  });
  return client;
}

export function mapIntentStatus(s: string): IntentStatus {
  switch (s) {
    case "succeeded":
      return "succeeded";
    case "requires_action":
    case "requires_confirmation":
      return "requires_action";
    case "canceled":
      return "canceled";
    default:
      // requires_payment_method, processing, requires_capture → still pending from our side.
      return "requires_payment";
  }
}

const toIntent = (pi: Stripe.PaymentIntent): PaymentIntent => ({
  id: pi.id,
  clientSecret: pi.client_secret ?? "",
  status: mapIntentStatus(pi.status),
  availableMethods: pi.payment_method_types ?? [],
});

const toRefund = (r: Stripe.Refund): Refund => ({
  id: r.id,
  status: (r.status ?? "pending") as RefundStatus,
  failureReason: r.failure_reason ?? "",
  amountCents: r.amount,
  metadata: r.metadata ?? {},
});

const idOf = (v: string | { id: string } | null | undefined): string => (typeof v === "string" ? v : (v?.id ?? ""));

/**
 * Reduce a provider event to what the platform acts on. Exported for the routing test: it takes
 * the already-verified event, so it needs no secret.
 */
export function toWebhookEvent(event: { id: string; type: string; data: { object: unknown } }): WebhookEvent {
  const out: WebhookEvent = { id: event.id, type: event.type, paymentIntentId: "" };

  switch (event.type) {
    case EVENT_PAYMENT_SUCCEEDED:
    case EVENT_PAYMENT_FAILED: {
      const pi = event.data.object as { id: string };
      out.paymentIntentId = pi.id;
      out.intentStatus = event.type === EVENT_PAYMENT_FAILED ? "failed" : "succeeded";
      break;
    }
    case EVENT_REFUND_CREATED:
    case EVENT_REFUND_UPDATED:
    case EVENT_REFUND_FAILED: {
      // ⚠ The refund's own id is what the platform keys on — NOT the PaymentIntent. An order can
      // have several refunds; attaching an outcome to the intent would apply one's fate to all.
      const r = event.data.object as Stripe.Refund;
      out.refundId = r.id;
      out.refundStatus = (r.status ?? "pending") as RefundStatus;
      out.refundAmountCents = r.amount;
      out.failureReason = r.failure_reason ?? "";
      out.refundPaymentIntentId = idOf(r.payment_intent);
      out.paymentIntentId = out.refundPaymentIntentId;
      break;
    }
  }
  return out;
}

/** Reduce a charge's method details to a receipt line. Exported for its own test. */
export function summarisePaymentMethod(
  d: Stripe.Charge.PaymentMethodDetails | null | undefined,
): PaymentMethodSummary {
  if (!d) return { type: "", brand: "", last4: "" };
  if (d.card) {
    // ⚠ A card paid through a wallet still arrives as `card`, with the wallet named inside it.
    if (d.card.wallet?.type) return { type: "wallet", brand: d.card.wallet.type, last4: d.card.last4 ?? "" };
    return { type: "card", brand: d.card.brand ?? "", last4: d.card.last4 ?? "" };
  }
  if (d.klarna) return { type: "pay_over_time", brand: "klarna", last4: "" };
  if (d.afterpay_clearpay) return { type: "pay_over_time", brand: "afterpay", last4: "" };
  if (d.zip) return { type: "pay_over_time", brand: "zip", last4: "" };
  // ⚠ `other`, NOT an error and NOT a guess: inventing a brand would put a false fact on a
  // financial record.
  return { type: "other", brand: d.type ?? "", last4: "" };
}

export const stripeGateway: PaymentGateway = {
  async createPaymentIntent(input) {
    const pi = await (await stripe()).paymentIntents.create(
      {
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        capture_method: "automatic",
        automatic_payment_methods: { enabled: true },
        ...(input.customerId ? { customer: input.customerId } : {}),
        metadata: { order_id: input.orderId, order_number: input.orderNumber },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return toIntent(pi);
  },

  async retrievePaymentIntent(intentId) {
    return toIntent(await (await stripe()).paymentIntents.retrieve(intentId));
  },

  async cancelPaymentIntent(intentId) {
    const sdk = await stripe();
    try {
      return toIntent(await sdk.paymentIntents.cancel(intentId)).status;
    } catch (err) {
      // ⚠ An intent that has succeeded (or is processing) cannot be cancelled. That is an ANSWER, not
      // a failure: report what it now is so the caller settles it instead of abandoning a payment.
      if (err instanceof Stripe.errors.StripeInvalidRequestError) return toIntent(await sdk.paymentIntents.retrieve(intentId)).status;
      throw err;
    }
  },

  async constructWebhookEvent(rawBody, signatureHeader) {
    const arn = requiredEnv("STRIPE_WEBHOOK_SECRET_ARN");
    const sdk = await stripe();
    const verify = async () =>
      sdk.webhooks.constructEvent(rawBody, signatureHeader, (await getSecretString(arn)).trim());
    try {
      return toWebhookEvent(await verify());
    } catch {
      // ⚠ Once more against a freshly fetched secret. The operator replaces the signing secret at
      // cut-over; a container already warm would otherwise reject every valid event until recycled.
      invalidateSecret(arn);
      try {
        return toWebhookEvent(await verify());
      } catch {
        throw new WebhookSignatureError();
      }
    }
  },

  async createRefund(input) {
    try {
      const r = await (await stripe()).refunds.create(
        {
          payment_intent: input.paymentIntentId,
          amount: input.amountCents,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        // ⚠ The SAME key the refund row carries. This is the whole of the retry safety.
        { idempotencyKey: input.idempotencyKey },
      );
      return toRefund(r);
    } catch (err) {
      // ⚠ A card or invalid-request error is the provider REFUSING — a decision. An API error,
      // rate limit or transport failure is AMBIGUOUS: the refund may already exist.
      if (err instanceof Stripe.errors.StripeCardError || err instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new RefusedError(err.message);
      }
      throw err;
    }
  },

  async listRefunds(paymentIntentId) {
    const out: Refund[] = [];
    for await (const r of (await stripe()).refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
      out.push(toRefund(r));
    }
    return out;
  },

  async describePaymentMethod(intentId) {
    // ⚠ THE EXPAND IS THE WHOLE POINT: `latest_charge` is an id string unless expanded.
    const pi = await (await stripe()).paymentIntents.retrieve(intentId, {
      expand: ["latest_charge.payment_method_details"],
    });
    const charge = typeof pi.latest_charge === "string" ? null : pi.latest_charge;
    return summarisePaymentMethod(charge?.payment_method_details);
  },

  async ensureCustomer(input) {
    // ⚠ Idempotent by construction: an existing reference short-circuits before any provider call.
    if (input.existing) return input.existing;
    const c = await (await stripe()).customers.create({
      ...(input.email ? { email: input.email } : {}),
      ...(input.name ? { name: input.name } : {}),
      metadata: { effy_customer_id: input.customerId },
    });
    return c.id;
  },

  async createCustomerSession(providerCustomerId) {
    // `payment_method_redisplay` makes kept cards appear; `payment_method_save` renders the save
    // checkbox and lets the provider set `allow_redisplay` from what the shopper actually ticked.
    const s = await (await stripe()).customerSessions.create({
      customer: providerCustomerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: "enabled",
            payment_method_save: "enabled",
            payment_method_remove: "enabled",
          },
        },
      },
    });
    return { clientSecret: s.client_secret };
  },

  async listSavedCards(providerCustomerId) {
    const sdk = await stripe();
    const cust = await sdk.customers.retrieve(providerCustomerId);
    const defaultPm = cust.deleted ? "" : idOf(cust.invoice_settings?.default_payment_method);

    const out: SavedCard[] = [];
    for await (const pm of sdk.paymentMethods.list({ customer: providerCustomerId, type: "card" })) {
      if (!pm.card) continue;
      // ⚠ CONSENT IS A FIELD ON THE CARD (051 FR-020). `always` = the shopper chose to keep it;
      // `limited` = the save control was shown and left unticked; `unspecified` = attached without
      // asking. A raw list does not filter on this, so without the test Effy's list would show
      // cards the shopper declined while the provider's own element correctly hid them.
      if (pm.allow_redisplay !== "always") continue;
      out.push({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
        isDefault: pm.id === defaultPm,
      });
    }
    return out;
  },

  async detachPaymentMethod(paymentMethodId) {
    await (await stripe()).paymentMethods.detach(paymentMethodId);
  },
};
