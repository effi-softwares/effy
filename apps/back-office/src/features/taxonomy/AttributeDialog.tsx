import { useState } from "react"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@effy/design-system/ui"
import {
  ATTRIBUTE_NAME_MAX,
  CHOICE_INPUT_TYPES,
  FILTERABLE_INPUT_TYPES,
  INPUT_TYPE_WORDS,
  INPUT_TYPES,
  UNIT_FAMILIES,
  VALUE_LABEL_MAX,
  isStockDateName,
  type AttributeDTO,
  type AttributeInput,
  type InputType,
  type TaxonomyStatus,
  type UnitFamily,
} from "@effy/shared-types"

import { track } from "@/lib/telemetry"

import { taxonomyErrorText, taxonomyFieldErrors } from "./errorText"
import { useCreateAttribute, useUpdateAttribute } from "./queries"

interface ValueRow {
  id?: string
  label: string
  status: TaxonomyStatus
  usage: number
}

const NONE = "none"

/**
 * Define or change a library attribute. The fields follow the input type: units for a number, an ordered
 * list of values for a choice, a length limit for text. A used attribute keeps its input type and unit family.
 */
export function AttributeDialog({ attribute, onClose }: { attribute?: AttributeDTO; onClose: () => void }) {
  const used = (attribute?.usage.products ?? 0) > 0
  const create = useCreateAttribute()
  const update = useUpdateAttribute()
  const [name, setName] = useState(attribute?.name ?? "")
  const [helpText, setHelpText] = useState(attribute?.helpText ?? "")
  const [inputType, setInputType] = useState<InputType>(attribute?.inputType ?? "short_text")
  const [unitFamily, setUnitFamily] = useState<UnitFamily | null>(attribute?.unitFamily ?? null)
  const [units, setUnits] = useState<string[]>(attribute?.units ?? [])
  const [min, setMin] = useState(attribute?.min ?? "")
  const [max, setMax] = useState(attribute?.max ?? "")
  const [decimals, setDecimals] = useState(attribute?.decimals == null ? "" : String(attribute.decimals))
  const [maxLength, setMaxLength] = useState(attribute?.maxLength == null ? "" : String(attribute.maxLength))
  const [filterable, setFilterable] = useState(attribute?.filterable ?? false)
  const [customerVisible, setCustomerVisible] = useState(attribute?.customerVisible ?? true)
  const [variesByVariant, setVariesByVariant] = useState(attribute?.variesByVariant ?? false)
  const [variantOption, setVariantOption] = useState(attribute?.variantOption ?? false)
  const [values, setValues] = useState<ValueRow[]>(
    attribute?.values.map((v) => ({ id: v.id, label: v.label, status: v.status, usage: v.usage ?? 0 })) ?? [],
  )
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  const isNumber = inputType === "number"
  const isText = inputType === "short_text" || inputType === "long_text"
  const isChoice = CHOICE_INPUT_TYPES.includes(inputType)
  const canFilter = FILTERABLE_INPUT_TYPES.includes(inputType)
  const canBeOption = inputType === "single_select"
  const stockDate = isStockDateName(name)

  function changeType(t: InputType) {
    setInputType(t)
    if (t !== "number") {
      setUnitFamily(null)
      setUnits([])
    }
    if (!FILTERABLE_INPUT_TYPES.includes(t)) setFilterable(false)
    if (t !== "single_select") setVariantOption(false)
  }

  function changeFamily(f: string) {
    const family = f === NONE ? null : (f as UnitFamily)
    setUnitFamily(family)
    setUnits(family ? [Object.keys(UNIT_FAMILIES[family].units)[0]!] : [])
  }

  const moveValue = (i: number, by: number) =>
    setValues((prev) => {
      const next = [...prev]
      const [v] = next.splice(i, 1)
      next.splice(i + by, 0, v!)
      return next
    })

  async function submit() {
    setError(null)
    setFields({})
    const body: AttributeInput = {
      name: name.trim(),
      helpText: helpText.trim() || null,
      inputType,
      unitFamily: isNumber ? unitFamily : null,
      units: isNumber && unitFamily ? units : null,
      min: isNumber && min.trim() ? min.trim() : null,
      max: isNumber && max.trim() ? max.trim() : null,
      decimals: isNumber && decimals.trim() ? Number(decimals) : null,
      maxLength: isText && maxLength.trim() ? Number(maxLength) : null,
      filterable: canFilter && filterable,
      customerVisible,
      variesByVariant: variesByVariant || (canBeOption && variantOption),
      variantOption: canBeOption && variantOption,
      values: isChoice
        ? values
            .filter((v) => v.id || v.label.trim())
            .map((v) => ({ id: v.id, label: v.label.trim(), status: v.status }))
        : [],
    }
    try {
      if (attribute) await update.mutateAsync({ id: attribute.id, body })
      else {
        const created = await create.mutateAsync(body)
        track({ name: "taxonomy_attribute_created", attributeId: created.id })
      }
      onClose()
    } catch (err) {
      setError(taxonomyErrorText(err))
      setFields(taxonomyFieldErrors(err))
    }
  }

  const fieldError = (key: string) =>
    fields[key] ? (
      <p className="text-xs text-destructive" id={`attr-${key}-error`}>
        {fields[key]}
      </p>
    ) : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{attribute ? `Edit ${attribute.name}` : "New attribute"}</DialogTitle>
          <DialogDescription>
            {attribute
              ? `Used by ${attribute.usage.categories} categories and ${attribute.usage.products} products.`
              : "Defined once, attached to any category. Stock dates (expiry, packed, batch) are recorded with stock, not here."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="max-h-[70vh] space-y-5 overflow-y-auto pr-1"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="attr-name">Name</Label>
            <Input
              id="attr-name"
              maxLength={ATTRIBUTE_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(fields.name) || stockDate}
            />
            {stockDate ? (
              <p className="text-xs text-destructive">
                Expiry, packed and batch dates are recorded with stock, not as product details.
              </p>
            ) : (
              fieldError("name")
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="attr-help">Help text for shops</Label>
            <Textarea
              id="attr-help"
              maxLength={200}
              rows={2}
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="attr-type">Input</Label>
              <Select value={inputType} onValueChange={(v) => changeType(v as InputType)} disabled={used}>
                <SelectTrigger id="attr-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INPUT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {INPUT_TYPE_WORDS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {used ? (
                <p className="text-xs text-muted-foreground">Fixed: products use this attribute.</p>
              ) : (
                fieldError("inputType")
              )}
            </div>
            {isNumber ? (
              <div className="space-y-2">
                <Label htmlFor="attr-family">Unit</Label>
                <Select value={unitFamily ?? NONE} onValueChange={changeFamily} disabled={used}>
                  <SelectTrigger id="attr-family">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No unit</SelectItem>
                    {(Object.keys(UNIT_FAMILIES) as UnitFamily[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {UNIT_FAMILIES[f].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("unitFamily")}
              </div>
            ) : isText ? (
              <div className="space-y-2">
                <Label htmlFor="attr-maxlength">Maximum length</Label>
                <Input
                  id="attr-maxlength"
                  inputMode="numeric"
                  value={maxLength}
                  onChange={(e) => setMaxLength(e.target.value.replace(/\D/g, ""))}
                />
                {fieldError("maxLength")}
              </div>
            ) : null}
          </div>

          {isNumber && unitFamily ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Units a shop may pick</legend>
              <div className="flex flex-wrap gap-4">
                {Object.keys(UNIT_FAMILIES[unitFamily].units).map((u) => (
                  <label key={u} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={units.includes(u)}
                      onCheckedChange={(v) =>
                        setUnits((prev) =>
                          v === true ? (unitFamily === "count" ? [u] : [...prev, u]) : prev.filter((x) => x !== u),
                        )
                      }
                    />
                    {u}
                  </label>
                ))}
              </div>
              {fieldError("units")}
            </fieldset>
          ) : null}

          {isNumber ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="attr-min">Minimum{unitFamily ? ` (${UNIT_FAMILIES[unitFamily].base})` : ""}</Label>
                <Input id="attr-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
                {fieldError("min")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="attr-max">Maximum{unitFamily ? ` (${UNIT_FAMILIES[unitFamily].base})` : ""}</Label>
                <Input id="attr-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
                {fieldError("max")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="attr-decimals">Decimal places</Label>
                <Input
                  id="attr-decimals"
                  inputMode="numeric"
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value.replace(/\D/g, ""))}
                />
                {fieldError("decimals")}
              </div>
            </div>
          ) : null}

          {isChoice ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Values</legend>
              <ol className="space-y-1.5">
                {values.map((v, i) => (
                  <li key={v.id ?? `new-${i}`} className="flex items-center gap-1.5">
                    <Input
                      aria-label={`Value ${i + 1}`}
                      maxLength={VALUE_LABEL_MAX}
                      value={v.label}
                      className={v.status === "retired" ? "text-muted-foreground line-through" : undefined}
                      onChange={(e) =>
                        setValues((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                    />
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {v.usage > 0 ? `${v.usage} used` : ""}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => moveValue(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Move down"
                      disabled={i === values.length - 1}
                      onClick={() => moveValue(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    {v.usage > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setValues((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, status: x.status === "active" ? "retired" : "active" } : x,
                            ),
                          )
                        }
                      >
                        {v.status === "active" ? "Retire" : "Restore"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remove value"
                        onClick={() => setValues((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 />
                      </Button>
                    )}
                    {fields[`values[${i}].label`] ? (
                      <span className="sr-only">{fields[`values[${i}].label`]}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
              {Object.entries(fields)
                .filter(([k]) => k.startsWith("values"))
                .map(([k, m]) => (
                  <p key={k} className="text-xs text-destructive">
                    {k.match(/\[(\d+)\]/) ? `Value ${Number(k.match(/\[(\d+)\]/)![1]) + 1}: ` : ""}
                    {m}
                  </p>
                ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setValues((prev) => [...prev, { label: "", status: "active", usage: 0 }])}
              >
                <Plus />
                Add value
              </Button>
            </fieldset>
          ) : null}

          <div className="space-y-3">
            <SwitchRow
              id="attr-filterable"
              label="Storefront filter"
              hint={
                canFilter
                  ? "Shoppers can filter by it where products have values."
                  : "Only choices, yes/no and numbers can be filters."
              }
              checked={filterable}
              disabled={!canFilter}
              onChange={setFilterable}
            />
            <SwitchRow
              id="attr-visible"
              label="Shown to customers"
              hint="Off keeps it for Effy and the shop only."
              checked={customerVisible}
              onChange={setCustomerVisible}
            />
            <SwitchRow
              id="attr-varies"
              label="May differ by size"
              hint="Entered per variant, e.g. ingredients that differ between flavours."
              checked={variesByVariant || variantOption}
              disabled={variantOption}
              onChange={setVariesByVariant}
            />
            <SwitchRow
              id="attr-option"
              label="Can be a variant option"
              hint={
                canBeOption
                  ? "Shops build sizes from its values (Flavour, Colour…)."
                  : "Only a single choice can be a variant option."
              }
              checked={variantOption}
              disabled={!canBeOption}
              onChange={setVariantOption}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending || name.trim() === "" || stockDate}>
              {attribute ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="ef-switch-row flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
