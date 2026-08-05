import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { STATE_LABEL, type DeliveryListItem, type EmailDeliveryState } from "./model";
import { deliverabilityListQuery } from "./queries";

/**
 * Addresses the platform cannot reach (037 FR-033).
 *
 * ⚠ WHY THIS SCREEN EXISTS. A send to a blocked address returns SUCCESS and delivers nothing. Before
 * it, a customer whose address hard-bounced was permanently locked out of an account that — for
 * driver, shop and back-office — has no other credential, and nobody at Effy could find out.
 *
 * ⚠ NO CARDS, NO METRIC TILES (Principle V). A table and detail rows. A "3 undeliverable" tile at the
 * top would answer a question nobody asks; the list of WHO is the whole product.
 */
const PAGE_SIZE = 25;
const PROBLEMS = "problems";

const columns: ColumnDef<DeliveryListItem>[] = [
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => (
      <Link
        to="/deliverability/$address"
        params={{ address: row.original.address }}
        className="font-mono text-sm text-primary hover:underline"
      >
        {row.original.address}
      </Link>
    ),
  },
  {
    accessorKey: "state",
    header: "State",
    // ⚠ A TEXT LABEL, never colour alone (Principle V). Colour carries no meaning to a screen reader
    // and no meaning to about 1 in 12 men.
    cell: ({ row }) => <StateLabel state={row.original.state} />,
  },
  {
    id: "subject",
    header: "Account",
    cell: ({ row }) => {
      const s = row.original.subject;
      // ⚠ "—" IS THE HONEST ANSWER, not a defect. An address can fail before its account exists,
      // after it is deleted, or for the DRIVER audience, which has a Cognito pool and still has no
      // platform table at all. Inventing an owner would be worse than showing none.
      if (!s) return <span className="text-muted-foreground">—</span>;
      return (
        <span>
          {s.name ?? <span className="text-muted-foreground">unnamed</span>}{" "}
          <span className="text-xs text-muted-foreground">({s.kind.replace("_", " ")})</span>
        </span>
      );
    },
  },
  {
    accessorKey: "reason",
    header: "Reason",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.reason ?? "—"}</span>
    ),
  },
  {
    accessorKey: "lastEventAt",
    header: "Last event",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {new Date(row.original.lastEventAt).toLocaleString()}
      </span>
    ),
  },
];

export function DeliverabilityListScreen() {
  const [state, setState] = useState<string>(PROBLEMS);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const params = useMemo(
    () => ({
      state: state === PROBLEMS ? undefined : (state as EmailDeliveryState | "all"),
      q: q.trim() || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [state, q, page],
  );

  const { data, isPending, isError, error, refetch } = useQuery(deliverabilityListQuery(params));

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email deliverability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Addresses the platform cannot reach. Someone listed as undeliverable receives no sign-in
          codes — and for driver, shop and back-office staff an emailed code is the only credential.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search address…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <Select
          value={state}
          onValueChange={(v) => {
            setState(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* ⚠ Defaults to problems only. A list of every address ever delivered to answers no
                question anyone has, and would bury the handful that matter. */}
            <SelectItem value={PROBLEMS}>Needs attention</SelectItem>
            <SelectItem value="undeliverable">{STATE_LABEL.undeliverable}</SelectItem>
            <SelectItem value="soft_failing">{STATE_LABEL.soft_failing}</SelectItem>
            <SelectItem value="complained">{STATE_LABEL.complained}</SelectItem>
            <SelectItem value="all">All addresses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data.items}
            emptyMessage="No delivery problems. Every address the platform has emailed is reachable."
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{data.total} total</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function StateLabel({ state }: { state: EmailDeliveryState }) {
  return (
    <span
      className={
        state === "undeliverable"
          ? "font-medium text-destructive"
          : state === "reachable"
            ? "text-muted-foreground"
            : "font-medium"
      }
    >
      {STATE_LABEL[state]}
    </span>
  );
}
