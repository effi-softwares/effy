import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { CreateProductRequest } from "@effy/shared-types";
import {
  Button,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@effy/design-system/ui";
import { useIsMobile } from "@effy/design-system/hooks/use-mobile";
import { ErrorState } from "@effy/web-kit/console";

import { meQuery } from "@/features/shop-identity/queries";
import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";

import { AttributeField } from "./AttributeField";
import { MediaUpload } from "./MediaUpload";
import { orderCategories } from "./categories";
import {
  clearDraft,
  emptyDraft,
  loadDraft,
  saveDraft,
  type AttributeDraftValue,
  type ProductDraft,
} from "./draft";
import { productMutationError } from "./errorText";
import type { Category, ProductType } from "./model";
import { catalogSchemaQuery, useCreateProduct } from "./queries";
import { uploadProductMedia } from "./repo";
import {
  attributeErrors,
  attributesValid,
  basicsComplete,
  collectAttributeInputs,
  isValidPrice,
} from "./validation";

/**
 * The schema-driven, four-step create flow (FR-011/FR-012).
 *
 * Container: a `Dialog` on desktop, a bottom `Sheet` on mobile-web — same body, so the whole flow is
 * usable desktop→phone (DOCTRINE-2: no cards anywhere; sectioned rows only).
 *
 * ── Media ordering decision (create-then-attach) ─────────────────────────────────────────────────
 * The presign endpoint is `POST /shop/v1/products/{id}/media` — it REQUIRES an existing product id,
 * so a storageKey cannot be obtained before the product row exists. Therefore publish is:
 *     1. POST /shop/v1/products  → product created (draft), returns its id
 *     2. presign → PUT to S3 → register the chosen image as the primary media (uploadProductMedia)
 * "Primary image mandatory at creation" (FR) is enforced HERE in the UI — the flow blocks publish
 * until an image is chosen — and completed atomically inside the publish action. If step 2 fails, the
 * created draft is left recoverable rather than orphaned. (The alternative, attach-then-create via
 * `CreateProductRequest.media[]`, is not reachable because presign needs a product id.)
 */
export interface ProductCreateFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_TITLES = ["Product type", "Basics", "Details", "Review"] as const;

export function ProductCreateFlow({ open, onOpenChange }: ProductCreateFlowProps) {
  const isMobile = useIsMobile();
  const schema = useQuery(catalogSchemaQuery);
  const createProduct = useCreateProduct();

  const { data: session } = useQuery(sessionQuery);
  const subject = session?.status === "signed-in" ? session.identity.subject : null;
  const { data: me } = useQuery(meQuery);
  const shopId = me?.shop?.id ?? null;

  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Restore the device-local draft when the flow opens (FR-012). The image `File` cannot be revived
  // from storage, so it is re-picked; every text field returns.
  useEffect(() => {
    if (!open || !shopId || !subject) return;
    setDraft(loadDraft(shopId, subject) ?? emptyDraft());
    setImageFile(null);
    setUploadProgress(null);
    setFormError(null);
    track({ name: "product_create_started" });
  }, [open, shopId, subject]);

  const selectedType: ProductType | undefined = useMemo(
    () => schema.data?.productTypes.find((t) => t.id === draft.productTypeId),
    [schema.data, draft.productTypeId],
  );
  const orderedCategories = useMemo(
    () => orderCategories(schema.data?.categories ?? []),
    [schema.data],
  );

  function persist(next: ProductDraft) {
    if (shopId && subject) saveDraft(shopId, subject, next);
  }
  function update(patch: Partial<ProductDraft>) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      persist(next);
      return next;
    });
  }
  function updateAttr(id: string, value: AttributeDraftValue) {
    setDraft((d) => {
      const next = { ...d, attributes: { ...d.attributes, [id]: value } };
      persist(next);
      return next;
    });
  }
  function goToStep(step: number) {
    update({ step });
  }

  const step = draft.step;
  const attrErrors = selectedType ? attributeErrors(selectedType, draft.attributes) : {};

  // Step-advance gate — mandatory (universal + the type's mandatory attributes) must be met (FR-011).
  const canAdvance =
    step === 0
      ? !!selectedType
      : step === 1
        ? basicsComplete(draft) && !!imageFile
        : step === 2
          ? !!selectedType && attributesValid(selectedType, draft.attributes)
          : true;

  const busy = createProduct.isPending || uploadProgress != null;

  function discard() {
    if (shopId && subject) clearDraft(shopId, subject);
    setDraft(emptyDraft());
    setImageFile(null);
    setUploadProgress(null);
    setFormError(null);
    onOpenChange(false);
  }

  async function publish() {
    if (!selectedType || !draft.primaryCategoryId || !imageFile) return;
    setFormError(null);
    try {
      const body: CreateProductRequest = {
        productTypeId: selectedType.id,
        primaryCategoryId: draft.primaryCategoryId,
        name: draft.name.trim(),
        priceAmount: draft.priceAmount.trim(),
        shortDescription: draft.shortDescription.trim(),
        brand: draft.brand.trim() || null,
        sku: draft.sku.trim() || null,
        longDescription: draft.longDescription.trim() || null,
        attributes: collectAttributeInputs(selectedType, draft.attributes),
      };
      // 1) create the product row, 2) attach the primary image (see ordering note above).
      const product = await createProduct.mutateAsync(body);
      setUploadProgress(0);
      await uploadProductMedia(product.id, imageFile, {
        isPrimary: true,
        onProgress: setUploadProgress,
      });

      track({ name: "product_created", productId: product.id });
      if (shopId && subject) clearDraft(shopId, subject);
      setDraft(emptyDraft());
      setImageFile(null);
      setUploadProgress(null);
      onOpenChange(false);
    } catch (err) {
      setUploadProgress(null);
      setFormError(productMutationError(err));
    }
  }

  const header = (
    <>
      <p className="text-sm text-muted-foreground">
        Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}
      </p>
    </>
  );

  const body = (
    <div className="space-y-4">
      {schema.isError ? (
        <ErrorState error={schema.error} onRetry={() => void schema.refetch()} />
      ) : schema.isPending ? (
        <p className="text-sm text-muted-foreground">Loading catalog…</p>
      ) : step === 0 ? (
        <TypeStep
          types={schema.data.productTypes}
          selectedId={draft.productTypeId}
          onSelect={(id) => update({ productTypeId: id })}
        />
      ) : step === 1 ? (
        <BasicsStep
          draft={draft}
          categories={orderedCategories}
          imageFile={imageFile}
          uploadProgress={uploadProgress}
          onField={update}
          onImage={setImageFile}
        />
      ) : step === 2 ? (
        <AttributesStep
          type={selectedType}
          values={draft.attributes}
          errors={attrErrors}
          onChange={updateAttr}
        />
      ) : (
        <ReviewStep draft={draft} type={selectedType} categories={orderedCategories} />
      )}

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </div>
  );

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <Button type="button" variant="ghost" onClick={discard} disabled={busy}>
        Discard
      </Button>
      <div className="flex gap-2">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => goToStep(step - 1)}
            disabled={busy}
          >
            Back
          </Button>
        ) : null}
        {step < STEP_TITLES.length - 1 ? (
          <Button type="button" onClick={() => goToStep(step + 1)} disabled={!canAdvance}>
            Next
          </Button>
        ) : (
          <Button type="button" onClick={() => void publish()} disabled={busy}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
        )}
      </div>
    </div>
  );

  const title = "Add product";
  const description = "Create a product through a guided, type-driven form. Your progress is saved.";

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            {header}
            <div className="mt-4">{body}</div>
          </div>
          <SheetFooter>{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {header}
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────────────────────

function TypeStep({
  types,
  selectedId,
  onSelect,
}: {
  types: ProductType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (types.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No product types are available yet. Ask the back office to define one.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Pick what kind of product this is.</p>
      <div className="divide-y rounded-md border">
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-muted/50 ${
              selectedId === t.id ? "bg-muted" : ""
            }`}
            aria-pressed={selectedId === t.id}
          >
            <span className="font-medium">{t.name}</span>
            {t.description ? (
              <span className="text-xs text-muted-foreground">{t.description}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function BasicsStep({
  draft,
  categories,
  imageFile,
  uploadProgress,
  onField,
  onImage,
}: {
  draft: ProductDraft;
  categories: { category: Category; depth: number }[];
  imageFile: File | null;
  uploadProgress: number | null;
  onField: (patch: Partial<ProductDraft>) => void;
  onImage: (file: File | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="p-name">
          Name<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <Input
          id="p-name"
          value={draft.name}
          onChange={(e) => onField({ name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-category">
          Category<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <Select
          value={draft.primaryCategoryId ?? ""}
          onValueChange={(v) => onField({ primaryCategoryId: v })}
        >
          <SelectTrigger id="p-category">
            <SelectValue placeholder="Choose a category…" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(({ category, depth }) => (
              <SelectItem key={category.id} value={category.id}>
                {`${" ".repeat(depth * 2)}${category.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-price">
            Price<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Input
            id="p-price"
            inputMode="decimal"
            placeholder="0.00"
            value={draft.priceAmount}
            onChange={(e) => onField({ priceAmount: e.target.value })}
          />
          {draft.priceAmount && !isValidPrice(draft.priceAmount) ? (
            <p className="text-xs text-destructive">Enter a positive amount (e.g. 4.99).</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-brand">Brand (optional)</Label>
          <Input
            id="p-brand"
            value={draft.brand}
            onChange={(e) => onField({ brand: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-sku">SKU (optional)</Label>
        <Input id="p-sku" value={draft.sku} onChange={(e) => onField({ sku: e.target.value })} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-short">
          Short description<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <Textarea
          id="p-short"
          value={draft.shortDescription}
          onChange={(e) => onField({ shortDescription: e.target.value })}
        />
      </div>

      <MediaUpload file={imageFile} onChange={onImage} progress={uploadProgress} />
    </div>
  );
}

function AttributesStep({
  type,
  values,
  errors,
  onChange,
}: {
  type: ProductType | undefined;
  values: Record<string, AttributeDraftValue>;
  errors: Record<string, string>;
  onChange: (id: string, value: AttributeDraftValue) => void;
}) {
  if (!type) return null;
  if (type.attributes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This product type has no extra details to fill in.
      </p>
    );
  }

  // Group by the back-office `groupLabel`, preserving display order within each group.
  const groups = new Map<string, ProductType["attributes"]>();
  for (const attr of [...type.attributes].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const key = attr.groupLabel ?? "";
    const list = groups.get(key) ?? [];
    list.push(attr);
    groups.set(key, list);
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([groupLabel, attrs]) => (
        <section key={groupLabel || "_"} className="space-y-4">
          {groupLabel ? (
            <h3 className="text-sm font-semibold text-muted-foreground">{groupLabel}</h3>
          ) : null}
          {attrs.map((attr) => (
            <AttributeField
              key={attr.attributeId}
              attr={attr}
              value={values[attr.attributeId]}
              error={errors[attr.attributeId]}
              onChange={(next) => onChange(attr.attributeId, next)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function ReviewStep({
  draft,
  type,
  categories,
}: {
  draft: ProductDraft;
  type: ProductType | undefined;
  categories: { category: Category; depth: number }[];
}) {
  const categoryName =
    categories.find((c) => c.category.id === draft.primaryCategoryId)?.category.name ?? "—";

  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Type</dt>
      <dd>{type?.name ?? "—"}</dd>
      <dt className="text-muted-foreground">Name</dt>
      <dd>{draft.name || "—"}</dd>
      <dt className="text-muted-foreground">Category</dt>
      <dd>{categoryName}</dd>
      <dt className="text-muted-foreground">Price</dt>
      <dd>{draft.priceAmount || "—"}</dd>
      {draft.brand ? (
        <>
          <dt className="text-muted-foreground">Brand</dt>
          <dd>{draft.brand}</dd>
        </>
      ) : null}
      {draft.sku ? (
        <>
          <dt className="text-muted-foreground">SKU</dt>
          <dd>{draft.sku}</dd>
        </>
      ) : null}
      <dt className="text-muted-foreground">Description</dt>
      <dd>{draft.shortDescription || "—"}</dd>
    </dl>
  );
}

