import type { Role } from "@/generated/prisma/client";

// Server-side role checks (HK-13), from the permission table in MVP Plan
// section 3 as updated after discovery: only managers and coordinators edit
// or merge households; volunteers can register but not edit after saving.
// Every server action and route handler checks here before doing anything.

export const PERMISSIONS = {
  "user.manage": ["ADMIN"],
  "household.register": ["ADMIN", "MANAGER", "COORDINATOR", "VOLUNTEER"],
  "household.edit": ["ADMIN", "MANAGER", "COORDINATOR"],
  "household.viewContact": ["ADMIN", "MANAGER", "COORDINATOR"], // volunteers see name, area, code and pickup status only (HK-16)
  "household.viewFlags": ["ADMIN", "MANAGER", "COORDINATOR"],
  "duplicate.review": ["ADMIN", "MANAGER", "COORDINATOR"], // merge or dismiss
  "round.manage": ["ADMIN", "COORDINATOR"], // create, edit, open, close
  "round.viewExpected": ["ADMIN", "MANAGER", "COORDINATOR"],
  "pickup.record": ["ADMIN", "MANAGER", "COORDINATOR", "VOLUNTEER"],
  "pickup.void": ["ADMIN", "COORDINATOR"],
  "report.view": ["ADMIN", "MANAGER", "COORDINATOR"], // includes exports
  "audit.view": ["ADMIN", "MANAGER", "COORDINATOR"], // read-only for everyone; nobody edits audit rows
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export type Forbidden = { status: 403; error: "forbidden" };

/**
 * Returns a 403 result when the actor may not do this, or null when they may.
 *
 *   const denied = authorize(actor, "round.manage");
 *   if (denied) return denied;
 */
export function authorize(actor: { role: Role } | null | undefined, permission: Permission): Forbidden | null {
  return actor && can(actor.role, permission) ? null : { status: 403, error: "forbidden" };
}
