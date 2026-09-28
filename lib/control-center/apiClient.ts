import { toast } from "sonner";

import { LOCALE_COOKIE_NAME } from "./constants";

/** Said on a 403 instead of the route's bare "Forbidden" (roles: lib/control-center/access.ts). */
const FORBIDDEN: Record<string, string> = {
  "zh-TW": "你的角色沒有權限執行這個動作。",
  "en-US": "Your role does not allow this.",
  "ja-JP": "あなたの役割ではこの操作はできません。",
};

function forbiddenMessage(): string {
  const m = typeof document === "undefined" ? null : new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]+)`).exec(document.cookie);
  return FORBIDDEN[m?.[1] ?? ""] ?? FORBIDDEN["zh-TW"];
}

/**
 * Shared fetch wrapper for all Control Center stores. Handles both HTTP-level
 * failures (non-2xx) and network-level failures (fetch() itself throwing —
 * offline, DNS, timeout), so no store has to special-case either one.
 */
export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
  opts: { silent?: boolean; timeoutMs?: number } = {}
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);

  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
      if (!opts.silent) toast.error(res.status === 403 ? forbiddenMessage() : (body.error ?? `Request failed (${res.status})`));
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    const message = err instanceof DOMException && err.name === "AbortError" ? "Request timed out" : "Network error";
    if (!opts.silent) toast.error(message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
