import { useEffect, type ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { meQuery } from "./queries";

/**
 * US2 — the record-backed identity read.
 *
 * Proves the whole vertical: client → store backend → identity/role enforcement → platform record
 * → back. Two states here are NOT failures and must not read like them:
 *   • role-less        — recorded, but granted nothing yet
 *   • no store assigned — expected, because the JIT upsert meets an operator before their store
 *                         is known; the operator assigns it out of band
 */
export function ProvingScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(meQuery);

  const unassigned = data ? data.store === null : false;
  useEffect(() => {
    if (unassigned) track({ name: "shop_store_assignment_missing" });
  }, [unassigned]);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Your store record</CardTitle>
        <CardDescription>
          The platform's own record of you — proves this console reaches the backend as you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              <Row label="Subject" value={<span className="font-mono">{data.subject}</span>} />
              <Row label="Email" value={data.email ?? "—"} />
              <Row label="Roles" value={data.roles.length > 0 ? data.roles.join(", ") : "—"} />
              <Row label="Status" value={data.status} />
              <Row
                label="Store"
                value={data.store ? `${data.store.name} (${data.store.code})` : "—"}
              />
            </dl>

            {data.roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You're recorded, but no store roles are assigned yet. Ask your manager to grant
                access.
              </p>
            ) : null}

            {data.store === null ? (
              <p className="text-sm text-muted-foreground">
                You're not assigned to a store yet, so nothing is available here. Ask your manager
                to assign you.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
