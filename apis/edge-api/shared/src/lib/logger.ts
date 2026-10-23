// One synchronous JSON pino logger to stdout: never worker-thread transports or pino-pretty (lines are
// lost when the sandbox freezes). Per-request child loggers come from the preamble.
import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: "edge-api",
    function: process.env.AWS_LAMBDA_FUNCTION_NAME,
    env: process.env.EFFY_ENV,
  },
});

