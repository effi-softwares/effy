// What each audience's notification categories allow (111): whether a person may turn one off, whether it is marketing
// (nothing is sent until the customer says yes), its default per channel, which channels a customer may change, the
// Android channel it is filed in, and the words each settings screen shows.
//
// Declared ONCE here. notify() reads it to decide at the moment of sending (edge-shared preferences.ts); the database
// holds only a person's choices and consent, never the policy, so a default changes with a deploy and reaches everyone
// who never touched it. Pinned to notification-categories.fixtures.json, whose copies the customer and driver apps embed
// (notification-categories.test.ts fails a copy that drifts).

import type { NotificationAudience } from "./notification-destinations";
import type { InboxCategory } from "./notification-inbox";

export type PreferenceChannel = "push" | "email";

export interface NotificationCategoryPolicy {
  audience: NotificationAudience;
  category: InboxCategory;
  /** The words on a settings row. */
  label: string;
  /** One line under the label. */
  description: string;
  /** Why it is fixed; null when the person may change it. */
  reason: string | null;
  /** Cannot be turned off on any channel. */
  required: boolean;
  /** Nothing in this category reaches a customer without their yes (offers, news). */
  marketing: boolean;
  /** For a marketing category, the push default applies only once the customer has said yes. */
  defaults: { push: boolean; email: boolean };
  /** The channels a customer may turn on or off. Empty for a required category. */
  changeable: readonly PreferenceChannel[];
  /** The Android notification channel its pushes are filed in; null for the shop console (web push). */
  androidChannel: string | null;
}

const FIXED_SHOP = "These reach everyone at your shop, so nobody misses one.";
const FIXED = "These can't be turned off.";
const ON = { push: true, email: true } as const;

/** In display order per audience. */
export const NOTIFICATION_CATEGORY_POLICY: readonly NotificationCategoryPolicy[] = [
  { audience: "customer", category: "orders", label: "Order updates", description: "When your order is confirmed, packed, on its way and delivered.", reason: null, required: false, marketing: false, defaults: ON, changeable: ["push", "email"], androidChannel: "orders" },
  { audience: "customer", category: "points", label: "Points", description: "When you get Effy points, and before they expire.", reason: null, required: false, marketing: false, defaults: ON, changeable: ["push", "email"], androidChannel: "points" },
  { audience: "customer", category: "offers", label: "Offers", description: "Deals and discounts from Effy.", reason: null, required: false, marketing: true, defaults: { push: true, email: false }, changeable: ["push", "email"], androidChannel: "offers_news" },
  { audience: "customer", category: "news", label: "News", description: "New products and seasonal picks from Effy.", reason: null, required: false, marketing: true, defaults: { push: true, email: false }, changeable: ["push", "email"], androidChannel: "offers_news" },
  { audience: "customer", category: "important", label: "Important", description: "Things you need to know, like a change to your delivery.", reason: FIXED, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: "important" },
  { audience: "customer", category: "support", label: "Support", description: "Replies from our team about your account or orders.", reason: FIXED, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: "important" },
  { audience: "driver", category: "work", label: "Work", description: "Runs assigned to you, and changes to them.", reason: "Work messages can't be turned off - they're part of your job.", required: true, marketing: false, defaults: ON, changeable: [], androidChannel: "work" },
  { audience: "driver", category: "announcements", label: "Announcements", description: "Messages from Effy to every driver.", reason: FIXED, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: "announcements" },
  { audience: "driver", category: "important", label: "Important", description: "Things you need to know now, like a change to today's work.", reason: FIXED, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: "important" },
  { audience: "shop", category: "orders", label: "Orders", description: "New orders to pick, orders waiting and refunds to approve.", reason: FIXED_SHOP, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: null },
  { audience: "shop", category: "stock", label: "Stock", description: "Products running low or out of stock.", reason: FIXED_SHOP, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: null },
  { audience: "shop", category: "products", label: "Products", description: "Effy's decisions about your products.", reason: FIXED_SHOP, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: null },
  { audience: "shop", category: "announcements", label: "Announcements", description: "Messages from Effy to every shop.", reason: FIXED_SHOP, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: null },
  { audience: "shop", category: "important", label: "Important", description: "Things you need to know now.", reason: FIXED_SHOP, required: true, marketing: false, defaults: ON, changeable: [], androidChannel: null },
];

export interface AndroidChannel {
  id: string;
  name: string;
  importance: "high" | "default";
}

/** The channels each Android app creates (111 R12). */
export const ANDROID_CHANNELS: { readonly customer: readonly AndroidChannel[]; readonly driver: readonly AndroidChannel[] } = {
  customer: [
    { id: "orders", name: "Order updates", importance: "high" },
    { id: "points", name: "Points", importance: "default" },
    { id: "offers_news", name: "Offers & news", importance: "default" },
    { id: "important", name: "Important", importance: "high" },
  ],
  driver: [
    { id: "work", name: "Work", importance: "high" },
    { id: "announcements", name: "Announcements", importance: "default" },
    { id: "important", name: "Important", importance: "high" },
  ],
};

/** An audience's categories, in display order. */
export function categoriesFor(audience: NotificationAudience): NotificationCategoryPolicy[] {
  return NOTIFICATION_CATEGORY_POLICY.filter((p) => p.audience === audience);
}

/** The policy of one audience's category, or null when the audience has no such category. */
export function findPolicy(audience: NotificationAudience, category: string): NotificationCategoryPolicy | null {
  return NOTIFICATION_CATEGORY_POLICY.find((p) => p.audience === audience && p.category === category) ?? null;
}

/** As findPolicy, but an undeclared pair is a programming error. */
export function policyFor(audience: NotificationAudience, category: string): NotificationCategoryPolicy {
  const p = findPolicy(audience, category);
  if (!p) throw new Error(`notification-categories: ${audience} has no category "${category}"`);
  return p;
}

/** The marketing categories a customer gives consent to (offers, news). */
export const MARKETING_CATEGORIES = NOTIFICATION_CATEGORY_POLICY.filter((p) => p.marketing).map((p) => p.category) as ("offers" | "news")[];
export type MarketingCategory = "offers" | "news";
