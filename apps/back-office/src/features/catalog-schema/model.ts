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

/** Domain shapes for the catalog schema: the `@effy/shared-types` DTOs double as them, read through the repo layer. */
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

/** Client-side filter for the schema tables (the catalog list endpoints are unpaginated arrays
 *  the contract lists no query params — so status filtering happens in the browser). */
export type SchemaStatusFilter = SchemaStatus | "all";
