import { useState, type ReactNode } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"

import { Input, Label, Textarea } from "@effy/design-system/ui"
import {
  formRows,
  recategorise,
  validateDetails,
  type DetailInput,
  type DetailVariant,
  type FactKey,
  type ProductFacts,
  type UpdateProductRequest,
} from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"

import {
  CategoryPicker,
  DetailField,
  draftFromDetail,
  FactsSection,
  RecategoriseDialog,
  sendableDetails,
  setDetail,
  toInputs,
  VariantEditor,
  type VariantSetDraft,
  variantSetErrors,
} from "@effy/web-kit/product-form"
import { FormSkeleton, Loading } from "@effy/web-kit/patterns"
import { FocusedEditDialog, FocusedEditForm } from "./FocusedEditDialog"
import { buildProductUpdate, diffScalarFields } from "./focusedEdit"
import { pathText, type ProductDetail } from "./model"
import { categoryFormQuery, taxonomyQuery } from "./queries"
import { isApproved } from "./review"
import { useFocusedEdit } from "./useFocusedEdit"
import { track } from "@/lib/telemetry"

interface EditProps {
  detail: ProductDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Details a save removed (a new category, one size left): the screen says which. */
  onDropped?: (names: string[]) => void
}

interface FormProps {
  detail: ProductDetail
  onClose: () => void
  onDropped?: (names: string[]) => void
}

/** After a save, report any details the server dropped, then close. */
const finish = (onClose: () => void, onDropped?: (names: string[]) => void) => (saved: ProductDetail) => {
  if (saved.droppedDetails && saved.droppedDetails.length > 0) onDropped?.(saved.droppedDetails)
  onClose()
}

export function BasicsEditDialog({ detail, open, onOpenChange }: EditProps) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange} size="wide">
      <BasicsForm key={detail.updatedAt} detail={detail} onClose={() => onOpenChange(false)} />
    </FocusedEditDialog>
  )
}

export function SizesEditDialog({ detail, open, onOpenChange, onDropped }: EditProps) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange} size="full">
      <SizesForm key={detail.updatedAt} detail={detail} onClose={() => onOpenChange(false)} onDropped={onDropped} />
    </FocusedEditDialog>
  )
}

export function CategoryEditDialog({ detail, open, onOpenChange, onDropped }: EditProps) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange} size="wide">
      <CategoryForm key={detail.updatedAt} detail={detail} onClose={() => onOpenChange(false)} onDropped={onDropped} />
    </FocusedEditDialog>
  )
}

export function DetailsEditDialog({ detail, open, onOpenChange, section }: EditProps & { section: string | null }) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange} size="wide">
      <DetailsForm
        key={`${detail.updatedAt}:${section}`}
        detail={detail}
        section={section}
        onClose={() => onOpenChange(false)}
      />
    </FocusedEditDialog>
  )
}

export function FactsEditDialog({ detail, open, onOpenChange }: EditProps) {
  return (
    <FocusedEditDialog open={open} onOpenChange={onOpenChange} size="wide">
      <FactsForm key={detail.updatedAt} detail={detail} onClose={() => onOpenChange(false)} />
    </FocusedEditDialog>
  )
}

function BasicsForm({ detail, onClose }: FormProps) {
  const edit = useFocusedEdit(detail.id)

  const [name, setName] = useState(detail.name)
  const [brand, setBrand] = useState(detail.brand ?? "")
  const [shortDescription, setShort] = useState(detail.shortDescription)
  const [longDescription, setLong] = useState(detail.longDescription ?? "")

  const canSave = name.trim().length > 0 && shortDescription.trim().length > 0

  function onSave() {
    const changed = diffScalarFields(detail, {
      name: name.trim(),
      brand: brand.trim() || null,
      shortDescription: shortDescription.trim(),
      longDescription: longDescription.trim() || null,
    })
    void edit.save(buildProductUpdate(detail.updatedAt, changed), onClose)
  }

  return (
    <FocusedEditForm
      onCancel={onClose}
      title="Edit basics"
      description={reviewNote(
        detail,
        "Name, brand and descriptions. Prices, codes and weights are each size's — under Sizes and prices.",
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

function SizesForm({ detail, onClose, onDropped }: FormProps) {
  const edit = useFocusedEdit(detail.id)
  const form = useQuery(categoryFormQuery(detail.primaryCategoryId))
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
      (saved) => {
        track({ name: "product_variants_saved", productId: detail.id, variantCount: inputs.variants.length })
        finish(onClose, onDropped)(saved)
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
      canSave={(!touched || valid) && !!form.data}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      {form.isError ? (
        <ErrorState error={form.error} onRetry={() => void form.refetch()} />
      ) : (
        <VariantEditor
          value={set}
          onChange={setSet}
          rows={form.data ? formRows(form.data) : []}
          errors={errors}
          showErrors={touched}
          media={(detail.pendingChange?.media ?? detail.media).map((m) => ({
            storageKey: m.storageKey,
            url: m.url,
            altText: m.altText,
          }))}
          disabled={edit.saving}
        />
      )}
    </FocusedEditForm>
  )
}

/** Facts the shop chose itself: those that differ from the current leaf's defaults. They survive a move. */
function touchedFacts(detail: ProductDetail): FactKey[] {
  const keys: FactKey[] = ["storage", "gstStatus", "ageRestricted"]
  return keys.filter((k) => detail.factDefaults[k] !== null && detail[k] !== detail.factDefaults[k])
}

function CategoryForm({ detail, onClose, onDropped }: FormProps) {
  const edit = useFocusedEdit(detail.id)
  const queryClient = useQueryClient()
  const taxonomy = useQuery(taxonomyQuery)
  const current = useQuery(categoryFormQuery(detail.primaryCategoryId))
  const [leafId, setLeafId] = useState(detail.primaryCategoryId)
  const [confirm, setConfirm] = useState<{ path: string; dropped: string[] } | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  function save() {
    const body: UpdateProductRequest = {
      expectedUpdatedAt: detail.updatedAt,
      primaryCategoryId: leafId,
      factsTouched: touchedFacts(detail),
    }
    void edit.save(body, finish(onClose, onDropped))
  }

  async function onSave() {
    if (leafId === detail.primaryCategoryId) return onClose()
    setCheckError(null)
    try {
      const next = await queryClient.fetchQuery(categoryFormQuery(leafId))
      const facts: ProductFacts = {
        storage: detail.storage,
        gstStatus: detail.gstStatus,
        ageRestricted: detail.ageRestricted,
      }
      const moved = recategorise(
        { details: detail.details, facts, factsTouched: touchedFacts(detail) },
        current.data ? formRows(current.data) : [],
        formRows(next),
        next.defaults,
      )
      if (moved.dropped.length > 0) setConfirm({ path: pathText(next.path), dropped: moved.dropped })
      else save()
    } catch {
      setCheckError("Couldn't load that category's form. Try again.")
    }
  }

  return (
    <FocusedEditForm
      onCancel={onClose}
      title="Change category"
      description={reviewNote(detail, "The category decides the details asked for and where shoppers find it.")}
      canSave={!!leafId && !!current.data}
      saving={edit.saving}
      error={edit.error ?? checkError}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={() => void onSave()}
    >
      {taxonomy.isError ? (
        <ErrorState error={taxonomy.error} onRetry={() => void taxonomy.refetch()} />
      ) : taxonomy.data ? (
        <CategoryPicker
          onEvent={track}
          categories={taxonomy.data.categories}
          recentLeafIds={taxonomy.data.recentLeafIds}
          productName={detail.name}
          value={leafId}
          onChange={setLeafId}
          disabled={edit.saving}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      )}
      {confirm ? (
        <RecategoriseDialog
          toPath={confirm.path}
          dropped={confirm.dropped}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            save()
          }}
        />
      ) : null}
    </FocusedEditForm>
  )
}

/** The product's sizes as the details rules see them. */
export function detailVariants(detail: ProductDetail): DetailVariant[] {
  return detail.variants.filter((v) => v.state !== "removed").map((v) => ({ id: v.id, label: v.label ?? "This size" }))
}

const optionAttributeIdsOf = (detail: ProductDetail) =>
  detail.options.flatMap((o) => (o.attributeId ? [o.attributeId] : []))

function DetailsForm({ detail, section, onClose }: FormProps & { section: string | null }) {
  const edit = useFocusedEdit(detail.id)
  const form = useQuery(categoryFormQuery(detail.primaryCategoryId))
  const [details, setDetails] = useState<DetailInput[]>(() => detail.details)
  const [touched, setTouched] = useState(false)
  const variants = detailVariants(detail)
  const optionIds = optionAttributeIdsOf(detail)
  const rows = form.data ? formRows(form.data) : []
  const errorList = validateDetails(rows, sendableDetails(details), variants, { optionAttributeIds: optionIds })
  const errors = Object.fromEntries(errorList.map((e) => [e.field, e.message]))
  const sections = (form.data?.sections ?? [])
    .filter((s) => section === null || s.title === section)
    .map((s) => ({ ...s, rows: s.rows.filter((r) => !optionIds.includes(r.attributeId)) }))
    .filter((s) => s.rows.length > 0)

  function onSave() {
    setTouched(true)
    if (errorList.length > 0) return
    void edit.save({ expectedUpdatedAt: detail.updatedAt, details: sendableDetails(details) }, onClose)
  }

  return (
    <FocusedEditForm
      onCancel={onClose}
      title={section ? `Edit ${section.toLowerCase()}` : "Edit details"}
      description={reviewNote(detail, `What ${pathText(detail.categoryPath)} asks for. Required ones are marked.`)}
      canSave={!!form.data && (!touched || errorList.length === 0)}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      {form.isError ? (
        <ErrorState error={form.error} onRetry={() => void form.refetch()} />
      ) : !form.data ? (
        <Loading label="Loading the form">
          <FormSkeleton fields={4} submit={false} />
        </Loading>
      ) : (
        <div className="grid gap-6">
          {sections.map((s) => (
            <section key={s.title} className="grid gap-5" aria-label={s.title}>
              {section === null ? <h3 className="text-sm font-semibold">{s.title}</h3> : null}
              {s.rows.map((row) => (
                <DetailField
                  key={row.attributeId}
                  row={row}
                  entry={details.find((d) => d.attributeId === row.attributeId)}
                  variants={variants}
                  errors={touched ? errors : {}}
                  disabled={edit.saving}
                  onChange={(next) => setDetails((d) => setDetail(d, next, row.attributeId))}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </FocusedEditForm>
  )
}

function FactsForm({ detail, onClose }: FormProps) {
  const edit = useFocusedEdit(detail.id)
  const [facts, setFacts] = useState<ProductFacts>({
    storage: detail.storage,
    gstStatus: detail.gstStatus,
    ageRestricted: detail.ageRestricted,
  })
  const [touched, setTouched] = useState<FactKey[]>(() => touchedFacts(detail))

  function onSave() {
    const body: UpdateProductRequest = { expectedUpdatedAt: detail.updatedAt }
    if (facts.storage !== null && facts.storage !== detail.storage) body.storage = facts.storage
    if (facts.gstStatus !== null && facts.gstStatus !== detail.gstStatus) body.gstStatus = facts.gstStatus
    if (facts.ageRestricted !== null && facts.ageRestricted !== detail.ageRestricted)
      body.ageRestricted = facts.ageRestricted
    if (Object.keys(body).length === 1) return onClose()
    void edit.save(body, onClose)
  }

  return (
    <FocusedEditForm
      onCancel={onClose}
      title="Edit storage, GST and age"
      description={reviewNote(
        detail,
        "Each starts from the category's default. A change is shown to Effy's reviewers.",
      )}
      canSave
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      <FactsSection
        facts={facts}
        defaults={detail.factDefaults}
        touched={touched}
        onChange={(f, t) => {
          setFacts(f)
          setTouched(t)
        }}
        disabled={edit.saving}
      />
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
