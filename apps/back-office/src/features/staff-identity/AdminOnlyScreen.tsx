import { useEffect } from "react"

import { isDomainError } from "@effy/api-client"
import { useQuery } from "@tanstack/react-query"

import { ErrorState } from "@effy/web-kit/console"

import { Panel } from "@effy/web-kit/patterns"

import { track } from "@/lib/telemetry"

import { adminPingQuery } from "./queries"

export function AdminOnlyScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(adminPingQuery)
  const denied = isError && isDomainError(error) && error.kind === "forbidden"

  useEffect(() => {
    if (denied) track({ name: "admin_area_access_denied" })
  }, [denied])

  return (
    <Panel title="Administrator area" description="Access is decided by the backend, not the interface.">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : isError ? (
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          forbiddenMessage="You don't have administrator access. The backend refused this request."
        />
      ) : (
        <p className="text-sm">
          Administrator access confirmed for <span className="font-mono">{data.subject}</span>.
        </p>
      )}
    </Panel>
  )
}
