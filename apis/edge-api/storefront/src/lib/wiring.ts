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
const searchRepository = createSearchRepository();
export const searchService = createSearchService(searchRepository);
export const suggestService = createSuggestService(createSuggestRepository());
export const facetService = createFacetService(createFacetRepository(), (keys) => searchRepository.rangeUnits(keys));
export const catalogService = createCatalogService(createCatalogRepository());
