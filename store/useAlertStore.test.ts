import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAlertStore } from "./useAlertStore";
import type { Alert } from "@/lib/control-center/types";

function alert(overrides: Partial<Alert> = {}): Alert {
  const now = Date.now();
  return {
    id: `alert-${Math.random().toString(36).slice(2)}`,
    machineId: "m1",
    storeId: "store-1",
    type: "high_current",
    message: "Machine over threshold",
    severity: "critical",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("useAlertStore", () => {
  beforeEach(() => {
    useAlertStore.setState({ alerts: [] });
  });

  it("caps the alert list at 500 entries, keeping the newest first", () => {
    const first = Array.from({ length: 300 }, () => alert());
    useAlertStore.getState().pushAlerts(first, { silent: true });
    expect(useAlertStore.getState().alerts).toHaveLength(300);

    const second = Array.from({ length: 300 }, () => alert());
    useAlertStore.getState().pushAlerts(second, { silent: true });
    const alerts = useAlertStore.getState().alerts;
    expect(alerts).toHaveLength(500);
    // Newest push is kept in front; the oldest 100 from the first batch are dropped.
    expect(alerts.slice(0, 300)).toEqual(second);
  });

  it("is a no-op when pushing an empty batch", () => {
    useAlertStore.getState().pushAlerts([alert()], { silent: true });
    const before = useAlertStore.getState().alerts;
    useAlertStore.getState().pushAlerts([], { silent: true });
    expect(useAlertStore.getState().alerts).toBe(before);
  });

  it("acknowledge/resolve/ignore transition an alert's status", () => {
    const a = alert({ id: "a1", status: "active" });
    useAlertStore.setState({ alerts: [a] });

    useAlertStore.getState().acknowledge("a1");
    expect(useAlertStore.getState().alerts[0].status).toBe("acknowledged");

    useAlertStore.getState().resolve("a1");
    expect(useAlertStore.getState().alerts[0].status).toBe("resolved");

    useAlertStore.setState({ alerts: [alert({ id: "a2", status: "active" })] });
    useAlertStore.getState().ignore("a2");
    expect(useAlertStore.getState().alerts[0].status).toBe("ignored");
  });

  it("unreadCount counts only active alerts", () => {
    useAlertStore.setState({
      alerts: [
        alert({ id: "a1", status: "active" }),
        alert({ id: "a2", status: "active" }),
        alert({ id: "a3", status: "resolved" }),
        alert({ id: "a4", status: "acknowledged" }),
      ],
    });
    expect(useAlertStore.getState().unreadCount()).toBe(2);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("useAlertStore.ingestAlerts", () => {
  beforeEach(() => {
    useAlertStore.setState({ alerts: [], hydrated: true, hydrateError: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts one batch instead of one request per alert", async () => {
    const drafts = [alert({ id: "draft-1" }), alert({ id: "draft-2" })];
    const urls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse({ alerts: drafts.map((a, i) => ({ ...a, id: `server-${i + 1}` })) });
    });
    vi.stubGlobal("fetch", fetchMock);

    await useAlertStore.getState().ingestAlerts(drafts);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/alerts/batch");
    expect(useAlertStore.getState().alerts.map((a) => a.id)).toEqual(["server-1", "server-2"]);
  });

  it("still shows the alert locally when the write fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "boom" }, 500))
    );

    await useAlertStore.getState().ingestAlerts([alert({ id: "draft-1" })]);

    // An operator needs to see the alert even if it isn't durable yet.
    expect(useAlertStore.getState().alerts.map((a) => a.id)).toEqual(["draft-1"]);
  });
});

describe("useAlertStore.hydrate", () => {
  beforeEach(() => {
    useAlertStore.setState({ alerts: [], hydrated: false, hydrateError: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not report all-clear when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "boom" }, 500))
    );

    await useAlertStore.getState().hydrate();

    expect(useAlertStore.getState().hydrated).toBe(false);
    expect(useAlertStore.getState().hydrateError).toBe(true);
  });

  it("shares one request between overlapping callers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ alerts: [], nextBefore: null }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([useAlertStore.getState().hydrate(), useAlertStore.getState().hydrate()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAlertStore.getState().hydrated).toBe(true);
  });
});
