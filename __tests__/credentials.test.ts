// @vitest-environment node
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db";
import { verifyCredentials } from "@/lib/credentials";
import { makeOrganisation } from "./helpers/factory";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("verifyCredentials", () => {
  let db: PrismaClient;
  let orgId: string;
  let email: string;

  beforeAll(async () => {
    db = createPrismaClient(TEST_DB);
    orgId = (await makeOrganisation(db)).id;
    email = `coord-${Date.now()}@test.aidledger`;
    await db.user.create({
      data: { organisationId: orgId, name: "Rana", email, role: "COORDINATOR", passwordHash: await bcrypt.hash("right-password", 10) },
    });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("logs in with the right password and returns role and organisation", async () => {
    expect(await verifyCredentials(db, email, "right-password")).toMatchObject({
      name: "Rana",
      email,
      role: "COORDINATOR",
      organisationId: orgId,
    });
  });

  it("stores passwords hashed, never as typed", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toBe("right-password");
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("ignores case and spaces around the email", async () => {
    expect(await verifyCredentials(db, `  ${email.toUpperCase()} `, "right-password")).not.toBeNull();
  });

  it("refuses a wrong password", async () => {
    expect(await verifyCredentials(db, email, "wrong-password")).toBeNull();
  });

  it("refuses an unknown email", async () => {
    expect(await verifyCredentials(db, "nobody@test.aidledger", "right-password")).toBeNull();
  });

  it("refuses missing or non-text fields", async () => {
    expect(await verifyCredentials(db, "", "right-password")).toBeNull();
    expect(await verifyCredentials(db, email, "")).toBeNull();
    expect(await verifyCredentials(db, undefined, undefined)).toBeNull();
  });

  it("refuses a deactivated user", async () => {
    const off = `off-${Date.now()}@test.aidledger`;
    await db.user.create({
      data: { organisationId: orgId, name: "Off", email: off, active: false, passwordHash: await bcrypt.hash("pw", 10) },
    });
    expect(await verifyCredentials(db, off, "pw")).toBeNull();
  });
});
