import {
  MESSAGE_LIMITS,
  MESSAGE_MUST_NAME_EFFY,
  audiencesFor,
  messageKind,
  messageNamesEffy,
  type AudienceFilter,
  type MessageDestination,
  type MessageDraftDTO,
  type MessageDTO,
  type MessageKind,
  type NotificationAudience,
} from "@effy/shared-types"

/** One audience in the composer: chosen or not, its filters, and where a tap leads. */
export interface AudienceDraft {
  on: boolean
  filter: AudienceFilter
  destination: MessageDestination
}

/** The composer's state (112). Times are `datetime-local` strings on Effy's clock, as the other editors keep them. */
export interface MessageDraft {
  kind: MessageKind
  title: string
  body: string
  pictureKey: string | null
  /** What the previews show: the stored picture, or a file just chosen. */
  pictureUrl: string | null
  push: boolean
  endsAt: string
  audiences: Record<NotificationAudience, AudienceDraft>
}

export const AUDIENCES: readonly NotificationAudience[] = ["customer", "driver", "shop"]

export const DEFAULT_DESTINATION: Record<NotificationAudience, MessageDestination> = {
  customer: { kind: "home" },
  driver: { kind: "today" },
  shop: { kind: "queue" },
}

export function emptyDraft(kind: MessageKind = "announcement"): MessageDraft {
  const allowed = audiencesFor(kind)
  const audiences = {} as Record<NotificationAudience, AudienceDraft>
  for (const a of AUDIENCES) audiences[a] = { on: allowed[0] === a, filter: {}, destination: DEFAULT_DESTINATION[a] }
  return { kind, title: "", body: "", pictureKey: null, pictureUrl: null, push: true, endsAt: "", audiences }
}

/** Changing the kind keeps the words and turns off audiences it doesn't allow. */
export function withKind(d: MessageDraft, kind: MessageKind): MessageDraft {
  const allowed = audiencesFor(kind)
  const audiences = { ...d.audiences }
  for (const a of AUDIENCES) {
    const on = allowed.includes(a) && d.audiences[a].on
    audiences[a] = { ...d.audiences[a], on }
  }
  if (!AUDIENCES.some((a) => audiences[a].on) && allowed[0])
    audiences[allowed[0]] = { ...audiences[allowed[0]], on: true }
  return { ...d, kind, push: kind === "direct" ? true : d.push, audiences }
}

const toLocal = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocal = (v: string): string | null => (v ? new Date(v).toISOString() : null)

/** A saved message back into the composer (edit), or a copy of it (duplicate: no end that has passed). */
export function draftOf(m: MessageDTO, copy = false): MessageDraft {
  const d = emptyDraft(m.kind)
  for (const a of AUDIENCES) d.audiences[a] = { ...d.audiences[a], on: false }
  for (const a of m.audiences) d.audiences[a.audience] = { on: true, filter: a.filter, destination: a.destination }
  const ends = m.endsAt && (!copy || new Date(m.endsAt).getTime() > Date.now()) ? toLocal(m.endsAt) : ""
  return {
    ...d,
    title: m.title,
    body: m.body,
    pictureKey: m.pictureKey,
    pictureUrl: m.pictureUrl,
    push: m.push,
    endsAt: ends,
  }
}

export function chosenAudiences(d: MessageDraft): NotificationAudience[] {
  const allowed = audiencesFor(d.kind)
  return AUDIENCES.filter((a) => d.audiences[a].on && allowed.includes(a))
}

export function bodyOf(d: MessageDraft): MessageDraftDTO {
  return {
    kind: d.kind,
    title: d.title.trim(),
    body: d.body.trim(),
    pictureKey: d.pictureKey,
    push: d.kind === "direct" ? true : d.push,
    endsAt: fromLocal(d.endsAt),
    audiences: chosenAudiences(d).map((a) => ({
      audience: a,
      filter: d.audiences[a].filter,
      destination: d.audiences[a].destination,
    })),
  }
}

/** What stops a save or a send, in words, before the server is asked (it checks all of it again). */
export function draftProblems(d: MessageDraft, forSend: boolean): string[] {
  const out: string[] = []
  if (!d.title.trim()) out.push("Add a title.")
  if (d.title.trim().length > MESSAGE_LIMITS.title)
    out.push(`The title is longer than ${MESSAGE_LIMITS.title} characters.`)
  if (!d.body.trim()) out.push("Add the text.")
  if (d.body.trim().length > MESSAGE_LIMITS.body) out.push(`The text is longer than ${MESSAGE_LIMITS.body} characters.`)
  if (chosenAudiences(d).length === 0) out.push("Choose who gets it.")
  if (d.endsAt && new Date(d.endsAt).getTime() <= Date.now()) out.push("The end has already passed.")
  if (forSend && messageKind(d.kind)?.marketing && !messageNamesEffy(d.title, d.body)) out.push(MESSAGE_MUST_NAME_EFFY)
  return out
}

/** Where the lock screen cuts a line off, with "…" (the composer's previews and counters). */
export function cut(text: string, max: number): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}
