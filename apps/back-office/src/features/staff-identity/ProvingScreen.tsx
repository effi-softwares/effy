import { useQuery } from "@tanstack/react-query"

import { ErrorState } from "@effy/web-kit/console"

import { DetailRows, Panel } from "@effy/web-kit/patterns"

import { meQuery } from "./queries"

export function ProvingScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(meQuery)

  return (
    <Panel
      title="Your back-office record"
      description="The platform's own record of you — proves this console reaches the backend as you."
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You're recorded, but no back-office roles are assigned yet. Ask an administrator to grant access.
        </p>
      ) : (
        <DetailRows
          tight
          rows={[
            { label: "Subject", value: <span className="font-mono text-xs">{data.subject}</span> },
            { label: "Email", value: data.email },
            { label: "Roles", value: data.roles.join(", ") },
            { label: "Status", value: data.status },
          ]}
        />
      )}
    </Panel>
  )
}
