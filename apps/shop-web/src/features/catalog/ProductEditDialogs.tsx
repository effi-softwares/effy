import { useMemo, useState, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui"
import { GST_STATUS_WORDS, type GstStatus } from "@effy/shared-types"

import { AttributeField } from "./AttributeField"
import { FocusedEditDialog, FocusedEditForm } from "./FocusedEditDialog"
import { orderCategories } from "./categories"
import type { AttributeDraftValue } from "./draft"
import { buildAttributeUpdate, buildProductUpdate, diffScalarFields, seedAttributeDraft } from "./focusedEdit"
import { isApproved } from "./review"
import type { ProductDetail, ProductType } from "./model"
import { catalogSchemaQuery } from "./queries"
import { useFocusedEdit } from "./useFocusedEdit"
import { attributeErrors, attributesValid } from "./validation"
import { VariantEditor } from "./VariantEditor"
import { draftFromDetail, toInputs, variantSetErrors, type VariantSetDraft } from "./variants"
import { track } from "@/lib/telemetry"

interface EditProps {
  detail: ProductDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FormProps {
  detail: ProductDetail
  onClose: () => void
}

export function BasicsEditDialog({ detail, open, onOpenChange }: EditProps) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange} size="wide">
      <BasicsForm key={detail.updatedAt} detail={detail} onClose={() => onOpenChange(false)} />
    </FocusedEditDialog>
  )
}

export function SizesEditDialog({ detail, open, onOpenChange }: EditProps) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange} size="full">
      <SizesForm key={detail.updatedAt} detail={detail} onClose={() => onOpenChange(false)} />
    </FocusedEditDialog>
  )
}

export function CategorizationEditDialog({ detail, open, onOpenChange }: EditProps) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange}>
      <CategorizationForm key={detail.updatedAt} detail={detail} onClose={() => onOpenChange(false)} />
    </FocusedEditDialog>
  )
}

export function AttributesEditDialog({ detail, open, onOpenChange }: EditProps) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange} size="wide">
      <AttributesForm key={detail.updatedAt} detail={detail} onClose={() => onOpenChange(false)} />
    </FocusedEditDialog>
  )
}

function BasicsForm({ detail, onClose }: FormProps) {
  const edit = useFocusedEdit(detail.id)

  const [name, setName] = useState(detail.name)
  const [brand, setBrand] = useState(detail.brand ?? "")
  const [shortDescription, setShort] = useState(detail.shortDescription)
  const [longDescription, setLong] = useState(detail.longDescription ?? "")
  const [gstStatus, setGst] = useState<"" | GstStatus>(detail.gstStatus ?? "")

  const canSave = name.trim().length > 0 && shortDescription.trim().length > 0

  function onSave() {
    const changed = diffScalarFields(detail, {
      name: name.trim(),
      brand: brand.trim() || null,
      shortDescription: shortDescription.trim(),
      longDescription: longDescription.trim() || null,
      gstStatus: gstStatus || undefined,
    })
    void edit.save(buildProductUpdate(detail.updatedAt, changed), onClose)
  }

  return (
    <FocusedEditForm
      onCancel={onClose}
      title="Edit basics"
      description={reviewNote(
        detail,
        "Name, brand, GST and descriptions. Prices, codes and weights are each size's — under Sizes and prices.",
      )}
      canSave={canSave}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field id="e-name" label="Name" required>
            <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field id="e-brand" label="Brand">
          <Input id="e-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field id="e-gst" label="GST">
          <Select value={gstStatus} onValueChange={(v) => setGst(v as GstStatus)}>
            <SelectTrigger id="e-gst">
              <SelectValue placeholder="Not set — choose" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gst_free">{GST_STATUS_WORDS.gst_free}</SelectItem>
              <SelectItem value="taxable">{GST_STATUS_WORDS.taxable}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field id="e-short" label="Short description" required>
        <Textarea id="e-short" value={shortDescription} onChange={(e) => setShort(e.target.value)} />
      </Field>
      <Field id="e-long" label="Long description">
        <Textarea id="e-long" rows={6} value={longDescription} onChange={(e) => setLong(e.target.value)} />
      </Field>
    </FocusedEditForm>
  )
}

function SizesForm({ detail, onClose }: FormProps) {
  const edit = useFocusedEdit(detail.id)
  const [set, setSet] = useState<VariantSetDraft>(() => draftFromDetail(detail))
  const [touched, setTouched] = useState(false)

  const errors = variantSetErrors(set)
  const valid = Object.keys(errors).length === 0

  function onSave() {
    setTouched(true)
    if (!valid) return
    const inputs = toInputs(set)
    void edit.save(
      {
        expectedUpdatedAt: detail.updatedAt,
        options: inputs.options,
        variants: inputs.variants,
        unitBasis: inputs.unitBasis,
      },
      () => {
        track({ name: "product_variants_saved", productId: detail.id, variantCount: inputs.variants.length })
        onClose()
      },
    )
  }

  return (
    <FocusedEditForm
      onCancel={onClose}
      title="Edit sizes and prices"
      description={reviewNote(
        detail,
        "What you are paid for each size, and its codes, weight and pack size. Turning a size off is immediate — use the Off sale action on the size's row.",
      )}
      canSave={!touched || valid}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      <VariantEditor
        value={set}
        onChange={setSet}
        errors={errors}
        showErrors={touched}
        media={(detail.pendingChange?.media ?? detail.media).map((m) => ({
          storageKey: m.storageKey,
          url: m.url,
          altText: m.altText,
        }))}
        disabled={edit.saving}
      />
    </FocusedEditForm>
  )
}

function CategorizationForm({ detail, onClose }: FormProps) {
  const edit = useFocusedEdit(detail.id)
  const schema = useQuery(catalogSchemaQuery)

  const [productTypeId, setTypeId] = useState(detail.productTypeId)
  const [primaryCategoryId, setCategoryId] = useState(detail.primaryCategoryId)

  const types = schema.data?.productTypes ?? []
  const orderedCategories = useMemo(() => orderCategories(schema.data?.categories ?? []), [schema.data])
  const canSave = !!productTypeId && !!primaryCategoryId

  function onSave() {
    const changed = diffScalarFields(detail, { productTypeId, primaryCategoryId })
    void edit.save(buildProductUpdate(detail.updatedAt, changed), onClose)
  }

  return (
    <FocusedEditForm
      onCancel={onClose}
      title="Edit categorization"
      description={reviewNote(detail, "Changing the type may change which attributes apply.")}
      canSave={canSave}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      <Field id="e-type" label="Product type" required>
        <Select value={productTypeId} onValueChange={setTypeId}>
          <SelectTrigger id="e-type">
            <SelectValue placeholder="Choose a type…" />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="e-category" label="Category" required>
        <Select value={primaryCategoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="e-category">
            <SelectValue placeholder="Choose a category…" />
          </SelectTrigger>
          <SelectContent>
            {orderedCategories.map(({ category, depth }) => (
              <SelectItem key={category.id} value={category.id}>
                {`${" ".repeat(depth * 2)}${category.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FocusedEditForm>
  )
}

function AttributesForm({ detail, onClose }: FormProps) {
  const edit = useFocusedEdit(detail.id)
  const schema = useQuery(catalogSchemaQuery)

  const type: ProductType | undefined = schema.data?.productTypes.find((t) => t.id === detail.productTypeId)

  const [values, setValues] = useState<Record<string, AttributeDraftValue>>(() => seedAttributeDraft(detail))

  const errors = type ? attributeErrors(type, values) : {}
  const canSave = !!type && attributesValid(type, values)

  function onSave() {
    if (!type) return
    void edit.save(buildAttributeUpdate(detail.updatedAt, type, values), onClose)
  }

  return (
    <FocusedEditForm
      onCancel={onClose}
      title="Edit attributes"
      description={reviewNote(detail, "The details specific to this product's type.")}
      canSave={canSave}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      {!type ? (
        <p className="text-sm text-muted-foreground">Loading attributes…</p>
      ) : type.attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">This product type has no extra attributes.</p>
      ) : (
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          {[...type.attributes]
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((attr) => (
              <div
                key={attr.attributeId}
                className={
                  attr.dataType === "long_text" || attr.dataType === "multi_select" ? "sm:col-span-2" : undefined
                }
              >
                <AttributeField
                  attr={attr}
                  value={values[attr.attributeId]}
                  error={errors[attr.attributeId]}
                  onChange={(next) => setValues((v) => ({ ...v, [attr.attributeId]: next }))}
                />
              </div>
            ))}
        </div>
      )}
    </FocusedEditForm>
  )
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-muted-foreground">*</span> : null}
      </Label>
      {children}
    </div>
  )
}

function reviewNote(detail: ProductDetail, description: string): string {
  return isApproved(detail)
    ? `${description} This product is approved, so your change goes to Effy for review — customers see it once it is approved.`
    : description
}
