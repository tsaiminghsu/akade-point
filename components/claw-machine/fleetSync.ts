// Keeps the operator's machines in the server's store (for now SQLite, see
// lib/claw-machine/fleetRepository.ts) as well as in the browser. The
// browser copy is the cache and the fallback when the store can't be
// reached; whichever of the two was changed last wins on load.

import type { Fleet } from './fleet';

const API = '/api/claw-machine/fleet';
/** When the browser's copy was last changed (ms since epoch), beside the fleet itself. */
export const FLEET_SAVED_AT_KEY = 'claw-machine-fleet-saved-at';

/** What the store had: a fleet and when it was saved, nothing yet, or no store to be reached. */
export type ServerFleet = { fleet: unknown; savedAt: number } | 'empty' | 'unavailable';

export type SyncState = 'saved' | 'saving' | 'offline' | 'error';
export const SYNC_LABEL: Record<SyncState, string> = {
  saved: '已存到資料庫',
  saving: '儲存中…',
  offline: '只存在這台瀏覽器',
  error: '資料庫存檔失敗，稍後重試',
};

/** The shop whose machines these are: `?shop=` on the page, or "default". */
export function shopFromUrl(): string {
  try {
    const shop = new URLSearchParams(window.location.search).get('shop');
    return shop && /^[A-Za-z0-9_-]{1,40}$/.test(shop) ? shop : 'default';
  } catch {
    return 'default';
  }
}

function url(shop: string) {
  return `${API}?shop=${encodeURIComponent(shop)}`;
}

export async function fetchServerFleet(shop: string, timeoutMs = 4000): Promise<ServerFleet> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url(shop), { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return 'unavailable';
    const body = (await res.json()) as { fleet?: unknown; savedAt?: unknown };
    if (!body.fleet) return 'empty';
    return { fleet: body.fleet, savedAt: typeof body.savedAt === 'number' ? body.savedAt : 0 };
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

/** Save the whole fleet; `keepalive` lets it finish as the page closes. True if the store took it. */
export async function putServerFleet(shop: string, fleet: Fleet, savedAt: number, keepalive = false): Promise<boolean> {
  try {
    const res = await fetch(url(shop), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fleet, savedAt }),
      keepalive,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Which copy to start from: the store's unless the browser's was changed
 * since (then it goes up to the store), the browser's alone when there's no
 * store to reach.
 */
export function pickStart(localSavedAt: number, server: ServerFleet): { use: 'server' | 'local'; online: boolean; upload: boolean } {
  if (server === 'unavailable') return { use: 'local', online: false, upload: false };
  if (server === 'empty') return { use: 'local', online: true, upload: true };
  if (server.savedAt >= localSavedAt) return { use: 'server', online: true, upload: false };
  return { use: 'local', online: true, upload: true };
}
