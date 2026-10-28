import { useQuery } from "@tanstack/react-query"

import { Skeleton } from "@effy/design-system/ui"
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, Panel } from "@effy/web-kit/patterns"
import { moment } from "@/lib/format"

import { sessionQuery } from "@/features/auth/queries"

import { canRepairDelivery } from "./access"
import { RepairDialog } from "./components/RepairDialog"
import { StateLabel } from "./DeliverabilityListScreen"
import { STATE_MEANING, type DeliveryEvent } from "./model"
import { deliverabilityDetailQuery } from "./queries"

/** The service answers this address's newest events, up to this many (`listEvents`). */
const EVENTS_SHOWN = 50

const EVENT_COLUMNS: EffyColumnDef<DeliveryEvent>[] = [
  { id: "when", header: "When", cell: ({ row }) => moment(row.original.occurredAt), meta: { label: "When", phone: "primary" } },
  { id: "outcome", header: "Outcome", cell: ({ row }) => row.original.eventType.replace("_", " "), meta: { label: "Outcome", phone: "badge" } },
  { id: "detail", header: "Detail", cell: ({ row }) => <span className="text-xs">{row.original.subType ?? "—"}</span>, meta: { label: "Detail", align: "mono" } },
  {
    id: "template",
    header: "Template",
    cell: ({ row }) => <span className="text-xs">{row.original.templateId ?? <span className="text-muted-foreground">Cognito / pre-038</span>}</span>,
    meta: { label: "Template", align: "mono", priority: 2 },
  },
  {
    id: "message",
    header: "Message",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.messageId}</span>,
    meta: { label: "Message", align: "mono", priority: 3, phone: "hide" },
  },
]

export function DeliverabilityDetailScreen({ address }: { address: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(deliverabilityDetailQuery(address))
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const mayRepair = canRepairDelivery(roles)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) return <Skeleton className="h-60" aria-busy="true" />

  return (
    <>
      <PageHeader
        back={{ label: "All delivery problems", link: { to: "/deliverability" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="break-all">{data.address}</span>
            <StateLabel state={data.state} />
          </span>
        }
        description={STATE_MEANING[data.state]}
        actions={
          mayRepair && data.state !== "reachable" ? (
            <RepairDialog address={data.address} state={data.state} />
          ) : undefined
        }
      />

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Panel
            title="History"
            description="Every send to this address the platform heard back about, newest first."
            flush
          >
            <StaticTable
              label="History"
              columns={EVENT_COLUMNS}
              rows={data.events}
              getRowId={(e) => `${e.messageId}-${e.eventType}`}
              empty="No events recorded."
              framed={false}
            />
            {data.events.length >= EVENTS_SHOWN ? (
              <p className="px-5 py-3 text-sm text-muted-foreground">The latest {EVENTS_SHOWN} events.</p>
            ) : null}
          </Panel>
        </div>
        <aside className="ef-detail__aside is-first">
          <Panel title="Address">
            <dl className="ef-dl ef-dl--tight">
              <Row label="State">
                <StateLabel state={data.state} />
              </Row>
              <Row label="Account">
                {data.subject ? (
                  <>
                    {data.subject.name ?? "unnamed"}{" "}
                    <span className="text-muted-foreground">({data.subject.kind.replace("_", " ")})</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No platform record owns this address</span>
                )}
              </Row>
              <Row label="Reason">
                <span className="font-mono text-xs">{data.reason ?? "—"}</span>
              </Row>
              <Row label="Server said">
                <span className="font-mono text-xs text-muted-foreground">{data.diagnostic ?? "—"}</span>
              </Row>
              <Row label="Blocked by the mail service">
                {data.suppressedInSes === null ? (
                  <span className="text-muted-foreground">Couldn&apos;t check just now</span>
                ) : data.suppressedInSes ? (
                  <span className="font-medium">Yes — sends to this address are accepted and silently dropped</span>
                ) : (
                  <span>No</span>
                )}
              </Row>
              <Row label="Failures">
                {data.bounceCount} bounced · {data.complaintCount} reported as spam
              </Row>
              <Row label="Last event">
                {moment(data.lastEventAt)}
                {data.lastMessageId && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{data.lastMessageId}</span>
                )}
              </Row>
              {data.repairedAt && (
                <Row label="Last repaired">
                  {moment(data.repairedAt)}{" "}
                  <span className="font-mono text-xs text-muted-foreground">{data.repairedBy}</span>
                </Row>
              )}
            </dl>
          </Panel>
        </aside>
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ef-dl__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
