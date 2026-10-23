import { formatCents } from "../lib/money";

/**
 * The words of a promotion: what it gives, its conditions, time left, its label and why it does not
 * apply. One composer for the storefront, commerce, the cart and the back-office editor.
 */

export interface PromotionWords {
  kind: "cart" | "item" | "bxgy" | "delivery";
  valueType: "percent" | "amount" | "free";
  percentOff: number | null;
  amountOffCents: number | null;
  maxDiscountCents: number | null;
  bxgy: { buy: number; get: number; maxPerOrder: number | null } | null;
  /** For item / bxgy: what it covers, in words ("Dairy & eggs", "3 products", "Brand X"); null for the cart. */
  covers: string | null;
  deliveryTypes: readonly ("effy" | "courier")[];
  audience: "everyone" | "first_order" | "new_customers" | "chosen";
  minSubtotalCents: number;
  minQuantity: number | null;
  daysOfWeek: readonly number[] | null;
  minuteFrom: number | null;
  minuteTo: number | null;
  maxUsesPerCustomer: number | null;
}

const money = (cents: number) => {
  const s = formatCents(cents);
  return `$${s.endsWith(".00") ? s.slice(0, -3) : s}`;
};
const moneyExact = (cents: number) => `$${formatCents(cents)}`;
const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;

/** The short badge on a product or a banner: "15% off", "$2 off", "Buy 2 get 1 free", "Free delivery". */
export function offerLabelOf(p: PromotionWords): string {
  if (p.kind === "bxgy" && p.bxgy) {
    const get = p.valueType === "percent" && p.percentOff !== null ? `${p.bxgy.get} ${pct(p.percentOff)} off` : `${p.bxgy.get} free`;
    return `Buy ${p.bxgy.buy} get ${get}`;
  }
  if (p.kind === "delivery") {
    if (p.valueType === "free") return "Free delivery";
    return p.valueType === "percent" ? `${pct(p.percentOff ?? 0)} off delivery` : `${money(p.amountOffCents ?? 0)} off delivery`;
  }
  if (p.valueType === "percent") return `${pct(p.percentOff ?? 0)} off`;
  return `${money(p.amountOffCents ?? 0)} off`;
}

/** What it gives, in a sentence: "20% off, up to $15" / "15% off Dairy & eggs" / "$1 off each Brand X item". */
export function givesOf(p: PromotionWords): string {
  const label = offerLabelOf(p);
  if (p.kind === "delivery") return label;
  if (p.kind === "bxgy") return p.covers ? `${label} on ${p.covers}` : label;
  const capped = p.maxDiscountCents !== null ? `, up to ${money(p.maxDiscountCents)}` : "";
  if (p.kind === "item") {
    const each = p.valueType === "amount" ? " each" : "";
    return p.covers ? `${label}${each} ${p.covers}${capped}` : `${label}${each}${capped}`;
  }
  return `${label} your order${capped}`;
}

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function clock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

function daysWords(days: readonly number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  const key = set.join("");
  if (key === "12345") return "Weekdays";
  if (key === "67") return "Weekends";
  if (key === "1234567") return "Every day";
  return set.map((d) => DAY[d]).join(", ");
}

/** The conditions, joined: "On orders over $30.00 · Effy delivery only · Weekdays 11am–2pm". Null when none. */
export function termsOf(p: PromotionWords): string | null {
  const parts: string[] = [];
  if (p.minSubtotalCents > 0) parts.push(`On orders over ${moneyExact(p.minSubtotalCents)}`);
  if (p.minQuantity !== null && p.minQuantity > 1) parts.push(`When you buy ${p.minQuantity} or more`);
  if (p.audience === "first_order") parts.push("Your first order only");
  if (p.audience === "new_customers") parts.push("New customers only");
  if (p.audience === "chosen") parts.push("For selected customers");
  if (p.deliveryTypes.length === 1) parts.push(p.deliveryTypes[0] === "effy" ? "Delivered by Effy only" : "Courier delivery only");
  const hours = p.minuteFrom !== null && p.minuteTo !== null ? ` ${clock(p.minuteFrom)}–${clock(p.minuteTo)}` : "";
  if (p.daysOfWeek) parts.push(`${daysWords(p.daysOfWeek)}${hours}`);
  else if (hours) parts.push(`Every day${hours}`);
  if (p.maxUsesPerCustomer === 1) parts.push("Once per customer");
  else if (p.maxUsesPerCustomer !== null) parts.push(`${p.maxUsesPerCustomer} times per customer`);
  if (p.kind === "bxgy" && p.bxgy?.maxPerOrder) parts.push(p.bxgy.maxPerOrder === 1 ? "Once per order" : `Up to ${p.bxgy.maxPerOrder} times per order`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const plural = (n: number, unit: string): string => (n === 1 ? `1 ${unit}` : `${n} ${unit}s`);
const HOUR = 3_600_000;

/** How long it has left, as a shopper says it. Null when it never ends. */
export function endsInOf(endsAt: Date | null, now: Date): string | null {
  if (!endsAt) return null;
  const left = endsAt.getTime() - now.getTime();
  if (left <= 0) return "Ended";
  if (left < HOUR) return "Ends within the hour";
  if (left < 24 * HOUR) return `Ends in ${plural(Math.floor(left / HOUR), "hour")}`;
  if (left < 48 * HOUR) return "Ends tomorrow";
  return `Ends in ${plural(Math.floor(left / (24 * HOUR)), "day")}`;
}

/** Why it does not apply: the cart's sentence. */
export function notAppliedSentence(
  reason: "not_combined" | "below_minimum" | "below_quantity" | "wrong_time" | "wrong_delivery" | "sign_in",
  p: PromotionWords,
  extra: { shortfallCents?: number; missingQuantity?: number; appliedInstead?: string | null } = {},
): string {
  switch (reason) {
    case "not_combined":
      return extra.appliedInstead
        ? `Can't be used with ${extra.appliedInstead}, which saves you more.`
        : "Can't be used with the other offers in your cart, which save you more.";
    case "below_minimum":
      return extra.shortfallCents ? `Add ${moneyExact(extra.shortfallCents)} more to get ${offerLabelOf(p)}.` : `Spend ${moneyExact(p.minSubtotalCents)} or more to get ${offerLabelOf(p)}.`;
    case "below_quantity":
      return `Add ${plural(extra.missingQuantity ?? 1, "more item")}${p.covers ? ` from ${p.covers}` : ""} to get ${offerLabelOf(p)}.`;
    case "wrong_time": {
      const t = termsOf({ ...p, minSubtotalCents: 0, minQuantity: null, audience: "everyone", deliveryTypes: ["effy", "courier"], maxUsesPerCustomer: null, bxgy: null });
      return t ? `Available ${t.charAt(0).toLowerCase()}${t.slice(1)}.` : "Not available right now.";
    }
    case "wrong_delivery":
      return p.deliveryTypes.includes("effy") ? "Only for orders Delivered by Effy." : "Only for Courier delivery.";
    case "sign_in":
      return "Sign in to use this offer.";
  }
}

/** A code the shopper typed that cannot be used, said plainly (the cart's refusal). */
export type CodeRefusal =
  | "promo_unknown"
  | "promo_not_started"
  | "promo_ended"
  | "promo_used_up"
  | "promo_out_of_budget"
  | "promo_already_used"
  | "promo_code_used"
  | "promo_not_eligible"
  | "promo_sign_in"
  | "promo_below_minimum"
  | "promo_wrong_delivery";

export function codeRefusalSentence(reason: CodeRefusal, p?: PromotionWords, extra: { shortfallCents?: number } = {}): string {
  switch (reason) {
    case "promo_unknown":
      return "That code isn't recognised. Check it and try again.";
    case "promo_not_started":
      return "That code isn't active yet.";
    case "promo_ended":
      return "That code has ended.";
    case "promo_used_up":
    case "promo_out_of_budget":
      return "That code is no longer available.";
    case "promo_already_used":
      return "You've already used that code as many times as it allows.";
    case "promo_code_used":
      return "That code has already been used.";
    case "promo_not_eligible":
      return p?.audience === "first_order" ? "That code is for a first order only." : p?.audience === "new_customers" ? "That code is for new customers only." : "That code isn't available to your account.";
    case "promo_sign_in":
      return "Sign in to use that code.";
    case "promo_below_minimum":
      return p ? notAppliedSentence("below_minimum", p, extra) : "Your cart is below the minimum for that code.";
    case "promo_wrong_delivery":
      return p ? notAppliedSentence("wrong_delivery", p) : "That code isn't available for this delivery.";
  }
}
