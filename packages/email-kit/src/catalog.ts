/**
 * THE CATALOGUE — the single source of truth for every email the platform can send.
 *
 * Contract: specs/038-email-template-system/contracts/email-catalog.contract.md
 *
 * ⚠ A message that is not here is not sendable, and that is enforced by the type system rather than
 * by review: `TemplateId` is a closed union derived from this object, so "template not found" is not
 * a runtime failure class (spec FR-003) and a call site cannot compile with the wrong variables
 * (spec FR-004).
 */

import type { Audience, AudienceProfile } from "./audience.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Variable schemas — a tiny declarative spec, deliberately not a schema library.
//
// ⚠ Zero runtime dependencies beyond Handlebars is a hard requirement here: this code runs inside a
// Cognito trigger with an unchangeable 5-second wall, where three of four audiences have no password
// to fall back on. A schema library is 40–200 KB of cold start bought for eight field declarations.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A leaf value's type. Anything a Handlebars expression renders directly. */
export type ScalarSpec = "string" | "number" | "boolean";

/**
 * A variable's shape. Scalars, a list of strings, or `{ of: {...} }` — a list of records with scalar
 * fields, which is what a receipt's line items are (a `{{#each}}` over `{ name, quantity, price }`).
 *
 * ⚠ Money, dates and quantities arrive PRE-FORMATTED as strings (spec FR-048). There is deliberately
 * no "money" or "date" spec: formatting is the caller's domain knowledge (locale, currency), and SES
 * has no formatting helpers anyway, so a template must never be handed a raw number to format.
 */
export type ObjectArraySpec = { readonly of: Readonly<Record<string, ScalarSpec>> };

export type VarSpec = ScalarSpec | "string[]" | ObjectArraySpec;

export type VarShape = Readonly<Record<string, VarSpec>>;

type FromScalar<S extends ScalarSpec> = S extends "string"
  ? string
  : S extends "number"
    ? number
    : boolean;

type FromSpec<S extends VarSpec> = S extends "string"
  ? string
  : S extends "number"
    ? number
    : S extends "boolean"
      ? boolean
      : S extends "string[]"
        ? readonly string[]
        : S extends { of: infer R extends Readonly<Record<string, ScalarSpec>> }
          ? readonly { readonly [K in keyof R]: FromScalar<R[K]> }[]
          : never;

export type VarsOf<S extends VarShape> = { readonly [K in keyof S]: FromSpec<S[K]> };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Category — ⚠ a discriminated union, not a flag.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ THE WRONG COMBINATION MUST NOT COMPILE.
 *
 * `transactional` has no field to put an unsubscribe URL in; `lifecycle` cannot omit one. This is
 * structural rather than a lint rule because the failure is severe and silent: a person who
 * unsubscribes from `auth-sign-in-code` **cannot sign in**, and driver, shop and back-office have no
 * other credential. That is an account lockout with no recovery path.
 *
 * ⚠ Sources genuinely disagree about whether transactional mail may carry `List-Unsubscribe` —
 * Google scopes the requirement to marketing and subscribed mail, RFC 8058 imposes no message-type
 * restriction, and AWS's own blog does not draw the distinction at all. The platform draws it here.
 *
 * The `lifecycle` arm ships UNUSED on purpose, so the distinction is enforceable from day one rather
 * than retrofitted after the first campaign.
 */
export type Category =
  | { readonly category: "transactional" }
  | { readonly category: "lifecycle"; readonly unsubscribeUrl: (vars: never) => string };

/**
 * ⚠ Declared per message, because the two correct behaviours are irreconcilable as a default.
 *
 * `throw`   — a code that was never sent is a sign-in that cannot complete. The caller turns it into
 *             an opaque refusal.
 * `swallow` — the underlying change has ALREADY happened (a password was changed and the write
 *             cannot be unwound). Failing the request would tell the person a lie. ⚠ But the log
 *             must be loud: the silent absence of a security notification is exactly the condition
 *             under which a takeover goes unnoticed.
 *
 * Before this package the reasoning lived as a comment in two files, and the seventh message would
 * have had to guess.
 */
export type FailurePolicy = "throw" | "swallow";

/**
 * Who actually puts the message on the wire.
 *
 * ⚠ `cognito` means Cognito sends it, and the platform therefore CANNOT attach a message tag, choose
 * a configuration set, or set a header on it. Those messages get no delivery attribution — a
 * property of the mechanism, not a gap. It also selects a much tighter size budget — see
 * `contracts/cognito-custom-message.contract.md`.
 */
export type SentBy = "platform" | "cognito";

export interface MessageDefinition<S extends VarShape = VarShape> {
  readonly vars: S;
  /** ⚠ May carry the code: reading it from a lock-screen notification is a real usability win. */
  readonly subject: (vars: VarsOf<S>, profile: AudienceProfile) => string;
  /** ⚠ MUST NOT repeat the subject and MUST NOT restate a code or an amount (spec FR-032). */
  readonly preheader: (vars: VarsOf<S>, profile: AudienceProfile) => string;
  readonly audiences: readonly Audience[];
  readonly sentBy: SentBy;
  readonly onSendFailure: FailurePolicy;
}

export type MessageEntry<S extends VarShape = VarShape> = MessageDefinition<S> & Category;

const ALL_AUDIENCES: readonly Audience[] = ["customer", "driver", "shop", "back-office"];
const CUSTOMER_ONLY: readonly Audience[] = ["customer"];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The catalogue itself.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ ID GRAMMAR: `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` — lowercase, digits, single hyphens.
 *
 * Not a style preference. SES message tag values permit only `[A-Za-z0-9_-]`, and message tags are
 * how a delivery outcome is attributed to a message. A dotted id would need sanitising, and two ids
 * could sanitise onto ONE tag — silently merging the bounce statistics of two different messages.
 * The grammar makes ids tag-safe by construction, so no sanitiser exists to get wrong.
 *
 * ⚠ AN ID IS PERMANENT ONCE SHIPPED. It is written into delivery records; renaming one orphans every
 * historical row. A message that changes meaning gets a NEW id.
 */
export const TEMPLATE_ID_GRAMMAR = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const CATALOG = {
  "auth-sign-in-code": {
    vars: { code: "string", expiryMinutes: "number", isInternal: "boolean" },
    subject: (v, p) => `${v.code} is your ${p.productName} sign-in code`,
    // ⚠ States the purpose; does not repeat the subject; does not restate the code.
    preheader: (v) => `Enter this code to sign in. It expires in ${v.expiryMinutes} minutes.`,
    audiences: ALL_AUDIENCES,
    sentBy: "platform",
    category: "transactional",
    // ⚠ THROW. Three of four audiences have no password: an unsent code is a total lockout.
    onSendFailure: "throw",
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // ⚠ COGNITO-SENT MESSAGES. Rendered by the CustomMessage interceptor and handed to Cognito, which
  // makes the SES call. So: `sentBy: "cognito"` (selects the ~20,000-char budget), NO `code` variable
  // (the code is Cognito's `{####}` placeholder, substituted after the trigger returns), no failure
  // policy that this codebase acts on (the interceptor's fail-safe returns the event unmodified and
  // Cognito falls back to its default template — a throw here would break sign-up/recovery outright).
  // `onSendFailure` is still declared because the type requires it; it is inert for these.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  "auth-sign-up-code": {
    vars: {},
    subject: (_v, p) => `Confirm your email for ${p.productName}`,
    preheader: () => "Enter this code to finish setting up your account.",
    audiences: CUSTOMER_ONLY, // only customers self-register
    sentBy: "cognito",
    category: "transactional",
    onSendFailure: "throw",
  },

  "auth-password-reset-code": {
    vars: {},
    subject: (_v, p) => `Reset your ${p.productName} password`,
    preheader: () => "Enter this code to choose a new password.",
    audiences: CUSTOMER_ONLY, // only the customer audience has passwords (035)
    sentBy: "cognito",
    category: "transactional",
    onSendFailure: "throw",
  },

  "auth-email-verification-code": {
    vars: {},
    subject: (_v, p) => `Verify your email for ${p.productName}`,
    preheader: () => "Enter this code to confirm this email address.",
    audiences: ALL_AUDIENCES, // an email attribute can be verified on any pool
    sentBy: "cognito",
    category: "transactional",
    onSendFailure: "throw",
  },

  "auth-step-up-code": {
    vars: {},
    // ⚠ NOT the passwordless sign-in code — that is 035's custom challenge (`auth-sign-in-code`).
    subject: (_v, p) => `Your ${p.productName} verification code`,
    preheader: () => "Enter this code to continue.",
    audiences: ALL_AUDIENCES,
    sentBy: "cognito",
    category: "transactional",
    onSendFailure: "throw",
  },

  "account-password-changed": {
    vars: { isFirstPassword: "boolean" },
    subject: (v, p) =>
      v.isFirstPassword
        ? `A password was added to your ${p.productName} account`
        : `Your ${p.productName} password was changed`,
    preheader: () => "If this wasn't you, contact support straight away.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",
    // ⚠ SWALLOW. The password is already changed and the write cannot be unwound; failing the
    // request would tell the customer their change failed when it did not.
    onSendFailure: "swallow",
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // ⚠ THE COMMERCE PROOF — a data-heavy message (spec US5). TEMPLATE ONLY: nothing sends it yet
  // (FR-062). It exists so the receipt components (line-item table, totals, money formatting, the
  // 102 KB budget with a large basket) are proven, not designed on paper. `items` uses the
  // object-array spec. ⚠ Every money value and quantity is a PRE-FORMATTED string (FR-048).
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * ⚠ 052 WIRED THIS UP. It is no longer template-only: `edge-notifications` renders and sends it when
   * an order becomes paid, and the customer can request it again (FR-019/FR-027).
   *
   * ⚠ THE ID IS KEPT, and that is a deliberate reading of the rule at the top of this file. An id is
   * permanent once shipped because it is written into delivery records and renaming one orphans every
   * historical row. There are NO such rows: this message had no call site until now, so nothing
   * references it. A new id would strand the artifacts and guards already built for it (research R8).
   */
  "order-confirmation": {
    vars: {
      orderNumber: "string",
      placedAt: "string",
      /** ⚠ A DATE OR DATE RANGE, never a time — the platform has no delivery window (research R4). */
      deliveryEstimate: "string",
      deliveryMethod: "string",
      /** ⚠ Money and quantity arrive PRE-FORMATTED (FR-048). `unitPrice` is 052's addition. */
      items: {
        of: { name: "string", quantity: "string", unitPrice: "string", lineTotal: "string" },
      },
      subtotal: "string",
      /** `hasDiscount` gates the row; a zero discount is OMITTED, never rendered as a dash. */
      hasDiscount: "boolean",
      discountLabel: "string",
      discountAmount: "string",
      hasDeliveryFee: "boolean",
      deliveryFee: "string",
      total: "string",
      /** Absent on a pre-052 order, or where the post-commit capture failed (data-model §1). */
      hasPaymentMethod: "boolean",
      paymentMethod: "string",
      deliveryAddress: "string",
      billingSameAsDelivery: "boolean",
      billingAddress: "string",
      orderUrl: "string",
    },
    subject: (v, p) => `Your ${p.productName} order ${v.orderNumber} is confirmed`,
    // ⚠ Does not repeat the subject and does not restate the amount (FR-025).
    preheader: (v) => `Arriving ${v.deliveryEstimate}.`,
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",

    /**
     * ⚠ `transactional`, AND IT IS LOAD-BEARING. The `Category` union gives the transactional arm no
     * field to put an unsubscribe URL in, so an unsubscribable receipt is a COMPILE ERROR rather than
     * a review catch (FR-024). A customer must never be able to opt out of their own proof of
     * purchase — and unlike a newsletter, there is no argument that they should be able to.
     */
    category: "transactional",

    /**
     * ⚠ `swallow`, and for the `account-password-changed` reason rather than the
     * `newsletter-confirmation` one. THE ORDER IS ALREADY PAID and the write cannot be unwound; a
     * throw would propagate into a caller that would then report a failure for something that
     * demonstrably succeeded (FR-023). The dispatch row records the failure instead, so it is loud in
     * the place an operator actually looks (`receipt_dispatch.status = 'failed'`) rather than silent.
     */
    onSendFailure: "swallow",
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // 053 — the order arrived.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * ⚠ THE ONLY MESSAGE A WEB-ONLY SHOPPER GETS ABOUT THEIR DELIVERY (053 FR-019).
   *
   * Before this, the three post-payment lifecycle events — ready, out for delivery, delivered — were
   * PUSH ONLY. A customer who shops on the website and has never installed the app received the
   * receipt and then complete silence for the rest of the order's life. Push is not a channel that
   * audience has.
   *
   * ⚠ IT NAMES NO SHOP AND NO PACKAGE COUNT (FR-021). "Your 2 parcels have arrived" would disclose
   * the fulfilment structure the whole product model hides — the customer buys from Effy, and never
   * learns how many shops served them. There is deliberately no `items` var here to make that
   * mistake with.
   *
   * ⚠ IT DOES NOT RESTATE THE RECEIPT. That is a different document with a different job, already
   * sent at payment. This one says the thing arrived and links to it.
   */
  "order-delivered": {
    vars: {
      orderNumber: "string",
      /** ⚠ A DATE, never a time-of-day — the platform has no delivery window (052 research R4). */
      deliveredOn: "string",
      orderUrl: "string",
    },
    subject: (v, p) => `Your ${p.productName} order ${v.orderNumber} has arrived`,
    // ⚠ Does not repeat the subject, and makes no claim about condition or completeness — the
    // platform knows the package was handed over, not what was in it.
    preheader: () => "Everything in your order has been delivered.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",

    /**
     * ⚠ `transactional`. A delivery notice is the completion of a purchase the customer made, not
     * marketing, so it carries no unsubscribe — and the `Category` union makes an unsubscribable one
     * a COMPILE ERROR rather than a review catch.
     */
    category: "transactional",

    /**
     * ⚠ `swallow`, for `order-confirmation`'s reason. THE PACKAGE HAS ALREADY ARRIVED and the
     * arrival is already committed; a throw would propagate into a caller that would then report a
     * failure for something that demonstrably happened. The notification row records the failure
     * instead (`notification_request.status = 'failed'`, with `last_error`), which is loud in the
     * place an operator actually looks.
     */
    onSendFailure: "swallow",
  },

  /**
   * A refund was issued (055 US5, FR-027).
   *
   * ⚠ IT IS SENT WHEN THE MONEY IS ON ITS WAY, NOT WHEN IT ARRIVES, and the copy has to carry that
   * distinction. The provider accepting a refund is not the bank moving it — that can take days and
   * can still fail. "Your refund is complete" would be a claim the platform cannot make, and it is
   * the one claim that stops a shopper looking for money that never turned up.
   *
   * ⚠ IT NAMES NO SHOP, NO PROVIDER AND NO FAILURE REASON — the catalogue gives it no var to make
   * those mistakes with, the same mechanism that makes a package count unrepresentable above.
   *
   * ⚠ AND NO `reason` VAR. Whether this was item-derived, goodwill or a cancellation is Effy's own
   * vocabulary; a shopper needs the amount, the order, and where to look for it.
   */
  "order-refunded": {
    vars: {
      orderNumber: "string",
      /** A 2-dp decimal string with no currency symbol — the template supplies the presentation. */
      refundAmount: "string",
      orderUrl: "string",
    },
    subject: (v) => `Your refund for order ${v.orderNumber} is on its way`,
    // ⚠ Does not repeat the subject, and does not say "refunded" — see the note above.
    preheader: () => "We've sent the money back to your original payment method.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",

    /**
     * ⚠ `transactional`. A refund notice is the completion of a purchase the customer made — money
     * leaving Effy's hands — not marketing, so it carries no unsubscribe. The `Category` union makes
     * an unsubscribable one a COMPILE ERROR.
     */
    category: "transactional",

    /**
     * ⚠ `swallow`. THE REFUND HAS ALREADY BEEN SUBMITTED and that transaction is committed; a throw
     * would propagate into a caller that would then report a failure for something that demonstrably
     * happened — and a retry could issue the refund again. The notification row records the send
     * failure instead, which is loud where an operator actually looks.
     */
    onSendFailure: "swallow",
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // 039 — newsletter double opt-in.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  "newsletter-confirmation": {
    vars: { confirmUrl: "string", expiresIn: "string" },
    subject: (_v, p) => `Confirm your ${p.productName} subscription`,
    // ⚠ Does not repeat the subject and carries no secret — the token lives in the URL only.
    preheader: () => "One tap to confirm, and we'll keep you posted.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",

    /**
     * ⚠ `transactional`, AND THIS IS THE ARGUABLE ONE — so here is the reasoning rather than a bare
     * value. It is newsletter-shaped, which suggests `lifecycle` and therefore a mandatory unsubscribe
     * URL. But an unsubscribe link here would leave a subscription that DOES NOT YET EXIST: nobody is
     * subscribed until this link is followed. The recipient's exit is to ignore it, which is stronger
     * than any link, and the message says so in as many words.
     *
     * The distinction is not cosmetic. The moment the platform sends an actual campaign, that message
     * is `lifecycle` and this catalogue's discriminated union makes it a COMPILE ERROR to ship without
     * an unsubscribe URL. `lifecycle` ships unused precisely so that day is enforced, not remembered.
     */
    category: "transactional",

    /**
     * ⚠ `throw`. The subscription row is written BEFORE the send, so a swallowed failure would leave a
     * row stuck at `pending` with a token nobody ever received — a subscriber who believes they signed
     * up, never confirms, and can never be written to. The caller turns the throw into the retryable
     * error state (FR-033) so the visitor is told to try again while their input is still on screen.
     *
     * ⚠ It differs from `account-password-changed`'s `swallow` for a concrete reason: there the
     * underlying change had ALREADY happened irreversibly, so failing the request would tell the
     * customer a lie. Here nothing irreversible has occurred and a retry is genuinely useful.
     */
    onSendFailure: "throw",
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // 046 — customer feedback. Two platform-sent transactional messages with OPPOSITE failure policies,
  // which is exactly the discriminator this catalogue exists to carry.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  "feedback-received": {
    vars: { referenceCode: "string", category: "string" },
    subject: (_v, p) => `We got your feedback — ${p.productName}`,
    // ⚠ States the purpose; carries no secret; does not repeat the subject.
    preheader: () => "Thanks for taking the time. Here's your reference.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",

    /**
     * ⚠ SWALLOW. The submission is ALREADY stored and the shopper's on-screen confirmation already
     * said "received" (FR-015). A thrown failure here would contradict a true fact — the same reason
     * `account-password-changed` swallows, and the mirror image of `newsletter-confirmation`'s throw
     * (there the row is written before a send whose whole point is the recipient acting on it).
     */
    onSendFailure: "swallow",
  },

  "feedback-reply": {
    vars: {
      replyBody: "string",
      originalMessage: "string",
      category: "string",
      referenceCode: "string",
    },
    subject: (v, p) => `Re: your ${p.productName} feedback (${v.referenceCode})`,
    preheader: () => "A reply from the Effy team.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",

    /**
     * ⚠ THROW. Nothing irreversible has happened yet, and the whole point of the action is that the
     * shopper receives it. A swallowed failure would let the console mark the submission `replied`
     * while the shopper got nothing (FR-030). The service writes the reply row + flips status ONLY
     * after this send succeeds; the throw is what guarantees that ordering.
     */
    onSendFailure: "throw",
  },
} as const satisfies Record<string, MessageEntry>;

export type TemplateId = keyof typeof CATALOG;

export type VarsFor<T extends TemplateId> = VarsOf<(typeof CATALOG)[T]["vars"]>;

export function entryFor<T extends TemplateId>(id: T): (typeof CATALOG)[T] {
  return CATALOG[id];
}

export function templateIds(): readonly TemplateId[] {
  return Object.keys(CATALOG) as TemplateId[];
}

export function isTemplateId(value: string): value is TemplateId {
  return Object.prototype.hasOwnProperty.call(CATALOG, value);
}

/**
 * ⚠ The SES message tag value. Identical to the id because the grammar guarantees it is tag-safe —
 * there is deliberately no transformation here to get wrong.
 */
export function messageTagFor(id: TemplateId): string {
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Runtime validation.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ Validate again at every boundary the COMPILER did not check — a Cognito trigger event, a queue
 * message, another service (spec FR-005). Static typing protects the call sites it can see; nothing
 * protects a payload that arrived as JSON.
 *
 * Reports EVERY problem with the template id attached, never just the first, and never produces a
 * message with gaps in it.
 */
export function validateVars(id: TemplateId, vars: unknown): string[] {
  const shape = CATALOG[id].vars as VarShape;
  if (typeof vars !== "object" || vars === null || Array.isArray(vars)) {
    return [`${id}: variables must be an object, got ${vars === null ? "null" : typeof vars}`];
  }
  const bag = vars as Record<string, unknown>;
  const errors: string[] = [];

  for (const [key, spec] of Object.entries(shape)) {
    const value = bag[key];
    if (value === undefined) {
      errors.push(`${id}: missing required variable '${key}' (${describeSpec(spec)})`);
      continue;
    }
    errors.push(...validateOne(id, key, spec, value));
  }
  return errors;
}

function describeSpec(spec: VarSpec): string {
  return typeof spec === "string" ? spec : `array of { ${Object.keys(spec.of).join(", ")} }`;
}

function scalarOk(spec: ScalarSpec, value: unknown): boolean {
  return spec === "string"
    ? typeof value === "string"
    : spec === "number"
      ? typeof value === "number" && Number.isFinite(value)
      : typeof value === "boolean";
}

function validateOne(id: TemplateId, key: string, spec: VarSpec, value: unknown): string[] {
  if (spec === "string" || spec === "number" || spec === "boolean") {
    return scalarOk(spec, value) ? [] : [`${id}: variable '${key}' must be ${spec}, got ${typeof value}`];
  }
  if (spec === "string[]") {
    return Array.isArray(value) && value.every((v) => typeof v === "string")
      ? []
      : [`${id}: variable '${key}' must be string[], got ${typeof value}`];
  }
  // ObjectArraySpec — a list of records with scalar fields (e.g. line items).
  if (!Array.isArray(value)) {
    return [`${id}: variable '${key}' must be an array of objects, got ${typeof value}`];
  }
  const errors: string[] = [];
  value.forEach((element, i) => {
    if (typeof element !== "object" || element === null || Array.isArray(element)) {
      errors.push(`${id}: '${key}[${i}]' must be an object`);
      return;
    }
    const row = element as Record<string, unknown>;
    for (const [field, fieldSpec] of Object.entries(spec.of)) {
      if (row[field] === undefined) {
        errors.push(`${id}: '${key}[${i}]' is missing field '${field}' (${fieldSpec})`);
      } else if (!scalarOk(fieldSpec, row[field])) {
        errors.push(`${id}: '${key}[${i}].${field}' must be ${fieldSpec}, got ${typeof row[field]}`);
      }
    }
  });
  return errors;
}
