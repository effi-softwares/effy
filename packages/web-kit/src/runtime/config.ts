/**
 * Build-time config, with a loud failure on a missing key.
 *
 * The failure mode this guards against is not "someone forgot a variable" — it is pointing a
 * console at the WRONG POOL. Sign-in would succeed and every API call would then 401 from an
 * authorizer scoped to a different audience, which reads like a backend bug. Presence is checked
 * here; correctness is caught by the isolation contract, loudly.
 */

export type EnvRecord = Record<string, string | undefined>;

export interface Config<K extends string> {
  /** Throws if any required key is absent. Call before wiring anything else. */
  assert(): void;
  /** Reads a required key. Only safe after `assert()`. */
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
