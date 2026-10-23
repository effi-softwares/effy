import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { LiveDescriptor, LiveKind } from "@effy/shared-types";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { getAccessToken } from "../runtime/auth-session";
import { createLiveClient, type LiveClient, type LiveState } from "./client";
import { createCoalescer, type Coalescer } from "./coalesce";

/**
 * Keeps the server-state cache current without a timer: when a kind of thing changes, the queries
 * showing it are invalidated, so only what is on screen re-reads (the rest goes stale). A screen reads
 * on open, on return to the foreground, on reconnect, when told something changed and when asked,
 * never otherwise. Nothing here navigates or resets a form.
 */

export interface LiveProviderProps {
  /** Signed in and inside the app. False closes the connection. */
  enabled: boolean;
  /** This audience's `GET /…/v1/live`. Resolve `null` when it answers 204 (no channel here). */
  loadDescriptor: () => Promise<LiveDescriptor | null>;
  /** Which queries show which kind of thing, as query-key prefixes. A kind left out is ignored. */
  routes: Partial<Record<LiveKind, readonly QueryKey[]>>;
  getToken?: () => Promise<string | null>;
  children: ReactNode;
}

export interface LiveStatusValue {
  state: LiveState;
  /** When what is on screen was last known current (the last live moment, or mount). Shown whenever not `live`. */
  currentAsOf: number;
  /** Read everything on screen now, and try the channel again. */
  refresh(): void;
}

const LiveContext = createContext<LiveStatusValue | null>(null);

/** The live channel's state, or `null` outside a `LiveProvider`. */
export function useLiveStatus(): LiveStatusValue | null {
  return useContext(LiveContext);
}

/** A tab hidden this long is treated as put away: the connection is closed until it returns. */
const HIDDEN_CLOSE_MS = 5 * 60_000;

export function LiveProvider({ enabled, loadDescriptor, routes, getToken, children }: LiveProviderProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<LiveState>("off");
  const [currentAsOf, setCurrentAsOf] = useState(() => Date.now());

  // Read through refs so a parent re-render with fresh closures does not tear the connection down.
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const loadRef = useRef(loadDescriptor);
  loadRef.current = loadDescriptor;
  const tokenRef = useRef(getToken ?? getAccessToken);
  tokenRef.current = getToken ?? getAccessToken;

  const clientRef = useRef<LiveClient | null>(null);

  const readKind = useCallback(
    (kind: LiveKind) => {
      for (const queryKey of routesRef.current[kind] ?? []) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    [queryClient],
  );

  const readEverything = useCallback(() => {
    for (const kind of Object.keys(routesRef.current) as LiveKind[]) readKind(kind);
  }, [readKind]);

  useEffect(() => {
    if (!enabled) {
      setState("off");
      return;
    }

    const coalescers = new Map<LiveKind, Coalescer>();
    const client = createLiveClient({
      loadDescriptor: () => loadRef.current(),
      getToken: () => tokenRef.current(),
      onUpdate: (kind) => {
        let c = coalescers.get(kind);
        if (!c) {
          c = createCoalescer(() => readKind(kind));
          coalescers.set(kind, c);
        }
        c.trigger();
      },
      onCaughtUp: readEverything,
      onState: (next) => {
        setState((previous) => {
          // Leaving `live` is the last moment the screen was known current.
          if (previous === "live" && next !== "live") setCurrentAsOf(Date.now());
          return next;
        });
      },
    });
    clientRef.current = client;
    client.start();

    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let hiddenAt: number | undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        hiddenTimer = setTimeout(() => client.stop(), HIDDEN_CLOSE_MS);
        return;
      }
      clearTimeout(hiddenTimer);
      const away = hiddenAt === undefined ? 0 : Date.now() - hiddenAt;
      hiddenAt = undefined;
      if (client.state() === "off") {
        // Closed while hidden (or refused earlier): connecting again reads everything once.
        client.start();
      } else if (away > 10_000) {
        // Still connected as far as the socket knows, but a hidden tab is throttled and a sleeping laptop keeps a dead socket open: read once.
        client.retryNow();
        readEverything();
      }
    };
    const onOnline = () => client.retryNow();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      clearTimeout(hiddenTimer);
      for (const c of coalescers.values()) c.cancel();
      client.stop();
      clientRef.current = null;
    };
  }, [enabled, readEverything, readKind]);

  const refresh = useCallback(() => {
    readEverything();
    const client = clientRef.current;
    if (!client) return;
    if (client.state() === "off") client.start();
    else client.retryNow();
  }, [readEverything]);

  const value = useMemo<LiveStatusValue>(() => ({ state, currentAsOf, refresh }), [state, currentAsOf, refresh]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
