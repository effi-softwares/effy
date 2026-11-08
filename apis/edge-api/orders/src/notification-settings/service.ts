// The promotion limits staff set (111 US3): how many promotional pushes a customer who said yes may get in a day and
// in a week. Read by notify() everywhere (edge-shared preferences.ts); written only here, with every changed field
// recorded for the activity drawer. Admin and manager may change them; any active staff may read.
import { staffNameSql, type Queryable } from "@effy/edge-shared";
import type { NotificationSettingsDTO, NotificationSettingsUpdate } from "@effy/shared-types";

export const LIMITS = { day: { min: 0, max: 20 }, week: { min: 0, max: 100 } } as const;

export class NotificationSettingsInvalid extends Error {}

interface Row { promo_push_per_day: number; promo_push_per_week: number; updated_at: Date; updated_by: string; updated_by_name: string | null }

export async function readNotificationSettings(db: Queryable): Promise<NotificationSettingsDTO> {
  const res = await db.query<Row>(
    `SELECT promo_push_per_day, promo_push_per_week, updated_at, updated_by,
            ${staffNameSql("s.updated_by")} AS updated_by_name
       FROM public.notification_settings s WHERE s.id = 1`,
  );
  const r = res.rows[0];
  if (!r) throw new Error("notification_settings has no row");
  return {
    promoPushPerDay: r.promo_push_per_day,
    promoPushPerWeek: r.promo_push_per_week,
    updatedAt: new Date(r.updated_at).toISOString(),
    // The seeded row was written by the migration, not a person.
    updatedBy: r.updated_by === "migration" ? "Effy" : (r.updated_by_name ?? "Former staff"),
  };
}

/** Both numbers, whole, in range, and the week at least the day (FR-020). */
export function parseNotificationSettings(body: Record<string, unknown> | null): NotificationSettingsUpdate {
  if (!body) throw new NotificationSettingsInvalid("a settings object is required");
  const unknown = Object.keys(body).find((k) => k !== "promoPushPerDay" && k !== "promoPushPerWeek");
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
  return { promoPushPerDay: day, promoPushPerWeek: week };
}

/** One transaction: lock the row, write the new values, record each field that changed. */
export async function updateNotificationSettings(tx: Queryable, actorSub: string, update: NotificationSettingsUpdate): Promise<void> {
  const before = (await tx.query<{ promo_push_per_day: number; promo_push_per_week: number }>(
    `SELECT promo_push_per_day, promo_push_per_week FROM public.notification_settings WHERE id = 1 FOR UPDATE`,
  )).rows[0]!;
  const changed: Array<[string, number, number]> = [];
  if (before.promo_push_per_day !== update.promoPushPerDay) changed.push(["promoPushPerDay", before.promo_push_per_day, update.promoPushPerDay]);
  if (before.promo_push_per_week !== update.promoPushPerWeek) changed.push(["promoPushPerWeek", before.promo_push_per_week, update.promoPushPerWeek]);
  if (changed.length === 0) return;
  await tx.query(
    `UPDATE public.notification_settings
        SET promo_push_per_day = $1, promo_push_per_week = $2, updated_by = $3, updated_at = now()
      WHERE id = 1`,
    [update.promoPushPerDay, update.promoPushPerWeek, actorSub],
  );
  await tx.query(
    `INSERT INTO public.notification_settings_change (field, old_value, new_value, changed_by)
     SELECT f, o, n, $4 FROM unnest($1::text[], $2::text[], $3::text[]) AS c(f, o, n)`,
    [changed.map((c) => c[0]), changed.map((c) => String(c[1])), changed.map((c) => String(c[2])), actorSub],
  );
}
