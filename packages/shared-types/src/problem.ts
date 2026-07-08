/** RFC 9457 problem+json — the platform's single machine-readable error shape (mirrors
 *  docs/api/error-envelope.md from 004). Typed ONCE here (Principle II); every web surface
 *  consumes it, never re-declares it. */
export interface ProblemJSON {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}
