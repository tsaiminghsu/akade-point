import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STORE_SETTINGS, useStoreSettingsStore } from "./useStoreSettingsStore";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("useStoreSettingsStore", () => {
  beforeEach(() => {
    useStoreSettingsStore.setState({ settingsByStore: {}, loadedStores: {} });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("getSettings falls back to defaults before a store has been hydrated", () => {
    expect(useStoreSettingsStore.getState().getSettings("store-1")).toEqual(DEFAULT_STORE_SETTINGS);
  });

  it("hydrateStore merges the server response with defaults, and only fetches once", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ settings: { gridSize: 40 } }));
    vi.stubGlobal("fetch", fetchMock);

    await useStoreSettingsStore.getState().hydrateStore("store-1");
    expect(useStoreSettingsStore.getState().getSettings("store-1")).toEqual({
      ...DEFAULT_STORE_SETTINGS,
      gridSize: 40,
    });

    await useStoreSettingsStore.getState().hydrateStore("store-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("updateSettings applies the patch to local state immediately, before the network write fires", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }))
    );

    useStoreSettingsStore.getState().updateSettings("store-1", { gridSize: 99 });

    expect(useStoreSettingsStore.getState().getSettings("store-1").gridSize).toBe(99);
  });

  it("debounces rapid updateSettings calls into a single network request", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const store = useStoreSettingsStore.getState();
    store.updateSettings("store-1", { apiKey: "a" });
    store.updateSettings("store-1", { apiKey: "ab" });
    store.updateSettings("store-1", { apiKey: "abc" });

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useStoreSettingsStore.getState().getSettings("store-1").apiKey).toBe("abc");
  });

  it("rolls back the optimistic update if the debounced save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Request failed" }, 500))
    );

    useStoreSettingsStore.getState().updateSettings("store-1", { snapEnabled: false });
    await vi.advanceTimersByTimeAsync(600);

    expect(useStoreSettingsStore.getState().getSettings("store-1").snapEnabled).toBe(
      DEFAULT_STORE_SETTINGS.snapEnabled
    );
  });
});
