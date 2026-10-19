import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@effy/web-kit/console";

import { DetailRows, Panel } from "@/components/patterns/Panel";

import { meQuery } from "./queries";

// US2 (graduated to US4): the record-backed identity read. Proves the full client → backend →
// identity/role enforcement → platform data → back loop. Role-less is a valid recorded state
// (roles: []), not a failure; unreachable/cold-start → degraded + retry (FR-008/009).
//
// Failure rendering comes from the SHARED ErrorState — the client error-handling contract has one
// implementation for every surface (Principle II), not one per console.
export function ProvingScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(meQuery);

  return (
    <Panel title="Your back-office record" description="The platform's own record of you — proves this console reaches the backend as you.">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : data.roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You're recorded, but no back-office roles are assigned yet. Ask an administrator to
            grant access.
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
  );
}
