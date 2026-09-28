import { useCallback } from "react";
import { create } from "zustand";

import {
  allowsAt,
  allowsSomewhere,
  capabilities,
  DEV_AS_COOKIE,
  DEV_ROLE_COOKIE,
  type Action,
  type Role,
  type StoreRole,
} from "@/lib/control-center/access";

interface AccessState {
  loaded: boolean;
  id: string | null;
  name: string | null;
  /** global role; null when the user only has per-store roles */
  role: Role | null;
  stores: Record<string, StoreRole>;
  /** what the global role allows */
  can: Record<Action, boolean>;
  devRoleSwitch: boolean;
  /** local dev: the roles-table user being acted as */
  devAs: string | null;
  load: () => Promise<void>;
  /** Local dev only: try the app as another role (reloads the page). */
  setDevRole: (role: Role) => void;
  /** Local dev only: act as a user from the roles table, with their store grants; null = back to Dev Admin. */
  setDevAs: (userId: string | null) => void;
}

const MONTH = 60 * 60 * 24 * 30;

/**
 * The signed-in user's Control Center grants, for hiding what they may not do.
 * Purely cosmetic: every API route checks them itself.
 */
export const useAccessStore = create<AccessState>()((set, get) => ({
  loaded: false,
  id: null,
  name: null,
  role: null,
  stores: {},
  can: capabilities(null),
  devRoleSwitch: false,
  devAs: null,
  load: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/control-center/me");
      if (!res.ok) {
        set({ loaded: true });
        return;
      }
      const me = (await res.json()) as Pick<AccessState, "id" | "name" | "role" | "stores" | "can" | "devRoleSwitch" | "devAs">;
      set({ loaded: true, ...me, stores: me.stores ?? {} });
    } catch {
      set({ loaded: true });
    }
  },
  setDevRole: (role) => {
    document.cookie = `${DEV_AS_COOKIE}=; path=/; max-age=0; samesite=lax`;
    document.cookie = `${DEV_ROLE_COOKIE}=${role}; path=/; max-age=${MONTH}; samesite=lax`;
    location.reload();
  },
  setDevAs: (userId) => {
    document.cookie = userId
      ? `${DEV_AS_COOKIE}=${encodeURIComponent(userId)}; path=/; max-age=${MONTH}; samesite=lax`
      : `${DEV_AS_COOKIE}=; path=/; max-age=0; samesite=lax`;
    location.reload();
  },
}));

/**
 * Whether the current user may do `action` (false until loaded). Without a
 * store: the global role only (things of no store, creating stores). With
 * `storeId`: the global role or that store's. `"any"`: allowed at some store.
 */
export function useCan(action: Action, storeId?: string | null | "any"): boolean {
  return useAccessStore((s) => {
    const g = { role: s.role, stores: s.stores };
    if (storeId === "any") return allowsSomewhere(g, action);
    return allowsAt(g, action, storeId ?? null);
  });
}

/** `useCan` for many stores at once (table rows): a predicate over store ids. */
export function useCanAt(action: Action): (storeId: string | null | undefined) => boolean {
  const role = useAccessStore((s) => s.role);
  const stores = useAccessStore((s) => s.stores);
  // Stable while the grants are, so it can sit in effect/memo dependencies.
  return useCallback((storeId) => allowsAt({ role, stores }, action, storeId ?? null), [role, stores, action]);
}
