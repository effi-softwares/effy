import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { DriverException, DriverExceptionKind } from "@effy/shared-types";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { track } from "@/lib/telemetry";

import { canManageDrivers } from "../access";
import { driverActionError } from "../errorText";
import {
  EXCEPTION_KIND_LABEL,
  exceptionReasonLabel,
  formatDateTime,
  type ExceptionListParams,
} from "../model";
import { exceptionsQuery, useResolveException } from "../queries";

const ALL = "all";

/**
 * The reports drivers file from the road (US3, FR-027…FR-033).
 *
 * ⚠ THE DRIVER APP HAS BEEN WRITING THESE SINCE 049 AND NOTHING HAS EVER READ THEM. Both source
 * tables carry a comment saying they are "recorded for back-office follow-up"; the only code that
 * touched either was the driver service, and only to INSERT. The consequence is the order-flow
 * register's top structural gap: a driver marks a drop undeliverable, the package stays `collected`,
 * no notification fires, no re-attempt is scheduled — and the shopper keeps seeing "on the way",
 * indefinitely, with nobody at Effy told.
 *
 * ⚠ A LIST, NOT CARDS, and the count lives in the heading rather than in a tile (Principle V).
 */
export function ExceptionsList({ driverId }: { driverId?: string } = {}) {
  const roles = useSessionRoles();
  const canManage = canManageDrivers(roles);

  const [kind, setKind] = useState<string>(ALL);
  const [resolved, setResolved] = useState<"false" | "true" | "all">("false");
  const [cursors, setCursors] = useState<string[]>([]);

  const params: ExceptionListParams = {
    kind: kind === ALL ? "" : (kind as DriverExceptionKind),
    resolved,
    driverId,
    cursor: cursors[cursors.length - 1],
  };
  const { data, error, isPending, isError, refetch } = useQuery(exceptionsQuery(params));

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      {!driverId ? (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              setCursors([]);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All reports</SelectItem>
              <SelectItem value="delivery_failure">Failed deliveries</SelectItem>
              <SelectItem value="collection_issue">Problems at shops</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={resolved}
            onValueChange={(v) => {
              setResolved(v as "false" | "true" | "all");
              setCursors([]);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">Outstanding</SelectItem>
              <SelectItem value="true">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading reports…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {resolved === "false"
            ? "Nothing outstanding. Every report from the road has been dealt with."
            : "No reports match this filter."}
        </p>
      ) : (
        <ul className="divide-y border-y">
          {data.items.map((e) => (
            <ExceptionRow key={`${e.kind}:${e.id}`} exception={e} canManage={canManage} />
          ))}
        </ul>
      )}

      {data && (cursors.length > 0 || data.nextCursor) ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            variant="outline"
            disabled={cursors.length === 0}
            onClick={() => setCursors((c) => c.slice(0, -1))}
          >
            Back
          </Button>
          <Button
            variant="outline"
            disabled={!data.nextCursor}
            onClick={() => setCursors((c) => (data.nextCursor ? [...c, data.nextCursor] : c))}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ExceptionRow({
  exception,
  canManage,
}: {
  exception: DriverException;
  canManage: boolean;
}) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolve = useResolveException();

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{EXCEPTION_KIND_LABEL[exception.kind]}</span>
        <span>{exceptionReasonLabel(exception.reason)}</span>
        {exception.orderId ? (
          // FR-030 — one step to the order, where the money and communication tools live.
          <Link
            to="/orders/$orderId"
            params={{ orderId: exception.orderId }}
            className="font-mono text-primary hover:underline"
          >
            {exception.orderReference}
          </Link>
        ) : null}
        {exception.location ? (
          <span className="text-muted-foreground">{exception.location}</span>
        ) : null}
        {exception.driverName ? (
          <span className="text-muted-foreground">{exception.driverName}</span>
        ) : null}
        <span className="tabular-nums text-muted-foreground">
          {formatDateTime(exception.occurredAt)}
        </span>
      </div>

      {exception.note ? (
        <p className="text-sm text-muted-foreground">“{exception.note}”</p>
      ) : null}

      {exception.resolvedAt ? (
        <p className="text-sm">
          <span className="font-medium">Resolved</span> {formatDateTime(exception.resolvedAt)} —{" "}
          {exception.resolutionNote}
        </p>
      ) : canManage ? (
        resolving ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was done about it?"
              className="max-w-md"
              aria-label="Resolution note"
            />
            <Button
              size="sm"
              disabled={note.trim() === "" || resolve.isPending}
              onClick={() => {
                setError(null);
                resolve.mutate(
                  { kind: exception.kind, id: exception.id, note },
                  {
                    onSuccess: () => {
                      track({ name: "driver_exception_resolved", kind: exception.kind });
                      setResolving(false);
                      setNote("");
                    },
                    onError: (e) => setError(driverActionError(e, "resolve")),
                  },
                );
              }}
            >
              Resolve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setResolving(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setResolving(true)}>
            Mark resolved
          </Button>
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
