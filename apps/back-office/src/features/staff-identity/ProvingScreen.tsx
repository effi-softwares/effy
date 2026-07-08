import type { ReactNode } from "react";

import { isDomainError } from "@effy/api-client";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { meQuery } from "./queries";

// US2 (graduated to US4): the record-backed identity read. Proves the full client → backend →
// identity/role enforcement → platform data → back loop. Role-less is a valid recorded state
// (roles: []), not a failure; unreachable/cold-start → degraded + retry (FR-008/009).
export function ProvingScreen() {
  const { data, error, isPending, isError, refetch, isFetching } = useQuery(meQuery);

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
          <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
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

function ErrorState({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  const kind = isDomainError(error) ? error.kind : "unknown";

  if (kind === "unauthenticated") {
    return <p className="text-sm text-muted-foreground">Your session expired. Please sign in again.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The back-office service is unreachable right now. This can happen on first wake.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
