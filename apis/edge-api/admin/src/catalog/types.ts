// Domain types for back-office catalog schema authority (016). Wire DTOs live in
// @effy/shared-types and are mapped explicitly in handler-support; these are the internal domain
// shapes and never leak wire concerns (constitution Principle VI). Mirrors data-model.md §2.1–2.5.

export type AttributeDataType =
  | "short_text"
  | "long_text"
  | "number"
  | "boolean"
  | "single_select"
  | "multi_select";

export const ATTRIBUTE_DATA_TYPES: readonly AttributeDataType[] = [
  "short_text",
  "long_text",
  "number",
  "boolean",
  "single_select",
  "multi_select",
];

export type SchemaStatus = "active" | "retired";
export const SCHEMA_STATUSES: readonly SchemaStatus[] = ["active", "retired"];

export interface AttributeValidation {
  min?: number | null;
  max?: number | null;
  maxLength?: number | null;
}

export interface AllowedValue {
  id: string;
  value: string;
  label: string;
  displayOrder: number;
}

export interface AttributeDefinition {
  id: string;
  key: string;
  name: string;
  dataType: AttributeDataType;
  unit: string | null;
  helpText: string | null;
  validation: AttributeValidation | null;
  status: SchemaStatus;
  allowedValues: AllowedValue[];
  createdAt: string;
  updatedAt: string;
}

/** An attribute as assigned to a product type (the join, carrying per-type facts + the definition). */
export interface Assignment {
  attributeId: string;
  key: string;
  name: string;
  dataType: AttributeDataType;
  unit: string | null;
  helpText: string | null;
  validation: AttributeValidation | null;
  allowedValues: AllowedValue[];
  isMandatory: boolean;
  displayOrder: number;
  groupLabel: string | null;
}

export interface ProductType {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: SchemaStatus;
  attributes: Assignment[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  parentId: string | null;
  key: string;
  name: string;
  displayOrder: number;
  status: SchemaStatus;
}

export interface FieldIssue {
  field: string;
  message: string;
}

// Domain exception → mapped to problem+json in the handler (no HTTP concern here).
export type CatalogErrorKind =
  | "validation" // → 400
  | "conflict" // → 409 (duplicate key, retire/delete an in-use attribute/value, category cycle)
  | "not_found"; // → 404

export class CatalogError extends Error {
  constructor(
    readonly kind: CatalogErrorKind,
    message: string,
    readonly fields?: FieldIssue[],
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

export function isCatalogError(err: unknown): err is CatalogError {
  return err instanceof CatalogError;
}
