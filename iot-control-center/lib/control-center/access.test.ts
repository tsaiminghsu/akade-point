import { describe, expect, it } from "vitest";

import { allows, capabilities, effectiveRole, isRole, MIN_ROLE, ROLES } from "./access";

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
