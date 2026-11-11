// A person's notification choices and marketing consent (111): what the preference routes send and take.
// Contracts: specs/111-notification-preferences/contracts/preferences-api.md. Words are not on the wire: clients read
// labels and reasons from notification-categories.ts and the consent wording from @effy/legal-content.

import type { PreferenceChannel } from "./notification-categories";

export type ConsentSurface = "app" | "web";
export type ConsentVia = "settings" | "prompt" | "inbox";

/** One category as the customer sees it: the effective choice per channel (theirs, else the default). */
export interface PreferenceCategoryDTO {
  category: string;
  required: boolean;
  marketing: boolean;
  /** For a marketing category, the push choice; it takes effect only while consent is granted. */
  push: boolean;
  email: boolean;
  /** The channels the customer may change; empty when required. */
  changeable: PreferenceChannel[];
}

export interface ConsentStateDTO {
  granted: boolean;
  /** ISO 8601; null when they have never answered. */
  answeredAt: string | null;
}

export interface MarketingConsentDTO {
  offers: ConsentStateDTO;
  news: ConsentStateDTO;
}

/** `GET` / `PATCH /customer/v1/notification-preferences`. */
export interface NotificationPreferencesDTO {
  categories: PreferenceCategoryDTO[];
  consent: MarketingConsentDTO;
  /** Show the one-time offers ask: they have never answered and have at least one paid order. */
  askForOffers: boolean;
  /** The consent wording version the server holds as current. */
  wordingVersion: string;
}

export interface PreferenceChoiceChange {
  category: string;
  channel: PreferenceChannel;
  enabled: boolean;
}

export interface ConsentChange {
  offers?: boolean;
  news?: boolean;
}

/** `PATCH /customer/v1/notification-preferences`: all or nothing. */
export interface NotificationPreferencesChange {
  surface: ConsentSurface;
  /** Where a consent answer was given; required with `consent`. */
  via?: ConsentVia;
  changes?: PreferenceChoiceChange[];
  consent?: ConsentChange;
  /** The wording version shown; required with `consent`, and must be the current one (else 409). */
  wordingVersion?: string;
}

/** `GET /orders/v1/customers/{customerId}/notification-preferences` (back-office, read-only). */
export interface StaffNotificationPreferencesDTO {
  categories: PreferenceCategoryDTO[];
  consent: MarketingConsentDTO;
}

/** `GET` / `PUT /orders/v1/notifications/settings`. */
export interface NotificationSettingsDTO {
  promoPushPerDay: number;
  promoPushPerWeek: number;
  /** The most people one back-office message may reach (112). Only administrators change it. */
  maxRecipientsPerMessage: number;
  updatedAt: string;
  updatedBy: string;
}

export interface NotificationSettingsUpdate {
  promoPushPerDay: number;
  promoPushPerWeek: number;
  maxRecipientsPerMessage: number;
}
