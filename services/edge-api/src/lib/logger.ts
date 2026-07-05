// Module-singleton pino logger (research C5). Plain synchronous JSON to stdout →
// CloudWatch — NEVER worker-thread transports or pino-pretty in the artifact (log
// lines are lost when the Lambda sandbox freezes). Reused across warm invocations;
// per-request enrichment happens via child loggers in the handler preamble.
import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: "edge-api",
    function: process.env.AWS_LAMBDA_FUNCTION_NAME,
    env: process.env.EFFY_ENV,
  },
});

export type Logger = typeof logger;
