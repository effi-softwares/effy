// Domain types + the domain error. Wire shapes (DTOs) live in the handlers; rows live
// in the repository; neither leaks past its layer (ARCHITECTURE.md).

export interface PlatformStatus {
  environment: string;
  databaseName: string;
  databaseTime: Date;
  migrationVersion: number;
  migrationsApplied: number;
}

// DomainError carries a problem-mappable kind; handlers translate kinds to the
// error-envelope vocabulary (docs/api/error-envelope.md).
export class DomainError extends Error {
  constructor(
    readonly kind: "validation" | "not-found" | "unavailable" | "internal",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
