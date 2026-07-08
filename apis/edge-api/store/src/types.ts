// Store-domain types. Wire shapes (DTOs) live in handlers; rows live in the repository;
// neither leaks past its layer (ARCHITECTURE.md).
export interface PlatformStatus {
  environment: string;
  databaseName: string;
  databaseTime: Date;
  migrationVersion: number;
  migrationsApplied: number;
}
