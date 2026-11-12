// 115 (backlog E12): messages that send themselves - on a trigger ("hasn't ordered for N days", "items left in the cart
// for N hours") or on a repeat (every day, week or month at a time on Effy's clock). Each run becomes an ordinary
// message (112), so its sending, report and safeguards are 112's.
import type { AudienceFilter, MessageDestination, MessageKind } from "./messages";
import type { NotificationAudience } from "./notification-destinations";

export type AutomationMode = "trigger" | "repeat";
export type AutomationStatus = "active" | "paused" | "finished";
export type TriggerKind = "not_ordered_days" | "cart_left_hours";
export type RepeatEvery = "day" | "week" | "month";

export interface TriggerDeclaration {
  kind: TriggerKind;
  /** The composer's words: "Hasn't ordered for {n} days". */
  label: string;
  unit: "days" | "hours";
  min: number;
  max: number;
  /** How often the worker looks (Effy clock). */
  cadence: "daily" | "hourly";
}

/** Triggered messages are offers or news to customers (FR-014): both are commercial messages, so consent applies. */
export const TRIGGERS: readonly TriggerDeclaration[] = [
  { kind: "not_ordered_days", label: "Hasn't ordered for", unit: "days", min: 7, max: 365, cadence: "daily" },
  { kind: "cart_left_hours", label: "Left items in the cart for", unit: "hours", min: 1, max: 72, cadence: "hourly" },
];

export const TRIGGER_KINDS: readonly MessageKind[] = ["offer", "news"];

/** The daily trigger's run time on Effy's clock. */
export const DAILY_TRIGGER_HOUR = 7;

export function trigger(kind: TriggerKind): TriggerDeclaration {
  return TRIGGERS.find((t) => t.kind === kind)!;
}

export const REPEAT_EVERY: readonly { every: RepeatEvery; label: string }[] = [
  { every: "day", label: "Every day" },
  { every: "week", label: "Every week" },
  { every: "month", label: "Every month" },
];

/** ISO weekdays, Monday first. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface RepeatSchedule {
  every: RepeatEvery;
  /** ISO weekdays (1 = Monday … 7 = Sunday), for `week`. */
  days: number[] | null;
  /** 1–28, for `month`. */
  date: number | null;
  /** "HH:MM" on Effy's clock. */
  time: string;
  /** "YYYY-MM-DD". */
  startsOn: string;
  endsOn: string | null;
}

export interface AutomationDraft {
  name: string;
  kind: MessageKind;
  audience: NotificationAudience;
  filter: AudienceFilter;
  destination: MessageDestination;
  title: string;
  body: string;
  pictureKey: string | null;
  push: boolean;
  email: boolean;
  nameFallback: string;
  mode: AutomationMode;
  trigger: { kind: TriggerKind; value: number } | null;
  repeat: RepeatSchedule | null;
}

export interface AutomationUpdate extends AutomationDraft {
  version: number;
}

export interface AutomationStateChange {
  action: "pause" | "resume" | "end";
  version: number;
}

export interface AutomationRunDTO {
  id: string;
  ranAt: string;
  matched: number;
  messageId: string | null;
  outcome: "sent_to_message" | "nobody" | "waited";
}

export interface AutomationDTO extends AutomationDraft {
  id: string;
  status: AutomationStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  activatedAt: string;
  version: number;
  createdBy: string;
  createdAt: string;
  mayEdit: boolean;
  runs: AutomationRunDTO[];
}

export interface AutomationRowDTO {
  id: string;
  name: string;
  kind: MessageKind;
  audience: NotificationAudience;
  mode: AutomationMode;
  /** "Every Friday at 9:00" / "Hasn't ordered for 30 days". */
  when: string;
  status: AutomationStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

/** Plain words for when an automatic message sends. */
export function automationWhenWords(a: Pick<AutomationDraft, "mode" | "trigger" | "repeat">): string {
  if (a.mode === "trigger" && a.trigger) {
    const t = trigger(a.trigger.kind);
    return `${t.label} ${a.trigger.value} ${a.trigger.value === 1 ? t.unit.slice(0, -1) : t.unit}`;
  }
  const r = a.repeat;
  if (!r) return "";
  const at = `at ${r.time}`;
  if (r.every === "day") return `Every day ${at}`;
  if (r.every === "week") {
    const days = [...(r.days ?? [])].sort((x, y) => x - y).map((d) => WEEKDAY_LABELS[d - 1]).join(", ");
    return `Every ${days} ${at}`;
  }
  return `Every month on the ${ordinal(r.date ?? 1)} ${at}`;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

// ── The next run, on Effy's clock ────────────────────────────────────────────────────────────────────────────────

interface Parts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
}

function partsIn(instant: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const v = (t: string) => Number(f.find((p) => p.type === t)!.value);
  return { y: v("year"), m: v("month"), d: v("day"), hh: v("hour"), mm: v("minute") };
}

/** The instant that reads `y-m-d hh:mm` on the wall clock of `tz` (the first one, across a clock change). */
export function wallTimeToInstant(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const want = Date.UTC(y, m - 1, d, hh, mm);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const p = partsIn(new Date(guess), tz);
    const got = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
    const diff = want - got;
    if (diff === 0) return new Date(guess);
    guess += diff;
  }
  // A wall time skipped by a clock change: the instant after the jump.
  return new Date(guess);
}

/** ISO weekday (1 = Monday) of a calendar date. */
function isoWeekday(y: number, m: number, d: number): number {
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * The first due time strictly after `after`, or null when the schedule has ended. Pure: the worker and the tests call
 * it with their own clock. A run that had to wait (US4 scenario 5) advances from now, so it is never doubled (L6).
 */
export function nextRunAt(schedule: RepeatSchedule, after: Date, tz: string): Date | null {
  const [hh, mm] = schedule.time.split(":").map(Number) as [number, number];
  const start = partsIn(after, tz);
  const base = Date.UTC(start.y, start.m - 1, start.d);
  for (let i = 0; i <= 400; i++) {
    const day = new Date(base + i * 86_400_000);
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const date = ymd(y, m, d);
    if (date < schedule.startsOn) continue;
    if (schedule.endsOn && date > schedule.endsOn) return null;
    const due =
      schedule.every === "day" ||
      (schedule.every === "week" && (schedule.days ?? []).includes(isoWeekday(y, m, d))) ||
      (schedule.every === "month" && schedule.date === d);
    if (!due) continue;
    const at = wallTimeToInstant(y, m, d, hh, mm, tz);
    if (at.getTime() > after.getTime()) return at;
  }
  return null;
}

/** The time a daily trigger next looks, strictly after `after` (07:00 Effy time). */
export function nextDailyTriggerAt(after: Date, tz: string): Date {
  return nextRunAt(
    { every: "day", days: null, date: null, time: `${String(DAILY_TRIGGER_HOUR).padStart(2, "0")}:00`, startsOn: "2000-01-01", endsOn: null },
    after,
    tz,
  )!;
}

/** The next whole hour strictly after `after`. */
export function nextHourlyTriggerAt(after: Date): Date {
  const t = new Date(after.getTime());
  t.setUTCMinutes(0, 0, 0);
  return new Date(t.getTime() + 3_600_000);
}
