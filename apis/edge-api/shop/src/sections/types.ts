// Domain type for shop-local sections (016, US5). Wire DTO (ShopSectionDTO) lives in
// @effy/shared-types. Errors reuse the products slice's ProductError so the shop handler-support
// maps them uniformly.
export interface ShopSection {
  id: string;
  name: string;
  displayOrder: number;
}
