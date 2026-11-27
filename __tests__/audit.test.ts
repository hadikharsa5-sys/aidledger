// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db";
import { changeUserRole, writeAudit } from "@/lib/audit";
import { makeOrganisation, makeUser } from "./helpers/factory";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("audit log", () => {
  let db: PrismaClient;
  let orgId: string;
  let admin: { userId: string; role: "ADMIN"; organisationId: string };

  beforeAll(async () => {
    db = createPrismaClient(TEST_DB);
    orgId = (await makeOrganisation(db)).id;
    admin = { userId: (await makeUser(db, orgId, "ADMIN")).id, role: "ADMIN", organisationId: orgId };
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  const entries = (entityId: string) => db.auditLog.findMany({ where: { entityId } });

  it("writes who did what, with before and after", async () => {
    const user = await makeUser(db, orgId, "VOLUNTEER");
    await db.$transaction((tx) =>
      writeAudit(tx, admin, { action: "USER_CREATED", entity: "User", entityId: user.id, after: { role: "VOLUNTEER" } })
    );
    const [row] = await entries(user.id);
    expect(row).toMatchObject({ userId: admin.userId, action: "USER_CREATED", entity: "User", after: { role: "VOLUNTEER" } });
    expect(row.before).toBeNull();
  });

  it("rolls back with the action it records", async () => {
    const user = await makeUser(db, orgId, "VOLUNTEER");
    await expect(
      db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { role: "COORDINATOR" } });
        await writeAudit(tx, admin, { action: "ROLE_CHANGED", entity: "User", entityId: user.id, after: { role: "COORDINATOR" } });
        throw new Error("fails after both writes");
      })
    ).rejects.toThrow("fails after both writes");

    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("VOLUNTEER");
    expect(await entries(user.id)).toHaveLength(0);
  });

  it("rolls back the action when the audit row can't be written", async () => {
    const user = await makeUser(db, orgId, "VOLUNTEER");
    await expect(
      db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { role: "COORDINATOR" } });
        await writeAudit(tx, { userId: "no-such-user" }, { action: "ROLE_CHANGED", entity: "User", entityId: user.id });
      })
    ).rejects.toThrow();

    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("VOLUNTEER");
  });

  describe("changeUserRole", () => {
    it("changes the role and logs before and after", async () => {
      const user = await makeUser(db, orgId, "VOLUNTEER");
      expect(await changeUserRole(db, admin, { userId: user.id, role: "COORDINATOR" })).toEqual({ status: 200, role: "COORDINATOR" });

      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("COORDINATOR");
      const [row] = await entries(user.id);
      expect(row).toMatchObject({
        userId: admin.userId,
        action: "ROLE_CHANGED",
        before: { role: "VOLUNTEER" },
        after: { role: "COORDINATOR" },
      });
    });

    it("logs nothing when the role is unchanged", async () => {
      const user = await makeUser(db, orgId, "VOLUNTEER");
      expect(await changeUserRole(db, admin, { userId: user.id, role: "VOLUNTEER" })).toEqual({ status: 200, role: "VOLUNTEER" });
      expect(await entries(user.id)).toHaveLength(0);
    });

    it.each(["MANAGER", "COORDINATOR", "VOLUNTEER"] as const)("refuses a %s", async (role) => {
      const actor = { userId: (await makeUser(db, orgId, role)).id, role, organisationId: orgId };
      const user = await makeUser(db, orgId, "VOLUNTEER");
      expect(await changeUserRole(db, actor, { userId: user.id, role: "ADMIN" })).toEqual({ status: 403, error: "forbidden" });
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("VOLUNTEER");
    });

    it("can't reach a user of another organisation", async () => {
      const other = await makeUser(db, (await makeOrganisation(db)).id, "VOLUNTEER");
      expect(await changeUserRole(db, admin, { userId: other.id, role: "ADMIN" })).toEqual({ status: 404, error: "user_not_found" });
      expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).role).toBe("VOLUNTEER");
    });
  });
});
