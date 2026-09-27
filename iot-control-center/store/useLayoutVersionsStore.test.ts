import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutVersionsStore } from "./useLayoutVersionsStore";
import type { Widget } from "@/lib/control-center/types";

function widget(id: string): Widget {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    locked: false,
    hidden: false,
    layerGroup: "zones",
    name: "Rect",
    fill: "#000",
    stroke: "#000",
    strokeWidth: 1,
  };
}

interface ServerVersion {
  storeId: string;
  id: string;
  name: string;
  savedAt: number;
  widgets: Widget[];
}

// A minimal in-memory stand-in for the layout-versions and store-patch API
// routes, so the store's fetch-based actions can be exercised end to end
// without hitting a real server.
function installFakeServer() {
  const versionsByStore: Record<string, ServerVersion[]> = {};
  let idCounter = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const versionMatch = url.match(/^\/api\/control-center\/layout-versions\/([^/]+)(?:\/([^/]+))?$/);
      const storeMatch = url.match(/^\/api\/control-center\/stores\/([^/]+)$/);

      if (versionMatch) {
        const [, storeId, versionId] = versionMatch;
        const list = versionsByStore[storeId] ?? [];

        if (!versionId) {
          if (method === "GET") return jsonResponse({ versions: list });
          if (method === "POST") {
            const body = JSON.parse(String(init?.body));
            idCounter += 1;
            const version: ServerVersion = {
              storeId,
              id: `v${idCounter}`,
              name: body.name,
              savedAt: Date.now(),
              widgets: body.widgets,
            };
            versionsByStore[storeId] = [...list, version];
            return jsonResponse({ version });
          }
        } else {
          if (method === "PATCH") {
            const body = JSON.parse(String(init?.body));
            versionsByStore[storeId] = list.map((v) =>
              v.id === versionId ? { ...v, ...body, savedAt: Date.now() } : v
            );
            return jsonResponse({ ok: true });
          }
          if (method === "DELETE") {
            versionsByStore[storeId] = list.filter((v) => v.id !== versionId);
            return jsonResponse({ ok: true });
          }
        }
      }

      if (storeMatch && method === "PATCH") {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: "not found" }, 404);
    })
  );

  return versionsByStore;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("useLayoutVersionsStore", () => {
  beforeEach(() => {
    useLayoutVersionsStore.setState({ versionsByStore: {}, activeVersionIdByStore: {}, loadedStores: {} });
    installFakeServer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds a default version only once per store", async () => {
    const store = useLayoutVersionsStore.getState();
    const first = await store.ensureDefaultVersion("store-1", [widget("w1")]);
    const second = await store.ensureDefaultVersion("store-1", [widget("w2")]);
    expect(second.id).toBe(first.id);
    expect(useLayoutVersionsStore.getState().getVersions("store-1")).toHaveLength(1);
  });

  it("updateActiveVersion persists widgets into the currently active version", async () => {
    const store = useLayoutVersionsStore.getState();
    await store.ensureDefaultVersion("store-1", [widget("w1")]);
    await store.updateActiveVersion("store-1", [widget("w1"), widget("w2")]);
    const active = useLayoutVersionsStore.getState().getActiveVersion("store-1");
    expect(active?.widgets).toHaveLength(2);
  });

  it("saveAsNewVersion adds a version and makes it active", async () => {
    const store = useLayoutVersionsStore.getState();
    await store.ensureDefaultVersion("store-1", [widget("w1")]);
    const newId = await store.saveAsNewVersion("store-1", "Weekend Layout", [widget("w2")]);
    expect(newId).not.toBeNull();
    expect(useLayoutVersionsStore.getState().getVersions("store-1")).toHaveLength(2);
    expect(useLayoutVersionsStore.getState().getActiveVersion("store-1")?.id).toBe(newId);
  });

  it("blocks deleting the last remaining version for a store", async () => {
    const store = useLayoutVersionsStore.getState();
    await store.ensureDefaultVersion("store-1", [widget("w1")]);
    const only = useLayoutVersionsStore.getState().getVersions("store-1")[0];
    const ok = await store.deleteVersion("store-1", only.id);
    expect(ok).toBe(false);
    expect(useLayoutVersionsStore.getState().getVersions("store-1")).toHaveLength(1);
  });

  it("allows deleting a version when another one remains, falling back the active pointer", async () => {
    const store = useLayoutVersionsStore.getState();
    await store.ensureDefaultVersion("store-1", [widget("w1")]);
    const secondId = await store.saveAsNewVersion("store-1", "Second", [widget("w2")]);
    const ok = await store.deleteVersion("store-1", secondId!);
    expect(ok).toBe(true);
    const remaining = useLayoutVersionsStore.getState().getVersions("store-1");
    expect(remaining).toHaveLength(1);
    expect(useLayoutVersionsStore.getState().getActiveVersion("store-1")?.id).toBe(remaining[0].id);
  });
});
