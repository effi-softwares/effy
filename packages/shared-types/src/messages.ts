// Back-office messages (112): what staff send to customers, drivers and shops.
//
// The kinds, who each may reach and which of the person's categories (111) it is filed under are declared ONCE here.
// The admin service refuses a pair this does not allow, the sending worker files each notification by it, back-office
// offers only what it allows, and messages.test.ts holds the migration's CHECK lists to it.
import type { CustomerDestination, DriverDestination, NotificationAudience, ShopDestination } from "./notification-destinations";

export type MessageKind = "announcement" | "important" | "offer" | "news" | "direct";

export type MessageStatus = "draft" | "scheduled" | "sending" | "sent" | "stopped" | "cancelled" | "withdrawn" | "not_sent";

export type MessageEventKind =
  | "created"
  | "duplicated"
  | "edited"
  | "test_sent"
  | "scheduled"
  | "sending"
  | "sent"
  | "stopped"
  | "cancelled"
  | "withdrawn"
  | "not_sent";

export interface MessageFiling {
  /** One of the audience's categories (notification-categories.ts). */
  category: string;
  importance: "normal" | "important";
}

export interface MessageKindDeclaration {
  kind: MessageKind;
  label: string;
  /** One line in the composer. */
  description: string;
  /** Only customers who said yes; the night hold and the limits apply (111). */
  marketing: boolean;
  /** Audiences in display order, each with its filing. An audience missing here may not be chosen. */
  filing: Partial<Record<NotificationAudience, MessageFiling>>;
}

const IMPORTANT: MessageFiling = { category: "important", importance: "important" };

/** In the composer's order. */
export const MESSAGE_KINDS: readonly MessageKindDeclaration[] = [
  {
    kind: "announcement",
    label: "Announcement",
    description: "News for drivers or shops, like a change to the hub's hours.",
    marketing: false,
    filing: {
      driver: { category: "announcements", importance: "normal" },
      shop: { category: "announcements", importance: "normal" },
    },
  },
  {
    kind: "important",
    label: "Important",
    description: "A service notice everyone must see, pinned until read. Never an offer.",
    marketing: false,
    filing: { customer: IMPORTANT, driver: IMPORTANT, shop: IMPORTANT },
  },
  {
    kind: "offer",
    label: "Offer",
    description: "A deal for customers who said yes to offers.",
    marketing: true,
    filing: { customer: { category: "offers", importance: "normal" } },
  },
  {
    kind: "news",
    label: "News",
    description: "New products or seasonal picks for customers who said yes to news.",
    marketing: true,
    filing: { customer: { category: "news", importance: "normal" } },
  },
  {
    kind: "direct",
    label: "Direct",
    description: "A message to one person, or one shop's staff.",
    marketing: false,
    filing: {
      customer: { category: "support", importance: "normal" },
      driver: { category: "work", importance: "normal" },
      shop: { category: "announcements", importance: "normal" },
    },
  },
];

export const MESSAGE_KIND_VALUES: readonly MessageKind[] = MESSAGE_KINDS.map((k) => k.kind);

export const MESSAGE_STATUSES: readonly MessageStatus[] = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "stopped",
  "cancelled",
  "withdrawn",
  "not_sent",
];

export const MESSAGE_EVENTS: readonly MessageEventKind[] = [
  "created",
  "duplicated",
  "edited",
  "test_sent",
  "scheduled",
  "sending",
  "sent",
  "stopped",
  "cancelled",
  "withdrawn",
  "not_sent",
];

export const MESSAGE_STATUS_WORDS: Readonly<Record<MessageStatus, string>> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  stopped: "Stopped",
  cancelled: "Cancelled",
  withdrawn: "Withdrawn",
  not_sent: "Not sent",
};

export const MESSAGE_AUDIENCE_WORDS: Readonly<Record<NotificationAudience, { one: string; many: string }>> = {
  customer: { one: "customer", many: "customers" },
  driver: { one: "driver", many: "drivers" },
  shop: { one: "shop staff member", many: "shop staff" },
};

/** "1,204 customers", "1 driver". */
export function peopleWords(audience: NotificationAudience | null, n: number): string {
  const count = n.toLocaleString("en-AU");
  if (!audience) return `${count} ${n === 1 ? "person" : "people"}`;
  const w = MESSAGE_AUDIENCE_WORDS[audience];
  return `${count} ${n === 1 ? w.one : w.many}`;
}

export function messageKind(kind: string): MessageKindDeclaration | null {
  return MESSAGE_KINDS.find((k) => k.kind === kind) ?? null;
}

export function messageFiling(kind: MessageKind, audience: NotificationAudience): MessageFiling | null {
  return messageKind(kind)?.filing[audience] ?? null;
}

export function audiencesFor(kind: MessageKind): NotificationAudience[] {
  return Object.keys(messageKind(kind)?.filing ?? {}) as NotificationAudience[];
}

/**
 * The words limits. The lock-screen lengths are where a typical phone cuts the line off (the composer marks them), not
 * limits: the inbox shows the whole text.
 */
export const MESSAGE_LIMITS = {
  title: 60,
  body: 500,
  lockScreen: {
    ios: { title: 40, body: 110 },
    android: { title: 40, body: 90 },
  },
  /** People chosen by hand or from a file. */
  people: 5000,
  postcodes: 500,
  groups: 100,
  shops: 1000,
  orderedWithinDays: 365,
  /** Picture upload. */
  pictureBytes: 5 * 1024 * 1024,
  pictureTypes: ["image/jpeg", "image/png", "image/webp"] as readonly string[],
  /** Important messages with no end stay pinned this long (110). */
  importantPinDays: 7,
} as const;

/** Offers and news must say who they are from (Spam Act; 111 FR-022). */
export function messageNamesEffy(title: string, body: string): boolean {
  return /effy/i.test(`${title} ${body}`);
}

export const MESSAGE_MUST_NAME_EFFY = "Offers and news must say they're from Effy.";

// ── The first name (115 E13) ─────────────────────────────────────────────────────────────────────────────────────

/** What staff type in a body. Never in a title: the title is on every lock screen. */
export const FIRST_NAME_PLACEHOLDER = "{first name}";
export const NAME_FALLBACK_DEFAULT = "there";
export const NAME_FALLBACK_LIMIT = 20;
export const TITLE_HAS_NAME = "A first name can't go in the title - it shows on the lock screen. Put it in the message.";

const PLACEHOLDER = /\{first name(?:\|([^{}]*))?\}/gi;

/** True when the text holds the placeholder in either form. */
export function hasFirstNamePlaceholder(text: string): boolean {
  return new RegExp(PLACEHOLDER.source, "i").test(text);
}

/** A fallback word staff may use: 1–20 characters, no braces or bar. */
export function validNameFallback(fallback: string): boolean {
  const t = fallback.trim();
  return t.length >= 1 && t.length <= NAME_FALLBACK_LIMIT && !/[{}|]/.test(t);
}

/**
 * How a body is STORED: every `{first name}` becomes `{first name|<fallback>}`, so whoever reads it later knows the
 * fallback. No name is ever stored (research R8).
 */
export function normaliseFirstName(text: string, fallback: string): string {
  return text.replace(PLACEHOLDER, () => `{first name|${fallback.trim()}}`);
}

/**
 * The ONE filling of the placeholder. `firstName` null fills the fallback - which is what the phone notification always
 * gets, so no name is ever on a lock screen (FR-023). A bare `{first name}` with no stored fallback fills "there".
 */
export function fillFirstName(text: string, firstName: string | null): string {
  const name = firstName?.trim() || null;
  return text.replace(PLACEHOLDER, (_m, fallback: string | undefined) => name ?? (fallback?.trim() || NAME_FALLBACK_DEFAULT));
}

/** A driver's or shop staff member's first name: the first word of their name, or null (FR-022). */
export function firstWordOf(name: string | null | undefined): string | null {
  const w = name?.trim().split(/\s+/)[0];
  return w ? w : null;
}

// ── Audience filters (R4): a closed shape per audience; {} = everyone in it ───────────────────────────────────────

export interface CustomerAudienceFilter {
  /** Customer ids, chosen by hand or resolved from a file of emails. */
  people?: string[];
  /** Has a saved address in one of these postcodes. */
  postcodes?: string[];
  /** Has a saved address in a postcode on one of these coverage groups' lists. */
  groups?: string[];
  /** Has a paid order placed in the last N days (1–365). */
  orderedWithinDays?: number;
  /** Has no paid order. */
  neverOrdered?: true;
  /** Has a usable points balance. */
  hasPoints?: true;
  /** Has a phone signed in to the app. */
  appUsers?: true;
  /**
   * 115: the people one automatic message's run found (`message_automation_recipient`). Written by the sending worker
   * only, with the automation's own filter beside it; the shared parser refuses it from staff.
   */
  automationRun?: string;
}

export type DriverFunction = "collection" | "delivery";

export interface DriverAudienceFilter {
  people?: string[];
  onDuty?: true;
  workToday?: true;
  collectionToday?: true;
  deliveryToday?: true;
  /** Cleared for a function in an area (zoneId null = everywhere). */
  clearance?: { function: DriverFunction; zoneId: string | null };
}

export interface ShopAudienceFilter {
  /** Shop ids. */
  shops?: string[];
  /** Only staff with the shop_manager role. */
  managersOnly?: true;
}

export type AudienceFilter = CustomerAudienceFilter | DriverAudienceFilter | ShopAudienceFilter;

export interface AudienceFilterByAudience {
  customer: CustomerAudienceFilter;
  driver: DriverAudienceFilter;
  shop: ShopAudienceFilter;
}

/** True when the filter narrows nothing (everyone in the audience). */
export function isEveryone(filter: AudienceFilter): boolean {
  return Object.keys(filter).length === 0;
}

// ── DTOs (contracts/messages-api.md) ──────────────────────────────────────────────────────────────────────────────

export type MessageDestination = CustomerDestination | DriverDestination | ShopDestination;

export interface MessageAudienceDraft {
  audience: NotificationAudience;
  filter: AudienceFilter;
  destination: MessageDestination;
}

/** The body of create and edit. */
export interface MessageDraftDTO {
  kind: MessageKind;
  title: string;
  body: string;
  pictureKey: string | null;
  push: boolean;
  /** 115: also by email (customer audiences only). */
  email: boolean;
  /** 115: the word in place of `{first name}` when someone has none, and on every lock screen. */
  nameFallback: string;
  /** ISO 8601, or null. */
  endsAt: string | null;
  audiences: MessageAudienceDraft[];
}

export interface MessageCreateRequest extends MessageDraftDTO {
  /** The message this one was duplicated from. */
  fromMessageId?: string;
}

export interface MessageUpdateRequest extends MessageDraftDTO {
  version: number;
}

export interface MessagePushReportDTO {
  sent: number;
  noDevice: number;
  failed: number;
  muted: number;
  turnedOff: number;
  overLimit: number;
  heldForNight: number;
  waiting: number;
  notSentEnded: number;
}

/**
 * 115: each recipient's email, in parts that add up to `reached` (A1). Unsubscribes are beside it, not in it: someone
 * who unsubscribed from this email was also sent it.
 */
export interface MessageEmailReportDTO {
  sent: number;
  failed: number;
  /** Still pending: held for the night, or not yet sent. */
  heldForNight: number;
  waiting: number;
  overLimit: number;
  notSent: { noAddress: number; turnedOff: number; suppressed: number; ended: number };
  /** Beside the sum. */
  unsubscribed: number;
}

/** Each group's parts add up to its total (FR-023). */
export interface MessageReportDTO {
  matched: number;
  reached: number;
  /** Offer and news only: matched − reached. */
  noConsent: number;
  push: MessagePushReportDTO;
  /** 115: null when the message had no email. */
  email: MessageEmailReportDTO | null;
  seen: number;
  opened: number;
  archived: number;
}

export interface MessageAudienceDTO extends MessageAudienceDraft {
  report: MessageReportDTO | null;
}

export interface MessageDTO {
  id: string;
  kind: MessageKind;
  title: string;
  body: string;
  pictureKey: string | null;
  pictureUrl: string | null;
  push: boolean;
  email: boolean;
  nameFallback: string;
  /** 115: the automatic message this send came from, or null. */
  automationId: string | null;
  endsAt: string | null;
  audiences: MessageAudienceDTO[];
  status: MessageStatus;
  notSentReason: "too_many_recipients" | null;
  sendAt: string | null;
  sentAt: string | null;
  withdrawnAt: string | null;
  duplicatedFrom: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  total: MessageReportDTO | null;
  reportFrozenAt: string | null;
}

/** A row of the Messages list. */
export interface MessageRowDTO {
  id: string;
  title: string;
  kind: MessageKind;
  audiences: NotificationAudience[];
  status: MessageStatus;
  sendAt: string | null;
  sentAt: string | null;
  createdAt: string;
  reached: number;
  /** 0–1, or null before anyone was reached. */
  openedShare: number | null;
}

export interface MessageAudienceCountRequest {
  kind: MessageKind;
  audiences: { audience: NotificationAudience; filter: AudienceFilter }[];
  /** Emails from a file, resolved to customer ids. */
  resolve?: { emails: string[] };
}

export interface MessageAudienceCountDTO {
  audiences: { audience: NotificationAudience; matched: number; consented: number | null }[];
  /** The people one send would reach: consented for offers and news, else matched. */
  total: number;
  resolved?: { ids: string[]; notFound: number; repeated: number };
}

export interface MessagePictureUploadRequest {
  contentType: string;
  fileSize: number;
}

export interface MessagePictureUploadDTO {
  uploadUrl: string;
  key: string;
}

export interface MessageTestRequest {
  audience: NotificationAudience;
  /** A customer id, a driver id, or a shop staff id. */
  personId: string;
}

export interface MessageTestDTO {
  inbox: "written" | "not_written";
  reason: "no_consent" | null;
  push: "queued" | "skipped" | "capped" | "held" | "none";
}

export interface MessageSendRequest {
  version: number;
  /** ISO 8601; absent (or in the past) = now. */
  sendAt?: string;
  /** The number of people the sender was shown. */
  confirmCount: number;
  /** Required for a customer audience with no filter: the count, typed. */
  typedCount?: number;
}

export interface MessageActionRequest {
  version: number;
}
