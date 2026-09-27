import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMachinesStore } from "./useMachinesStore";
import type { Brand, MachineGroup, Store } from "@/lib/control-center/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const brand: Brand = { id: "brand-1", name: "Akade", description: "", color: "#38bdf8" };
const store: Store = { id: "store-1", name: "Store 1", address: "", brandId: "brand-1", activeLayoutVersionId: null };
const group: MachineGroup = { id: "group-1", name: "Arcade", storeId: "store-1" };

describe("useMachinesStore", () => {
  beforeEach(() => {
    useMachinesStore.setState({
      brands: [brand],
      stores: [store],
      groups: [group],
      machines: [],
      machinesById: {},
      events: [],
      maintenanceRecords: [],
      activeStoreId: "store-1",
      hydrated: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removeBrand surfaces a server-side dependent-guard failure without mutating local state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Brand still has stores assigned to it" }, 409))
    );

    const ok = await useMachinesStore.getState().removeBrand("brand-1");

    expect(ok).toBe(false);
    expect(useMachinesStore.getState().brands).toHaveLength(1);
  });

  it("addMachine merges the server-assigned id into local state on success", async () => {
    const created = {
      id: "server-assigned-id",
      name: "Claw Machine",
      deviceId: "DEV-1",
      storeId: "store-1",
      groupId: "group-1",
      status: "online",
      current: 3,
      door: "closed",
      doorOpenSince: null,
      heartbeatAt: Date.now(),
      rssi: -50,
      firmware: "v2.5.0",
      restartCount: 0,
      lastUpdate: Date.now(),
      currentHistory: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ machine: created }))
    );

    const id = await useMachinesStore.getState().addMachine({
      name: "Claw Machine",
      deviceId: "DEV-1",
      storeId: "store-1",
      groupId: "group-1",
      status: "online",
    });

    expect(id).toBe("server-assigned-id");
    expect(useMachinesStore.getState().machines).toHaveLength(1);
    expect(useMachinesStore.getState().getMachine("server-assigned-id")).toEqual(created);
  });

  it("removeMachine returns false and keeps local state when the request fails", async () => {
    useMachinesStore.setState({
      machines: [
        {
          id: "m1",
          name: "M1",
          deviceId: "DEV-1",
          storeId: "store-1",
          groupId: "group-1",
          status: "online",
          current: 3,
          door: "closed",
          doorOpenSince: null,
          heartbeatAt: Date.now(),
          rssi: -50,
          firmware: "v2.5.0",
          restartCount: 0,
          lastUpdate: Date.now(),
          currentHistory: [],
        },
      ],
      machinesById: {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Request failed" }, 500))
    );

    const ok = await useMachinesStore.getState().removeMachine("m1");

    expect(ok).toBe(false);
    expect(useMachinesStore.getState().machines).toHaveLength(1);
  });
});

/** Answers each hydrate endpoint with its expected envelope. */
function hydrateFetch(overrides: Record<string, () => Response> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [fragment, respond] of Object.entries(overrides)) {
      if (url.includes(fragment)) return respond();
    }
    if (url.includes("/brands")) return jsonResponse({ brands: [brand] });
    if (url.includes("/stores")) return jsonResponse({ stores: [store] });
    if (url.includes("/groups")) return jsonResponse({ groups: [group] });
    if (url.includes("/machines")) return jsonResponse({ machines: [] });
    if (url.includes("/events")) return jsonResponse({ events: [], nextBefore: null });
    if (url.includes("/maintenance-records")) return jsonResponse({ records: [] });
    throw new Error(`unexpected request: ${url}`);
  });
}

describe("useMachinesStore.hydrate", () => {
  beforeEach(() => {
    useMachinesStore.setState({
      brands: [],
      stores: [],
      groups: [],
      machines: [],
      machinesById: {},
      events: [],
      maintenanceRecords: [],
      activeStoreId: "",
      hydrated: false,
      hydrateError: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for a bounded window of events rather than the whole table", async () => {
    const fetchMock = hydrateFetch();
    vi.stubGlobal("fetch", fetchMock);

    await useMachinesStore.getState().hydrate();

    const eventsUrl = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/events"));
    expect(eventsUrl).toMatch(/limit=\d+/);
  });

  it("shares one fan-out between overlapping callers", async () => {
    const fetchMock = hydrateFetch();
    vi.stubGlobal("fetch", fetchMock);

    // A remount (or React's dev double-effect) calls hydrate twice before the
    // first one has flipped `hydrated`.
    await Promise.all([useMachinesStore.getState().hydrate(), useMachinesStore.getState().hydrate()]);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(useMachinesStore.getState().hydrated).toBe(true);
  });

  it("records an error and stays un-hydrated when one endpoint fails", async () => {
    vi.stubGlobal("fetch", hydrateFetch({ "/machines": () => jsonResponse({ error: "boom" }, 500) }));

    await useMachinesStore.getState().hydrate();

    // Marking hydrated here would render an empty dashboard that looks like a
    // healthy deployment with no devices.
    expect(useMachinesStore.getState().hydrated).toBe(false);
    expect(useMachinesStore.getState().hydrateError).toBe(true);
    expect(useMachinesStore.getState().brands).toHaveLength(0);
  });

  it("can be retried after a failure", async () => {
    vi.stubGlobal("fetch", hydrateFetch({ "/machines": () => jsonResponse({ error: "boom" }, 500) }));
    await useMachinesStore.getState().hydrate();

    vi.stubGlobal("fetch", hydrateFetch());
    await useMachinesStore.getState().hydrate();

    expect(useMachinesStore.getState().hydrated).toBe(true);
    expect(useMachinesStore.getState().hydrateError).toBe(false);
    expect(useMachinesStore.getState().activeStoreId).toBe("store-1");
  });
});

describe("useMachinesStore.persistEvents", () => {
  const draft = {
    id: "local-1",
    machineId: "m1",
    storeId: "store-1",
    type: "high_current",
    message: "high",
    severity: "warning" as const,
    timestamp: 1000,
  };

  beforeEach(() => {
    useMachinesStore.setState({ events: [draft], hydrated: true, hydrateError: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts one batch and adopts the server ids", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse({ events: [{ ...draft, id: "server-1" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await useMachinesStore.getState().persistEvents([draft]);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/events/batch");
    // Keeping the local id would make the same event appear twice after a
    // refresh, under two different keys.
    expect(useMachinesStore.getState().events[0].id).toBe("server-1");
  });

  it("keeps the local event when the write fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "boom" }, 500))
    );

    await useMachinesStore.getState().persistEvents([draft]);

    expect(useMachinesStore.getState().events[0].id).toBe("local-1");
  });
});
