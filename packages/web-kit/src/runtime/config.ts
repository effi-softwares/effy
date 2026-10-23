/**
 * Build-time config that fails loudly on a missing key. The real risk is a console pointed at the wrong
 * pool: sign-in works and every API call 401s, which reads like a backend bug.
 */

export type EnvRecord = Record<string, string | undefined>;

export interface Config<K extends string> {
  /** Throws if any required key is absent. Call before wiring anything else. */
  assert(): void;
  /** Reads a required key. Only safe after `assert`. */
  require(key: K): string;
  /** Reads an optional key. */
  optional(key: string): string | undefined;
}

export function createConfig<K extends string>(
  requiredKeys: readonly K[],
  env: EnvRecord,
  hint = "Set them in the app's .env.local (see contracts/config.contract.md).",
): Config<K> {
  return {
    assert(): void {
      const missing = requiredKeys.filter((k) => !env[k]);
      if (missing.length > 0) {
        throw new Error(`Missing required config: ${missing.join(", ")}. ${hint}`);
      }
    },
    require(key: K): string {
      const value = env[key];
      if (!value) throw new Error(`Missing required config: ${key}. ${hint}`);
      return value;
    },
    optional(key: string): string | undefined {
      return env[key];
    },
  };
}
