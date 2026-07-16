import type {
  AssignAttributeRequest,
  AttributeAllowedValueDTO,
  AttributeDefinitionDTO,
  AttributeValidationDTO,
  CategoryDTO,
  ChangeSchemaStatusRequest,
  CreateAttributeDefinitionRequest,
  CreateCategoryRequest,
  CreateProductTypeRequest,
  ProductTypeAttributeDTO,
  ProductTypeDTO,
  SchemaStatus,
  UpdateAssignmentRequest,
  UpdateAttributeDefinitionRequest,
  UpdateCategoryRequest,
  UpdateProductTypeRequest,
} from "@effy/shared-types";

/**
 * Domain shapes for the back-office catalog schema authority (016, US1).
 *
 * The wire DTOs (specs/016 contracts, already in @effy/shared-types) double as the domain shapes
 * here — they carry no wire-only encoding to strip. We still route every read/write through the
 * repo layer (Principle VI), so if a DTO and its domain model ever diverge, only the repo changes.
 */
export type ProductType = ProductTypeDTO;
export type ProductTypeAttribute = ProductTypeAttributeDTO;
export type AttributeDefinition = AttributeDefinitionDTO;
export type AttributeAllowedValue = AttributeAllowedValueDTO;
export type AttributeValidation = AttributeValidationDTO;
export type Category = CategoryDTO;

export type {
  AssignAttributeRequest,
  ChangeSchemaStatusRequest,
  CreateAttributeDefinitionRequest,
  CreateCategoryRequest,
  CreateProductTypeRequest,
  SchemaStatus,
  UpdateAssignmentRequest,
  UpdateAttributeDefinitionRequest,
  UpdateCategoryRequest,
  UpdateProductTypeRequest,
};

/** Client-side filter for the schema tables (the catalog list endpoints are unpaginated arrays —
 *  the contract lists no query params — so status filtering happens in the browser). */
export type SchemaStatusFilter = SchemaStatus | "all";
