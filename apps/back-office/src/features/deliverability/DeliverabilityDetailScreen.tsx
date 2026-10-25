import { useQuery } from "@tanstack/react-query"

import { Skeleton } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, Panel } from "@effy/web-kit/patterns"
import { moment } from "@/lib/format"

import { sessionQuery } from "@/features/auth/queries"

import { canRepairDelivery } from "./access"
import { RepairDialog } from "./components/RepairDialog"
import { StateLabel } from "./DeliverabilityListScreen"
import { STATE_MEANING } from "./model"
import { deliverabilityDetailQuery } from "./queries"

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

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Panel
            title="History"
            description="Every send to this address the platform heard back about, newest first."
            flush
          >
            <div className="bo-table-scroll">
              <table className="bo-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Outcome</th>
                    <th>Detail</th>
                    <th>Template</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-muted-foreground">
                        No events recorded.
                      </td>
                    </tr>
                  )}
                  {data.events.map((e) => (
                    <tr key={`${e.messageId}-${e.eventType}`}>
                      <td className="whitespace-nowrap">{moment(e.occurredAt)}</td>
                      <td>{e.eventType.replace("_", " ")}</td>
                      <td className="font-mono text-xs">{e.subType ?? "—"}</td>
                      <td className="font-mono text-xs">
                        {e.templateId ?? <span className="text-muted-foreground">Cognito / pre-038</span>}
                      </td>
                      <td className="font-mono text-xs text-muted-foreground">{e.messageId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
        <aside className="bo-detail__aside is-first">
          <Panel title="Address">
            <dl className="bo-dl bo-dl--tight">
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
    <div className="bo-dl__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
