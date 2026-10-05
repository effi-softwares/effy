import type { LiveDescriptor } from "@effy/shared-types";

import { channelPrefix, EPOCH_SECONDS, type LiveNamespace } from "./channel";

export interface LiveDescriptorInput {
  namespace: LiveNamespace;
  scopeId: string;
}

/**
 * What an audience's `GET /…/v1/live` answers. `null` when this environment has no live channel —
 * the route then answers 204 and the app shows that live updates are off (FR-015).
 */
export function describeLive(
  input: LiveDescriptorInput,
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now,
): LiveDescriptor | null {
  const httpHost = env.LIVE_HTTP_HOST;
  const realtimeHost = env.LIVE_REALTIME_HOST;
  if (!httpHost || !realtimeHost) return null;
  return {
    httpHost,
    realtimeHost,
    channelPrefix: channelPrefix(input.namespace, input.scopeId),
    epochSeconds: EPOCH_SECONDS,
    serverTime: new Date(now()).toISOString(),
  };
}
