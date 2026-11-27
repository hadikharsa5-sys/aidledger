import { describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/client";
import { authorize, can, PERMISSIONS, type Permission } from "@/lib/permissions";

// S4: each role can do only what the permission table allows.
// Written out by hand from the table, so a change to lib/permissions.ts has to
// be made here too, on purpose.
const Y = true;
const N = false;
const TABLE: Record<Permission, [admin: boolean, manager: boolean, coordinator: boolean, volunteer: boolean]> = {
  "user.manage": [Y, N, N, N],
  "household.register": [Y, Y, Y, Y],
  "household.edit": [Y, Y, Y, N],
  "household.viewContact": [Y, Y, Y, N],
  "household.viewFlags": [Y, Y, Y, N],
  "duplicate.review": [Y, Y, Y, N],
  "round.manage": [Y, N, Y, N],
  "round.viewExpected": [Y, Y, Y, N],
  "pickup.record": [Y, Y, Y, Y],
  "pickup.void": [Y, N, Y, N],
  "report.view": [Y, Y, Y, N],
  "audit.view": [Y, Y, Y, N],
};
const ROLES: Role[] = ["ADMIN", "MANAGER", "COORDINATOR", "VOLUNTEER"];

const cases = Object.entries(TABLE).flatMap(([permission, allowed]) =>
  ROLES.map((role, i) => ({ permission: permission as Permission, role, allowed: allowed[i] }))
);

describe("permission table", () => {
  it("covers every permission", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(TABLE).sort());
  });

  it.each(cases)("$role $permission: $allowed", ({ role, permission, allowed }) => {
    expect(can(role, permission)).toBe(allowed);
    expect(authorize({ role }, permission)).toEqual(allowed ? null : { status: 403, error: "forbidden" });
  });

  it("refuses everything without a logged-in user", () => {
    for (const permission of Object.keys(TABLE) as Permission[]) {
      expect(authorize(null, permission)).toEqual({ status: 403, error: "forbidden" });
      expect(authorize(undefined, permission)).toEqual({ status: 403, error: "forbidden" });
    }
  });

  it("volunteers can't edit households, merge, or void pickups", () => {
    expect(can("VOLUNTEER", "household.edit")).toBe(false);
    expect(can("VOLUNTEER", "duplicate.review")).toBe(false);
    expect(can("VOLUNTEER", "pickup.void")).toBe(false);
  });
});
