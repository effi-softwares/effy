import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { isDomainError } from "@effy/api-client";
import { GST_STATUS_WORDS, type GstStatus } from "@effy/shared-types";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Switch, toast } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@effy/web-kit/patterns";
import { Panel } from "@effy/web-kit/patterns";

import { getTaxSettings, putTaxSettings } from "./repo";

const KEY = ["settings", "tax"] as const;

/**
 * Settings → Tax: Effy's legal name and ABN as printed on every tax invoice, how delivery fees
 * are taxed, and the switch that turns tax invoices on.
 *
 * Real-world identifiers are typed here by the operator — nothing is pre-filled or guessed. Invoices
 * turn on only when all of it is set and every live product has a GST status; until then customers are
 * told invoices are not available yet. The fee treatment is to be confirmed by Effy's accountant.
 */
export function TaxSettingsScreen() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: KEY, queryFn: getTaxSettings });
  const [legalName, setLegalName] = useState("");
  const [abn, setAbn] = useState("");
  const [fee, setFee] = useState<"" | GstStatus>("");
  const [enabled, setEnabled] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setLegalName(settings.data.legalName ?? "");
    setAbn(settings.data.abn ?? "");
    setFee(settings.data.feeTreatment ?? "");
    setEnabled(settings.data.invoicesEnabled);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: putTaxSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      setRefusal(null);
      toast.success(data.invoicesEnabled ? "Saved — tax invoices are on" : "Saved");
    },
    onError: (err) => {
      if (isDomainError(err) && err.status === 422) return setRefusal("That ABN isn't valid. Check the 11 digits.");
      if (isDomainError(err) && err.status === 409) {
        const missing = (err.fields ?? []).map((f) => f.message);
        return setRefusal(`Tax invoices can't be turned on yet${missing.length ? `. Still needed: ${missing.join(", ")}.` : "."}`);
      }
      setRefusal("That didn't save. Try again.");
    },
  });

  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  if (settings.isPending) return <Skeleton className="h-64" />;
  const unclassified = settings.data.unclassifiedProducts;

  return (
    <>
      <PageHeader title="Tax" description="The business details printed on customer tax invoices, and whether invoices are issued." />
      <div className="space-y-6">
        <Panel title="Effy's tax details" description="Printed on every tax invoice and adjustment note. Enter them exactly as registered with the ABR.">
          <div className="grid max-w-xl gap-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Legal name</span>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="As registered" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">ABN</span>
              <Input value={abn} onChange={(e) => setAbn(e.target.value)} inputMode="numeric" placeholder="11 digits" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Delivery and order fees</span>
              <Select value={fee} onValueChange={(v) => setFee(v as GstStatus)}>
                <SelectTrigger aria-label="Delivery and order fees">
                  <SelectValue placeholder="Choose how fees are taxed" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="taxable">{GST_STATUS_WORDS.taxable}</SelectItem>
                  <SelectItem value="gst_free">{GST_STATUS_WORDS.gst_free}</SelectItem>
                </SelectContent>
              </Select>
              <span className="bo-sub block">Confirm this with Effy's accountant.</span>
            </label>
          </div>
        </Panel>

        <Panel title="Tax invoices" description="Customers can view and download a tax invoice for any paid order once this is on.">
          <div className="space-y-3">
            <label className="flex items-start justify-between gap-4">
              <span className="space-y-1">
                <span className="block text-sm font-medium">Tax invoices on</span>
                <span className="bo-sub block">
                  Needs the legal name, ABN and fee treatment above, and a GST status on every live product.
                </span>
              </span>
              <Switch aria-label="Tax invoices on" checked={enabled} onCheckedChange={setEnabled} />
            </label>
            <p className="text-sm">
              {unclassified === 0 ? (
                "Every live product has a GST status."
              ) : (
                <>
                  {unclassified} live product{unclassified === 1 ? " has" : "s have"} no GST status —{" "}
                  <Link to="/product-review" className="text-primary underline underline-offset-4">
                    set them in Product review
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        </Panel>

        {refusal ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {refusal}
          </p>
        ) : null}
        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate({ legalName: legalName.trim() || null, abn: abn.replace(/\s+/g, "") || null, feeTreatment: fee || null, invoicesEnabled: enabled })
          }
        >
          Save
        </Button>
      </div>
    </>
  );
}
