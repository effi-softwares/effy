import { bodyOf, route } from "../messages/handlers";
import { changeAutomationState } from "../messages/automations/service";

/** Pause, resume or end an automatic message (115 FR-019). */
export const handler = route((event, actor) => changeAutomationState(event.pathParameters?.id ?? "", bodyOf(event), actor));
