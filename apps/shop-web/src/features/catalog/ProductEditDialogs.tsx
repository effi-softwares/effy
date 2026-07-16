import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui";

import { AttributeField } from "./AttributeField";
import { FocusedEditDialog } from "./FocusedEditDialog";
import { orderCategories } from "./categories";
import type { AttributeDraftValue } from "./draft";
import {
  buildAttributeUpdate,
  buildProductUpdate,
  diffScalarFields,
  seedAttributeDraft,
} from "./focusedEdit";
import type { ProductDetail, ProductType } from "./model";
import { catalogSchemaQuery } from "./queries";
import { useFocusedEdit } from "./useFocusedEdit";
import { attributeErrors, attributesValid, isValidPrice } from "./validation";

// The four focused-edit dialogs (US4). Each is scoped to ONE section, seeds its local form state from
// the loaded detail, PATCHes only its changed subset (diffScalarFields) with the detail's `updatedAt`
// as `expectedUpdatedAt`, and on a 409 shows "reload" instead of a doomed retry (FR-023a, via
// useFocusedEdit + FocusedEditDialog). No cards — plain form rows (DOCTRINE-2).

interface EditProps {
  detail: ProductDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Re-seed local state when the dialog opens or the underlying row actually changes (updatedAt moves),
 *  never mid-typing — so a stale reload shows the latest values while normal editing is never clobbered. */
function useSeedKey(detail: ProductDetail, open: boolean) {
  return `${open ? "open" : "closed"}:${detail.updatedAt}`;
}

// ── Basics (name / brand / sku / gtin / descriptions) ─────────────────────────────────────────────

export function BasicsEditDialog({ detail, open, onOpenChange }: EditProps) {
  const edit = useFocusedEdit(detail.id);
  const seedKey = useSeedKey(detail, open);

  const [name, setName] = useState(detail.name);
  const [brand, setBrand] = useState(detail.brand ?? "");
  const [sku, setSku] = useState(detail.sku ?? "");
  const [gtin, setGtin] = useState(detail.gtin ?? "");
  const [shortDescription, setShort] = useState(detail.shortDescription);
  const [longDescription, setLong] = useState(detail.longDescription ?? "");

  useEffect(() => {
    setName(detail.name);
    setBrand(detail.brand ?? "");
    setSku(detail.sku ?? "");
    setGtin(detail.gtin ?? "");
    setShort(detail.shortDescription);
    setLong(detail.longDescription ?? "");
    edit.reset();
    // Seed by open/updatedAt only — see useSeedKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const canSave = name.trim().length > 0 && shortDescription.trim().length > 0;

  function onSave() {
    const changed = diffScalarFields(detail, {
      name: name.trim(),
      brand: brand.trim() || null,
      sku: sku.trim() || null,
      gtin: gtin.trim() || null,
      shortDescription: shortDescription.trim(),
      longDescription: longDescription.trim() || null,
    });
    void edit.save(buildProductUpdate(detail.updatedAt, changed), () => onOpenChange(false));
  }

  return (
    <FocusedEditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit basics"
      description="Name, brand, identifiers, and descriptions."
      canSave={canSave}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      <Field id="e-name" label="Name" required>
        <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="e-brand" label="Brand">
          <Input id="e-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field id="e-sku" label="SKU">
          <Input id="e-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
        </Field>
      </div>
      <Field id="e-gtin" label="GTIN">
        <Input id="e-gtin" value={gtin} onChange={(e) => setGtin(e.target.value)} />
      </Field>
      <Field id="e-short" label="Short description" required>
        <Textarea id="e-short" value={shortDescription} onChange={(e) => setShort(e.target.value)} />
      </Field>
      <Field id="e-long" label="Long description">
        <Textarea id="e-long" value={longDescription} onChange={(e) => setLong(e.target.value)} />
      </Field>
    </FocusedEditDialog>
  );
}

// ── Pricing (price / compare-at) ─────────────────────────────────────────────────────────────────

export function PricingEditDialog({ detail, open, onOpenChange }: EditProps) {
  const edit = useFocusedEdit(detail.id);
  const seedKey = useSeedKey(detail, open);

  const [priceAmount, setPrice] = useState(detail.priceAmount);
  const [compareAtAmount, setCompareAt] = useState(detail.compareAtAmount ?? "");

  useEffect(() => {
    setPrice(detail.priceAmount);
    setCompareAt(detail.compareAtAmount ?? "");
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const compareValid = !compareAtAmount.trim() || isValidPrice(compareAtAmount);
  const canSave = isValidPrice(priceAmount) && compareValid;

  function onSave() {
    const changed = diffScalarFields(detail, {
      priceAmount: priceAmount.trim(),
      compareAtAmount: compareAtAmount.trim() || null,
    });
    void edit.save(buildProductUpdate(detail.updatedAt, changed), () => onOpenChange(false));
  }

  return (
    <FocusedEditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit pricing"
      description="The sell price and an optional compare-at (strike-through) price."
      canSave={canSave}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      <Field id="e-price" label={`Price (${detail.currency})`} required>
        <Input
          id="e-price"
          inputMode="decimal"
          placeholder="0.00"
          value={priceAmount}
          onChange={(e) => setPrice(e.target.value)}
        />
        {priceAmount && !isValidPrice(priceAmount) ? (
          <p className="text-xs text-destructive">Enter a positive amount (e.g. 4.99).</p>
        ) : null}
      </Field>
      <Field id="e-compare" label={`Compare-at (${detail.currency})`}>
        <Input
          id="e-compare"
          inputMode="decimal"
          placeholder="0.00"
          value={compareAtAmount}
          onChange={(e) => setCompareAt(e.target.value)}
        />
        {!compareValid ? (
          <p className="text-xs text-destructive">Enter a positive amount, or leave blank.</p>
        ) : null}
      </Field>
    </FocusedEditDialog>
  );
}

// ── Categorization (product type / primary category) ─────────────────────────────────────────────

export function CategorizationEditDialog({ detail, open, onOpenChange }: EditProps) {
  const edit = useFocusedEdit(detail.id);
  const seedKey = useSeedKey(detail, open);
  const schema = useQuery(catalogSchemaQuery);

  const [productTypeId, setTypeId] = useState(detail.productTypeId);
  const [primaryCategoryId, setCategoryId] = useState(detail.primaryCategoryId);

  useEffect(() => {
    setTypeId(detail.productTypeId);
    setCategoryId(detail.primaryCategoryId);
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const types = schema.data?.productTypes ?? [];
  const orderedCategories = useMemo(
    () => orderCategories(schema.data?.categories ?? []),
    [schema.data],
  );
  const canSave = !!productTypeId && !!primaryCategoryId;

  function onSave() {
    const changed = diffScalarFields(detail, { productTypeId, primaryCategoryId });
    void edit.save(buildProductUpdate(detail.updatedAt, changed), () => onOpenChange(false));
  }

  return (
    <FocusedEditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit categorization"
      description="Changing the type may change which attributes apply."
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
    </FocusedEditDialog>
  );
}

// ── Attributes (the type's EAV fields, reusing AttributeField) ────────────────────────────────────

export function AttributesEditDialog({ detail, open, onOpenChange }: EditProps) {
  const edit = useFocusedEdit(detail.id);
  const seedKey = useSeedKey(detail, open);
  const schema = useQuery(catalogSchemaQuery);

  const type: ProductType | undefined = schema.data?.productTypes.find(
    (t) => t.id === detail.productTypeId,
  );

  const [values, setValues] = useState<Record<string, AttributeDraftValue>>(() =>
    seedAttributeDraft(detail),
  );

  useEffect(() => {
    setValues(seedAttributeDraft(detail));
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const errors = type ? attributeErrors(type, values) : {};
  const canSave = !!type && attributesValid(type, values);

  function onSave() {
    if (!type) return;
    void edit.save(buildAttributeUpdate(detail.updatedAt, type, values), () =>
      onOpenChange(false),
    );
  }

  return (
    <FocusedEditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit attributes"
      description="The details specific to this product's type."
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
        [...type.attributes]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((attr) => (
            <AttributeField
              key={attr.attributeId}
              attr={attr}
              value={values[attr.attributeId]}
              error={errors[attr.attributeId]}
              onChange={(next) =>
                setValues((v) => ({ ...v, [attr.attributeId]: next }))
              }
            />
          ))
      )}
    </FocusedEditDialog>
  );
}

// ── Shared field row ─────────────────────────────────────────────────────────────────────────────

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
