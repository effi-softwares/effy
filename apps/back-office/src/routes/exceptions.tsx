import { createRoute } from "@tanstack/react-router"

import { ExceptionsScreen } from "@/features/exceptions/ExceptionsScreen"
import { exceptionsList } from "@/features/exceptions/model"

import { appRoute } from "./app"

export const exceptionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "exceptions",
  validateSearch: exceptionsList.validateSearch,
  component: ExceptionsScreen,
})
