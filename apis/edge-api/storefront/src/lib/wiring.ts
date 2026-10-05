// Module-scope wiring (cached singleton pattern — ARCHITECTURE.md): built once per container and
// reused across warm invocations. No DI framework; the graph is this file, top to bottom.
import { createCatalogRepository } from "../catalog/repository";
import { createCatalogService } from "../catalog/service";
import { createFacetRepository } from "../facets/repository";
import { createFacetService } from "../facets/service";
import { createHomeRepository } from "../home/repository";
import { createHomeService } from "../home/service";
import { createPromotionRepository } from "../promotions/repository";
import { createPromotionService } from "../promotions/service";
import { createSearchRepository } from "../search/repository";
import { createSearchService } from "../search/service";

export const promotionService = createPromotionService(createPromotionRepository());
export const homeService = createHomeService(createHomeRepository(), promotionService);
export const searchService = createSearchService(createSearchRepository());
export const facetService = createFacetService(createFacetRepository());
export const catalogService = createCatalogService(createCatalogRepository());
