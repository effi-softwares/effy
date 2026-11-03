// Guided tours (106): the behaviour every console shares. The look is `TourStepView` in @effy/design-system/ui;
// each console supplies its own list of tours (`defineTours`) and its two fetch functions (`tourStateQueries`).
export { defineTours, validateTours, TOUR_LIMITS, type TourDef, type TourSide, type TourStepDef } from "./define";
export {
  applyPatch,
  counter,
  EMPTY_TOUR_SENTENCE,
  isPresent,
  isRevised,
  nextShown,
  PAGE_NOT_LOADED_HINT,
  resolveTarget,
  shouldOffer,
  shownSteps,
  stepVisible,
  tourAllowed,
  tourStatus,
  welcomeFirst,
  type PageStatus,
  type StepContext,
} from "./engine";
export { tourStateQueries, TOUR_STATE_KEY, TOUR_WRITE_KEY, type TourStateFetchers } from "./state";
export type { TourVia } from "./store";
export { TourProvider, useTours, type TourEvent, type TourListItem, type TourProviderProps } from "./TourProvider";
export { useTourPage } from "./useTourPage";
export { TourHelpButton } from "./TourHelpButton";
export { AllToursDialog } from "./AllToursDialog";
