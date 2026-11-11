import type { MessageDTO, MessagePushReportDTO, MessageReportDTO, NotificationAudience } from "@effy/shared-types"
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"

import { AUDIENCE_WORD } from "../words"

interface Line {
  id: string
  label: string
  /** Indented: a part of the line above. */
  part?: boolean
  value: (r: MessageReportDTO) => number
}

const push = (k: keyof MessagePushReportDTO) => (r: MessageReportDTO) => r.push[k]

/** The report's lines (112 FR-023, R15). Each group's parts add up to the line they sit under. */
export function reportLines(m: Pick<MessageDTO, "kind" | "push">): Line[] {
  const marketing = m.kind === "offer" || m.kind === "news"
  return [
    { id: "matched", label: "People it was for", value: (r) => r.matched },
    { id: "reached", label: "Reached their inbox", part: true, value: (r) => r.reached },
    ...(marketing
      ? [
          {
            id: "noConsent",
            label: "Not reached: hadn't said yes",
            part: true,
            value: (r: MessageReportDTO) => r.noConsent,
          },
        ]
      : []),
    ...(m.push
      ? [
          { id: "push", label: "Phone notifications (of those reached)", value: (r: MessageReportDTO) => r.reached },
          { id: "sent", label: "Sent", part: true, value: push("sent") },
          { id: "noDevice", label: "No phone signed in", part: true, value: push("noDevice") },
          { id: "turnedOff", label: "Turned off by the person", part: true, value: push("turnedOff") },
          { id: "overLimit", label: "Over the promotion limit", part: true, value: push("overLimit") },
          { id: "heldForNight", label: "Held for the night", part: true, value: push("heldForNight") },
          { id: "waiting", label: "Waiting to go", part: true, value: push("waiting") },
          { id: "muted", label: "Muted on that device", part: true, value: push("muted") },
          { id: "failed", label: "Failed", part: true, value: push("failed") },
          { id: "notSentEnded", label: "Not sent: withdrawn or ended", part: true, value: push("notSentEnded") },
        ]
      : []),
    { id: "seen", label: "Seen in their inbox", value: (r) => r.seen },
    { id: "opened", label: "Opened", value: (r) => r.opened },
    { id: "archived", label: "Archived", value: (r) => r.archived },
  ]
}

/** One column per audience and a total (112 R15): a bounded table, so a StaticTable. */
export function ReportTable({ message }: { message: MessageDTO }) {
  const total = message.total
  if (!total) return <p className="text-sm text-muted-foreground">The report starts when the message is sent.</p>
  const audiences = message.audiences.filter((a) => a.report) as {
    audience: NotificationAudience
    report: MessageReportDTO
  }[]
  const columns: EffyColumnDef<Line>[] = [
    {
      id: "line",
      header: "",
      cell: ({ row }) => (
        <span className={row.original.part ? "pl-5 text-muted-foreground" : "font-medium"}>{row.original.label}</span>
      ),
      meta: { label: "What", identifying: true, phone: "primary" },
    },
    ...(audiences.length > 1
      ? audiences.map(
          (a): EffyColumnDef<Line> => ({
            id: a.audience,
            header: AUDIENCE_WORD[a.audience],
            cell: ({ row }) => row.original.value(a.report).toLocaleString("en-AU"),
            meta: { label: AUDIENCE_WORD[a.audience], align: "numeric" },
          }),
        )
      : []),
    {
      id: "total",
      header: "Total",
      cell: ({ row }) => <span className="font-medium">{row.original.value(total).toLocaleString("en-AU")}</span>,
      meta: { label: "Total", align: "numeric", phone: "trail" },
    },
  ]
  return (
    <StaticTable
      label="What happened"
      columns={columns}
      rows={reportLines(message)}
      getRowId={(l) => l.id}
      framed={false}
    />
  )
}
