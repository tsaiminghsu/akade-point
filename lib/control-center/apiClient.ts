import { toast } from "sonner";

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
      if (!opts.silent) toast.error(body.error ?? `Request failed (${res.status})`);
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
