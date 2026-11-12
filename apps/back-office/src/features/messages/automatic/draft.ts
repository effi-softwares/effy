import {
  NAME_FALLBACK_DEFAULT,
  TRIGGER_KINDS,
  TRIGGERS,
  trigger as triggerOf,
  type AutomationDraft,
  type AutomationDTO,
  type MessageKind,
  type NotificationAudience,
  type RepeatEvery,
  type TriggerKind,
} from "@effy/shared-types"

import { AUDIENCES, draftProblems, emptyDraft, withKind, type MessageDraft } from "../draft"

/** The automatic-message composer's state (115): a message draft for ONE audience, a name, and when it sends. */
export interface AutomaticDraft {
  name: string
  mode: "trigger" | "repeat"
  triggerKind: TriggerKind
  triggerValue: number
  every: RepeatEvery
  days: number[]
  date: number
  /** "HH:MM", Effy's clock. */
  time: string
  /** "YYYY-MM-DD". */
  startsOn: string
  endsOn: string
  message: MessageDraft
}

const today = () => new Date().toISOString().slice(0, 10)

export function emptyAutomatic(mode: "trigger" | "repeat" = "trigger"): AutomaticDraft {
  const kind: MessageKind = mode === "trigger" ? "offer" : "announcement"
  return {
    name: "",
    mode,
    triggerKind: "not_ordered_days",
    triggerValue: 30,
    every: "week",
    days: [5],
    date: 1,
    time: "09:00",
    startsOn: today(),
    endsOn: "",
    message: { ...emptyDraft(kind), email: false, nameFallback: NAME_FALLBACK_DEFAULT },
  }
}

export function automaticOf(a: AutomationDTO): AutomaticDraft {
  const base = emptyAutomatic(a.mode)
  const message = emptyDraft(a.kind)
  for (const aud of AUDIENCES) message.audiences[aud] = { ...message.audiences[aud], on: false }
  message.audiences[a.audience] = { on: true, filter: a.filter, destination: a.destination }
  return {
    ...base,
    name: a.name,
    mode: a.mode,
    triggerKind: a.trigger?.kind ?? base.triggerKind,
    triggerValue: a.trigger?.value ?? base.triggerValue,
    every: a.repeat?.every ?? base.every,
    days: a.repeat?.days ?? base.days,
    date: a.repeat?.date ?? base.date,
    time: a.repeat?.time ?? base.time,
    startsOn: a.repeat?.startsOn ?? base.startsOn,
    endsOn: a.repeat?.endsOn ?? "",
    message: {
      ...message,
      title: a.title,
      body: a.body,
      pictureKey: a.pictureKey,
      pictureUrl: null,
      push: a.push,
      email: a.email,
      nameFallback: a.nameFallback,
    },
  }
}

/** An automatic message goes to one audience: turning one on turns the others off. */
export function oneAudience(prev: MessageDraft, next: MessageDraft): MessageDraft {
  const added = AUDIENCES.find((a) => next.audiences[a].on && !prev.audiences[a].on)
  if (!added) return next
  const audiences = { ...next.audiences }
  for (const a of AUDIENCES) if (a !== added) audiences[a] = { ...audiences[a], on: false }
  return { ...next, audiences }
}

/** Changing to a trigger keeps the kind only if it is an offer or news (FR-014), and the audience customers. */
export function withMode(d: AutomaticDraft, mode: "trigger" | "repeat"): AutomaticDraft {
  if (mode === "repeat") return { ...d, mode }
  const kind = TRIGGER_KINDS.includes(d.message.kind) ? d.message.kind : "offer"
  const m = withKind(d.message, kind)
  const audiences = { ...m.audiences }
  for (const a of AUDIENCES) audiences[a] = { ...audiences[a], on: a === "customer" }
  return { ...d, mode, message: { ...m, audiences } }
}

export function audienceOf(d: AutomaticDraft): NotificationAudience | null {
  return AUDIENCES.find((a) => d.message.audiences[a].on) ?? null
}

export function bodyOfAutomatic(d: AutomaticDraft): AutomationDraft {
  const audience = audienceOf(d) ?? "customer"
  const m = d.message
  return {
    name: d.name.trim(),
    kind: m.kind,
    audience,
    filter: m.audiences[audience].filter,
    destination: m.audiences[audience].destination,
    title: m.title.trim(),
    body: m.body.trim(),
    pictureKey: m.pictureKey,
    push: m.push,
    email: m.email && audience === "customer",
    nameFallback: m.nameFallback.trim() || NAME_FALLBACK_DEFAULT,
    mode: d.mode,
    trigger: d.mode === "trigger" ? { kind: d.triggerKind, value: d.triggerValue } : null,
    repeat:
      d.mode === "repeat"
        ? {
            every: d.every,
            days: d.every === "week" ? [...d.days].sort((x, y) => x - y) : null,
            date: d.every === "month" ? d.date : null,
            time: d.time,
            startsOn: d.startsOn,
            endsOn: d.endsOn || null,
          }
        : null,
  }
}

/** What stops a save, in words, before the server is asked (it checks all of it again). */
export function automaticProblems(d: AutomaticDraft): string[] {
  const out: string[] = []
  if (!d.name.trim()) out.push("Give it a name staff will recognise.")
  // An automatic offer or news sends with nobody checking it first: the message rules apply as for a send.
  out.push(...draftProblems({ ...d.message, endsAt: "" }, true).filter((p) => p !== "Choose who gets it." || !audienceOf(d)))
  if (!audienceOf(d)) out.push("Choose who gets it.")
  if (d.mode === "trigger") {
    const t = triggerOf(d.triggerKind)
    if (!Number.isInteger(d.triggerValue) || d.triggerValue < t.min || d.triggerValue > t.max)
      out.push(`${t.label}: ${t.min}–${t.max} ${t.unit}.`)
  } else {
    if (d.every === "week" && d.days.length === 0) out.push("Choose at least one day of the week.")
    if (!/^\d{2}:\d{2}$/.test(d.time)) out.push("Choose a time.")
    if (!d.startsOn) out.push("Choose a start date.")
    if (d.endsOn && d.endsOn < d.startsOn) out.push("The end date can't be before the start.")
  }
  return [...new Set(out)]
}

export { TRIGGERS }
