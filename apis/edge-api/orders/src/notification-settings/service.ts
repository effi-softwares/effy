// The promotion limits staff set (111 US3): how many promotional pushes a customer who said yes may get in a day and
// in a week, and (112) the most people one back-office message may reach. Read by notify() and the messages routes;
// written only here, with every changed field recorded for the activity drawer. Admin and manager may change the
// promotion limits; only an administrator the largest message; any active staff may read.
import { staffNameSql, type Queryable } from "@effy/edge-shared";
import type { NotificationSettingsDTO, NotificationSettingsUpdate } from "@effy/shared-types";

export const LIMITS = { day: { min: 0, max: 20 }, week: { min: 0, max: 100 }, message: { min: 1, max: 200_000 } } as const;

export class NotificationSettingsInvalid extends Error {}
/** A manager tried to change the largest message (112 FR-021). */
export class NotificationSettingsForbidden extends Error {}

interface Row {
  promo_push_per_day: number;
  promo_push_per_week: number;
  max_recipients_per_message: number;
  updated_at: Date;
  updated_by: string;
  updated_by_name: string | null;
}

export async function readNotificationSettings(db: Queryable): Promise<NotificationSettingsDTO> {
  const res = await db.query<Row>(
    `SELECT promo_push_per_day, promo_push_per_week, max_recipients_per_message, updated_at, updated_by,
            ${staffNameSql("s.updated_by")} AS updated_by_name
       FROM public.notification_settings s WHERE s.id = 1`,
  );
  const r = res.rows[0];
  if (!r) throw new Error("notification_settings has no row");
  return {
    promoPushPerDay: r.promo_push_per_day,
    promoPushPerWeek: r.promo_push_per_week,
    maxRecipientsPerMessage: r.max_recipients_per_message,
    updatedAt: new Date(r.updated_at).toISOString(),
    // The seeded row was written by the migration, not a person.
    updatedBy: r.updated_by === "migration" ? "Effy" : (r.updated_by_name ?? "Former staff"),
  };
}

/** Both numbers, whole, in range, and the week at least the day (FR-020). */
export function parseNotificationSettings(body: Record<string, unknown> | null): NotificationSettingsUpdate {
  if (!body) throw new NotificationSettingsInvalid("a settings object is required");
  const unknown = Object.keys(body).find((k) => k !== "promoPushPerDay" && k !== "promoPushPerWeek" && k !== "maxRecipientsPerMessage");
  if (unknown) throw new NotificationSettingsInvalid(`${unknown} is not a notification setting`);
  const day = body.promoPushPerDay;
  const week = body.promoPushPerWeek;
  if (typeof day !== "number" || !Number.isInteger(day) || day < LIMITS.day.min || day > LIMITS.day.max) {
    throw new NotificationSettingsInvalid(`the daily limit must be a whole number from ${LIMITS.day.min} to ${LIMITS.day.max}`);
  }
  if (typeof week !== "number" || !Number.isInteger(week) || week < LIMITS.week.min || week > LIMITS.week.max) {
    throw new NotificationSettingsInvalid(`the weekly limit must be a whole number from ${LIMITS.week.min} to ${LIMITS.week.max}`);
  }
  if (week < day) throw new NotificationSettingsInvalid("the weekly limit can't be lower than the daily limit");
  const largest = body.maxRecipientsPerMessage;
  if (typeof largest !== "number" || !Number.isInteger(largest) || largest < LIMITS.message.min || largest > LIMITS.message.max) {
    throw new NotificationSettingsInvalid(`the largest message must be a whole number from ${LIMITS.message.min} to ${LIMITS.message.max.toLocaleString("en-AU")}`);
  }
  return { promoPushPerDay: day, promoPushPerWeek: week, maxRecipientsPerMessage: largest };
}

/**
 * One transaction: lock the row, write the new values, record each field that changed. `mayChangeLargest` is whether the
 * actor is an administrator: a manager's change to the largest message is refused (the rest of theirs still applies).
 */
export async function updateNotificationSettings(
  tx: Queryable,
  actorSub: string,
  update: NotificationSettingsUpdate,
  mayChangeLargest = false,
): Promise<void> {
  const before = (await tx.query<{ promo_push_per_day: number; promo_push_per_week: number; max_recipients_per_message: number }>(
    `SELECT promo_push_per_day, promo_push_per_week, max_recipients_per_message FROM public.notification_settings WHERE id = 1 FOR UPDATE`,
  )).rows[0]!;
  const changed: Array<[string, number, number]> = [];
  if (before.promo_push_per_day !== update.promoPushPerDay) changed.push(["promoPushPerDay", before.promo_push_per_day, update.promoPushPerDay]);
  if (before.promo_push_per_week !== update.promoPushPerWeek) changed.push(["promoPushPerWeek", before.promo_push_per_week, update.promoPushPerWeek]);
  if (before.max_recipients_per_message !== update.maxRecipientsPerMessage) {
    if (!mayChangeLargest) throw new NotificationSettingsForbidden("only an administrator can change the largest message");
    changed.push(["maxRecipientsPerMessage", before.max_recipients_per_message, update.maxRecipientsPerMessage]);
  }
  if (changed.length === 0) return;
  await tx.query(
    `UPDATE public.notification_settings
        SET promo_push_per_day = $1, promo_push_per_week = $2, max_recipients_per_message = $4, updated_by = $3, updated_at = now()
      WHERE id = 1`,
    [update.promoPushPerDay, update.promoPushPerWeek, actorSub, update.maxRecipientsPerMessage],
  );
  await tx.query(
    `INSERT INTO public.notification_settings_change (field, old_value, new_value, changed_by)
     SELECT f, o, n, $4 FROM unnest($1::text[], $2::text[], $3::text[]) AS c(f, o, n)`,
    [changed.map((c) => c[0]), changed.map((c) => String(c[1])), changed.map((c) => String(c[2])), actorSub],
  );
}
