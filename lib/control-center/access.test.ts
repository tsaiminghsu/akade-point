import { describe, expect, it } from "vitest";

import {
  allows,
  allowsAt,
  allowsSomewhere,
  canAssignStoreRole,
  capabilities,
  cleanStoreRoles,
  effectiveRole,
  hasAnyAccess,
  isRole,
  isStoreRole,
  MIN_ROLE,
  NO_GRANTS,
  roleAt,
  ROLES,
  storeFilter,
  storesAllowing,
  strongestRole,
} from "./access";

describe("roles", () => {
  it("each role includes the ones below it", () => {
    expect(allows("viewer", "read")).toBe(true);
    expect(allows("viewer", "vehicle.command")).toBe(false);
    expect(allows("operator", "vehicle.command")).toBe(true);
    expect(allows("operator", "store.manage")).toBe(false);
    expect(allows("store-admin", "store.manage")).toBe(true);
    expect(allows("store-admin", "token.manage")).toBe(false);
    for (const action of Object.keys(MIN_ROLE) as (keyof typeof MIN_ROLE)[]) expect(allows("system-admin", action)).toBe(true);
    expect(allows(null, "read")).toBe(false);
  });

  it("follows the permissions.md matrix for the sensitive actions", () => {
    expect(MIN_ROLE["token.manage"]).toBe("system-admin");
    expect(MIN_ROLE["users.manage"]).toBe("system-admin");
    expect(MIN_ROLE["vehicle.manage"]).toBe("system-admin");
    expect(MIN_ROLE["alert.handle"]).toBe("operator");
    // The in-browser simulator writes from every page, viewers included.
    expect(MIN_ROLE.simulate).toBe("viewer");
  });

  it("keeps existing admins working and locks out everyone else", () => {
    expect(effectiveRole(undefined, true)).toBe("system-admin");
    expect(effectiveRole("viewer", true)).toBe("viewer"); // an explicit role wins, even a lower one
    expect(effectiveRole(null, false)).toBeNull();
    expect(effectiveRole("root", false)).toBeNull();
    expect(isRole("operator")).toBe(true);
    expect(capabilities("operator")["vehicle.mission"]).toBe(true);
    expect(capabilities(null).read).toBe(false);
    expect(ROLES).toHaveLength(4);
  });
});

describe("per-store roles", () => {
  const g = { role: "viewer" as const, stores: { s1: "store-admin" as const, s2: "operator" as const } };
  const scoped = { role: null, stores: { s1: "operator" as const } };

  it("takes the higher of the global and the store role at a store", () => {
    expect(roleAt(g, "s1")).toBe("store-admin");
    expect(roleAt(g, "s3")).toBe("viewer");
    expect(roleAt(g, null)).toBe("viewer");
    expect(roleAt({ role: "system-admin", stores: { s1: "viewer" } }, "s1")).toBe("system-admin");
    expect(allowsAt(g, "store.manage", "s1")).toBe(true);
    expect(allowsAt(g, "store.manage", "s2")).toBe(false);
    expect(allowsAt(g, "store.manage")).toBe(false);
  });

  it("confines a store-only user to their stores", () => {
    expect(allowsAt(scoped, "read", "s1")).toBe(true);
    expect(allowsAt(scoped, "read", "s2")).toBe(false);
    // things of no store (unassigned vehicles, brands' admin) need a global role
    expect(allowsAt(scoped, "read", null)).toBe(false);
    expect(allowsSomewhere(scoped, "vehicle.command")).toBe(true);
    expect(allowsSomewhere(scoped, "store.manage")).toBe(false);
    expect(storesAllowing(scoped, "read")).toEqual(["s1"]);
    expect(storesAllowing(g, "read")).toBe("all");
    expect(storesAllowing(g, "store.manage")).toEqual(["s1"]);
    const f = storeFilter(scoped, "read");
    expect([f("s1"), f("s2"), f(null), f(undefined)]).toEqual([true, false, false, false]);
    expect(storeFilter(g, "read")(null)).toBe(true);
  });

  it("never grants the global-only actions through a store", () => {
    const top = { role: null, stores: { s1: "store-admin" as const } };
    for (const a of ["users.manage", "token.manage", "vehicle.manage"] as const) expect(allowsSomewhere(top, a)).toBe(false);
    expect(cleanStoreRoles({ s1: "system-admin", s2: "operator", "": "viewer", s3: 5 })).toEqual({ s2: "operator" });
    expect(cleanStoreRoles(null)).toEqual({});
    expect(isStoreRole("system-admin")).toBe(false);
  });

  it("knows who has any access and their strongest role", () => {
    expect(hasAnyAccess(NO_GRANTS)).toBe(false);
    expect(hasAnyAccess(scoped)).toBe(true);
    expect(strongestRole(g)).toBe("store-admin");
    expect(strongestRole(NO_GRANTS)).toBeNull();
  });
});

describe("store admins assigning roles at their store", () => {
  const admin = { role: null, stores: { s1: "store-admin" as const } };
  const none = { role: null, stores: {} };

  it("lets a store-admin grant, change and remove roles below them at their store", () => {
    expect(canAssignStoreRole(admin, none, "s1", "operator")).toBe(true);
    expect(canAssignStoreRole(admin, { role: null, stores: { s1: "operator" as const } }, "s1", "viewer")).toBe(true);
    expect(canAssignStoreRole(admin, { role: null, stores: { s1: "viewer" as const } }, "s1", null)).toBe(true);
    // up to their own level
    expect(canAssignStoreRole(admin, none, "s1", "store-admin")).toBe(true);
  });

  it("keeps them out of other stores and away from peers and superiors", () => {
    expect(canAssignStoreRole(admin, none, "s2", "viewer")).toBe(false);
    expect(canAssignStoreRole(admin, { role: null, stores: { s1: "store-admin" as const } }, "s1", "viewer")).toBe(false);
    expect(canAssignStoreRole(admin, { role: "store-admin", stores: {} }, "s1", null)).toBe(false);
    expect(canAssignStoreRole(admin, { role: "system-admin", stores: {} }, "s1", "viewer")).toBe(false);
    expect(canAssignStoreRole({ role: null, stores: { s1: "operator" as const } }, none, "s1", "viewer")).toBe(false);
  });

  it("lets a global store-admin act at every store, and system-admins over store-admins", () => {
    const chain = { role: "store-admin" as const, stores: {} };
    expect(canAssignStoreRole(chain, none, "s9", "operator")).toBe(true);
    expect(canAssignStoreRole(chain, admin, "s1", null)).toBe(false); // a peer
    expect(canAssignStoreRole({ role: "system-admin", stores: {} }, admin, "s1", null)).toBe(true);
  });
});
