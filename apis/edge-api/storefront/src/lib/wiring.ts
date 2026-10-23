// Module-scope wiring (cached singleton pattern — ARCHITECTURE.md): built once per container and
// reused across warm invocations. No DI framework; the graph is this file, top to bottom.
import { createCatalogRepository } from "../catalog/repository";
import { createCatalogService } from "../catalog/service";
import { createFacetRepository } from "../facets/repository";
import { createFacetService } from "../facets/service";
import { createHomeRepository } from "../home/repository";
import { createHomeService } from "../home/service";
import { createPromotionService } from "../promotions/service";
import { createSearchRepository } from "../search/repository";
import { createSearchService } from "../search/service";
import { createSuggestRepository } from "../suggest/repository";
import { createSuggestService } from "../suggest/service";

export const promotionService = createPromotionService();
export const homeService = createHomeService(createHomeRepository());
export const searchService = createSearchService(createSearchRepository());
export const suggestService = createSuggestService(createSuggestRepository());
export const facetService = createFacetService(createFacetRepository());
export const catalogService = createCatalogService(createCatalogRepository());
