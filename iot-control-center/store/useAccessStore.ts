import { create } from "zustand";

import { capabilities, DEV_ROLE_COOKIE, type Action, type Role } from "@/lib/control-center/access";

interface AccessState {
  loaded: boolean;
  id: string | null;
  name: string | null;
  role: Role | null;
  can: Record<Action, boolean>;
  devRoleSwitch: boolean;
  load: () => Promise<void>;
  /** Local dev only: try the app as another role (reloads the page). */
  setDevRole: (role: Role) => void;
}

/**
 * The signed-in user's Control Center role, for hiding what they may not do.
 * Purely cosmetic: every API route checks the role itself.
 */
export const useAccessStore = create<AccessState>()((set, get) => ({
  loaded: false,
  id: null,
  name: null,
  role: null,
  can: capabilities(null),
  devRoleSwitch: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/control-center/me");
      if (!res.ok) {
        set({ loaded: true });
        return;
      }
      const me = (await res.json()) as { id: string; name: string; role: Role; can: Record<Action, boolean>; devRoleSwitch: boolean };
      set({ loaded: true, ...me });
    } catch {
      set({ loaded: true });
    }
  },
  setDevRole: (role) => {
    document.cookie = `${DEV_ROLE_COOKIE}=${role}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    location.reload();
  },
}));

/** Whether the current user may do `action` (false until the role has loaded). */
export function useCan(action: Action): boolean {
  return useAccessStore((s) => s.can[action]);
}
