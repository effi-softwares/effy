import { useState } from "react"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Check, Circle } from "lucide-react"

import { isDomainError } from "@effy/api-client"
import { GST_STATUS_WORDS, type GstStatus, type TaxSettingsDTO } from "@effy/shared-types"
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import {
  Bone,
  Loading,
  PageHeader,
  SettingsList,
  SettingsListHeading,
  SettingsPage,
  SettingsRow,
  SettingsSaveBar,
  SettingsSection,
  useSettingsDraft,
} from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { getTaxSettings, putTaxSettings } from "./repo"

const KEY = ["settings", "tax"] as const

const SECTION = {
  details: {
    title: "Effy's tax details",
    description: "Printed on every tax invoice and adjustment note. Enter them exactly as registered with the ABR.",
  },
  fees: {
    title: "How fees are taxed",
    description: "Delivery and small-order fees appear on every invoice as their own lines.",
  },
  invoices: {
    title: "Tax invoices",
    description: "Customers can view and download a tax invoice for any paid order once this is on.",
  },
} as const

const HEAD = (
  <PageHeader
    title="Tax and invoices"
    description="The business details printed on customer tax invoices, and whether invoices are issued."
  />
)

/** Settings › Tax and invoices (admin). */
export function TaxSettingsScreen() {
  const settings = useQuery({ queryKey: KEY, queryFn: getTaxSettings })
  useTourPage("tax", { status: tourStatus(settings) })

  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
  return (
    <>
      {HEAD}
      {settings.isPending ? <TaxSkeleton /> : <TaxForm value={settings.data} />}
    </>
  )
}

type Draft = { legalName: string; abn: string; fee: "" | GstStatus; enabled: boolean }

function TaxForm({ value }: { value: TaxSettingsDTO }) {
  const queryClient = useQueryClient()
  const form = useSettingsDraft<Draft>({
    legalName: value.legalName ?? "",
    abn: value.abn ?? "",
    fee: value.feeTreatment ?? "",
    enabled: value.invoicesEnabled,
  })
  const d = form.value!
  const [abnError, setAbnError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: putTaxSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data)
      form.discard()
      setRefusal(null)
      setAbnError(null)
      toast.success(data.invoicesEnabled ? "Saved - tax invoices are on" : "Saved")
    },
    onError: (err) => {
      if (isDomainError(err) && err.status === 422) return setAbnError("That ABN isn't valid. Check the 11 digits.")
      if (isDomainError(err) && err.status === 409) {
        const missing = (err.fields ?? []).map((f) => f.message)
        return setRefusal(
          `Tax invoices can't be turned on yet${missing.length ? `. Still needed: ${missing.join(", ")}.` : "."}`,
        )
      }
      setRefusal("That didn't save. Try again.")
    },
  })

  const abn = d.abn.replace(/\s+/g, "")
  const unclassified = value.unclassifiedProducts
  const needs: { done: boolean; label: React.ReactNode }[] = [
    { done: d.legalName.trim().length >= 2, label: "Legal name" },
    { done: /^\d{11}$/.test(abn), label: "ABN" },
    { done: d.fee !== "", label: "How fees are taxed" },
    {
      done: unclassified === 0,
      label:
        unclassified === 0 ? (
          "Every live product has a GST status"
        ) : (
          <>
            {unclassified} live product{unclassified === 1 ? " has" : "s have"} no GST status -{" "}
            <Link to="/product-review" className="text-primary underline underline-offset-4">
              set them in Product review
            </Link>
          </>
        ),
    },
  ]

  return (
    <SettingsPage>
      <SettingsSection tour="tax.details" {...SECTION.details}>
        <SettingsList>
          <SettingsRow htmlFor="tax-name" label="Legal name">
            <Input
              id="tax-name"
              className="w-72 max-sm:w-full"
              value={d.legalName}
              onChange={(e) => form.set("legalName", e.target.value)}
              placeholder="As registered"
            />
          </SettingsRow>
          <SettingsRow htmlFor="tax-abn" label="ABN" hint="11 digits; spaces are ignored." error={abnError}>
            <Input
              id="tax-abn"
              className="w-48 tabular-nums"
              value={d.abn}
              onChange={(e) => {
                setAbnError(null)
                form.set("abn", e.target.value)
              }}
              inputMode="numeric"
              placeholder="11 digits"
              aria-invalid={abnError ? true : undefined}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection {...SECTION.fees}>
        <SettingsList>
          <SettingsRow label="Delivery and order fees" hint="Confirm this with Effy's accountant.">
            <Select value={d.fee} onValueChange={(v) => form.set("fee", v as GstStatus)}>
              <SelectTrigger data-tour="tax.fees" aria-label="Delivery and order fees" className="w-56">
                <SelectValue placeholder="Choose how fees are taxed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="taxable">{GST_STATUS_WORDS.taxable}</SelectItem>
                <SelectItem value="gst_free">{GST_STATUS_WORDS.gst_free}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection tour="tax.invoices" {...SECTION.invoices}>
        <SettingsList>
          <SettingsRow
            htmlFor="tax-on"
            label="Tax invoices on"
            hint="Needs everything below. Turning them off stops new invoices; ones already issued stay."
          >
            <Switch
              id="tax-on"
              aria-label="Tax invoices on"
              checked={d.enabled}
              onCheckedChange={(v) => form.set("enabled", v)}
            />
          </SettingsRow>
          <SettingsListHeading>Needed first</SettingsListHeading>
          {needs.map((n, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {n.done ? (
                <Check aria-label="Done" className="size-4 shrink-0 text-success" />
              ) : (
                <Circle aria-label="Still needed" className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={n.done ? undefined : "text-muted-foreground"}>{n.label}</span>
            </div>
          ))}
        </SettingsList>
        {refusal ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {refusal}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSaveBar
        dirty={form.dirty}
        saving={save.isPending}
        onSave={() =>
          save.mutate({
            legalName: d.legalName.trim() || null,
            abn: abn || null,
            feeTreatment: d.fee || null,
            invoicesEnabled: d.enabled,
          })
        }
        onDiscard={() => {
          form.discard()
          setRefusal(null)
          setAbnError(null)
        }}
      />
    </SettingsPage>
  )
}

function TaxSkeleton() {
  return (
    <Loading>
      <SettingsPage>
        <SettingsSection {...SECTION.details}>
          <SettingsList>
            <SettingsRow label="Legal name">
              <Bone kind="control" className="w-72" />
            </SettingsRow>
            <SettingsRow label="ABN">
              <Bone kind="control" className="w-48" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.fees}>
          <SettingsList>
            <SettingsRow label="Delivery and order fees">
              <Bone kind="control" className="w-56" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.invoices}>
          <SettingsList>
            <SettingsRow label="Tax invoices on">
              <Bone className="h-5 w-9 rounded-full" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>
      </SettingsPage>
    </Loading>
  )
}
