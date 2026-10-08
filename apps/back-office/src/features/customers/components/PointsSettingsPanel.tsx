import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { PointsSettingsDTO } from "@effy/shared-types";
import { Button, Input, Label, toast } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canEditPointsSettings } from "../access";
import { pointsActionError } from "../errorText";
import { pointsSettingsQuery, useUpdatePointsSettings } from "../queries";

type Field = "centsPerPoint" | "expiryMonths" | "csaCreditLimitPoints" | "warningDays" | "holdMinutes";

const FIELDS: { key: Field; label: string; help: string }[] = [
  { key: "centsPerPoint", label: "Value of a point (cents)", help: "Applies to new orders. Orders already paid keep the value they were paid at." },
  { key: "expiryMonths", label: "Points last (months)", help: "Applies to points credited from now on." },
  { key: "csaCreditLimitPoints", label: "Customer-service credit limit", help: "The most a customer-service agent can credit at once." },
  { key: "warningDays", label: "Expiry warning (days before)", help: "Customers are emailed once, this many days before points expire." },
  { key: "holdMinutes", label: "Checkout hold (minutes)", help: "How long points chosen at checkout are set aside while the customer pays." },
];

const when = (iso: string) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/**
 * The points rules (074 US6). Everyone can read them; only an admin can change them, and every change
 * is listed below with who made it (FR-025).
 */
export function PointsSettingsPanel() {
  const { data: session } = useQuery(sessionQuery);
  const editable = canEditPointsSettings(session?.status === "signed-in" ? session.identity.roles : []);
  const settings = useQuery(pointsSettingsQuery);
  const save = useUpdatePointsSettings();
  const [draft, setDraft] = useState<Record<Field, string> | null>(null);

  useEffect(() => {
    if (settings.data && draft === null) {
      setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(settings.data[f.key])])) as Record<Field, string>);
    }
  }, [settings.data, draft]);

  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  if (settings.isPending || draft === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const s: PointsSettingsDTO = settings.data;
  const patch: Partial<PointsSettingsDTO> = {};
  let valid = true;
  for (const f of FIELDS) {
    const n = Number(draft[f.key]);
    if (!Number.isInteger(n)) valid = false;
    else if (n !== s[f.key]) patch[f.key] = n;
  }
  const dirty = Object.keys(patch).length > 0;

  return (
    <div className="max-w-xl space-y-6">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(patch, {
            onSuccess: (next) => {
              toast("Points settings saved.");
              setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(next[f.key])])) as Record<Field, string>);
            },
            onError: (err) => toast(pointsActionError(err)),
          });
        }}
      >
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`ps-${f.key}`}>{f.label}</Label>
            <Input
              id={`ps-${f.key}`}
              inputMode="numeric"
              className="w-40"
              value={draft[f.key]}
              disabled={!editable}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">{f.help}</p>
          </div>
        ))}
        {editable ? (
          <Button type="submit" disabled={!dirty || !valid || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Only an administrator can change these.</p>
        )}
      </form>

      <section className="space-y-2">
        <h2 className="border-b pb-2 text-sm font-semibold">Changes</h2>
        {(s.history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(s.history ?? []).map((h, i) => (
              <li key={i} className="flex justify-between gap-4 py-2">
                <span>
                  {FIELDS.find((f) => f.key === h.field)?.label ?? h.field}: {h.oldValue} → {h.newValue}
                </span>
                <span className="text-muted-foreground tabular-nums">{when(h.changedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
