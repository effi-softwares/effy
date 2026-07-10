import type { ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

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
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Your back-office record</CardTitle>
        <CardDescription>
          The platform's own record of you — proves this console reaches the backend as you.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
          <dl className="space-y-2 text-sm">
            <Row label="Subject" value={<span className="font-mono">{data.subject}</span>} />
            <Row label="Email" value={data.email} />
            <Row label="Roles" value={data.roles.join(", ")} />
            <Row label="Status" value={data.status} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
