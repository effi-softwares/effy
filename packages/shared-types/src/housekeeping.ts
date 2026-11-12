/**
 * 113 - the clean-ups that run by themselves (Settings › Clean-ups): unpaid orders, account erasure and phone
 * registrations. Declared once: the job keys equal `housekeeping_run_job_check`, each job's counts and their words are
 * here, and the staleness bound is shared by the page and the alarms (infra/envs/dev/housekeeping.tf).
 */

import type { WireInt } from "./cart"

export const HOUSEKEEPING_JOB_KEYS = ["unpaid_orders", "account_erasure", "phone_registrations"] as const
export type HousekeepingJob = (typeof HOUSEKEEPING_JOB_KEYS)[number]

export type HousekeepingOutcome = "ok" | "partial" | "failed"
export type HousekeepingAttention = "failed" | "partial" | "late"

export interface HousekeepingJobSpec {
  job: HousekeepingJob
  title: string
  /** What it does, one sentence (the page's row). */
  summary: string
  /** How often it runs, in minutes, and in words. */
  everyMinutes: number
  everyWords: string
  /** No run within this long is "late" (the page) and breaching (the alarm). */
  staleAfterMinutes: number
  /** Count keys in the order they are said, with their words ("{n}" is the number). */
  counts: readonly { key: string; one: string; many: string }[]
}

export const HOUSEKEEPING_JOBS: readonly HousekeepingJobSpec[] = [
  {
    job: "unpaid_orders",
    title: "Unpaid orders",
    summary: "Closes orders nobody paid for and frees their points, codes and delivery places.",
    everyMinutes: 15,
    everyWords: "Every 15 minutes",
    staleAfterMinutes: 60,
    counts: [
      { key: "closed", one: "Closed {n} unpaid order", many: "Closed {n} unpaid orders" },
      { key: "stillPaying", one: "{n} still being paid", many: "{n} still being paid" },
      { key: "paidLate", one: "{n} paid at the last moment", many: "{n} paid at the last moment" },
      { key: "unreachable", one: "{n} left: payments couldn't be checked", many: "{n} left: payments couldn't be checked" },
      { key: "lateRefunds", one: "Refunded {n} late payment", many: "Refunded {n} late payments" },
    ],
  },
  {
    job: "account_erasure",
    title: "Account erasure",
    summary: "Erases accounts whose owners deleted them, on the date they were told.",
    everyMinutes: 60,
    everyWords: "Every hour",
    staleAfterMinutes: 120,
    counts: [
      { key: "erased", one: "Erased {n} account", many: "Erased {n} accounts" },
      { key: "pointsForfeited", one: "{n} point forfeited", many: "{n} points forfeited" },
      { key: "ordersScrubbedLater", one: "{n} finished order cleared", many: "{n} finished orders cleared" },
      { key: "retried", one: "{n} to try again", many: "{n} to try again" },
    ],
  },
  {
    job: "phone_registrations",
    title: "Phone registrations",
    summary: "Removes phones that haven't opened an Effy app for 270 days.",
    everyMinutes: 1440,
    everyWords: "Once a day",
    staleAfterMinutes: 1560,
    counts: [{ key: "removed", one: "Removed {n} registration", many: "Removed {n} registrations" }],
  },
]

export function housekeepingJob(job: HousekeepingJob): HousekeepingJobSpec {
  return HOUSEKEEPING_JOBS.find((j) => j.job === job)!
}

/** "Closed 14 unpaid orders · 1 still being paid". Zero counts are left out; nothing done says "Nothing to do". */
export function runWords(job: HousekeepingJob, counts: Readonly<Record<string, number>>): string {
  const parts = housekeepingJob(job)
    .counts.filter((c) => (counts[c.key] ?? 0) > 0)
    .map((c) => {
      const n = counts[c.key]!
      return (n === 1 ? c.one : c.many).replace("{n}", n.toLocaleString("en-AU"))
    })
  return parts.length === 0 ? "Nothing to do" : parts.join(" · ")
}

/** The abandon time's bounds (the CHECK on `housekeeping_settings.abandon_after_min`). */
export const ABANDON_LIMITS = { min: 60, max: 10080, default: 1440 } as const

/**
 * 114: how long checkout holds stock after the shopper presses Pay, in minutes. Never longer than the shortest abandon
 * time, so a hold never outlives its order.
 */
export const STOCK_HOLD_LIMITS = { min: 5, max: 60, default: 15 } as const

/** "24 hours", "90 minutes", "7 days". Days only from two days, so the default reads as the spec says it. */
export function abandonWords(minutes: number): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`
  if (minutes >= 2880 && minutes % 1440 === 0) return plural(minutes / 1440, "day")
  if (minutes % 60 === 0) return plural(minutes / 60, "hour")
  return plural(minutes, "minute")
}

export interface HousekeepingRunDTO {
  startedAt: string
  finishedAt: string
  outcome: HousekeepingOutcome
  counts: Record<string, WireInt>
  /** Fixed words or an error's class name; never personal data. */
  problem: string | null
}

export interface HousekeepingJobDTO {
  job: HousekeepingJob
  lastRun: HousekeepingRunDTO | null
  /** A statement of the schedule, not a promise. Null before the first run. */
  nextRunAt: string | null
  attention: HousekeepingAttention | null
}

/** GET /orders/v1/housekeeping */
export interface HousekeepingDTO {
  abandonAfterMinutes: WireInt
  /** 114: how long checkout holds stock (STOCK_HOLD_LIMITS). */
  stockHoldMinutes: WireInt
  /** The stored `updated_at`, sent back on a change. */
  version: string
  mayEdit: boolean
  jobs: HousekeepingJobDTO[]
}

/** PUT /orders/v1/housekeeping/settings (admins only). At least one of the two settings. */
export interface HousekeepingSettingsUpdate {
  abandonAfterMinutes?: WireInt
  stockHoldMinutes?: WireInt
  version: string
}
