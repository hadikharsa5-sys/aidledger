// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db";
import { checkEligibility, recordPickup, voidPickup, type Actor } from "@/lib/pickups";
import { makeHousehold, makeOrganisation, makeRound, makeUser } from "./helpers/factory";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe("checkEligibility", () => {
  const hh = { area: "Tripoli", flags: ["ELDERLY" as const], size: 3 };
  it("passes with no rules", () => expect(checkEligibility({}, hh)).toBeNull());
  it("checks area", () => expect(checkEligibility({ areas: ["Mina"] }, hh)).toBe("area"));
  it("checks flags (any of)", () => {
    expect(checkEligibility({ flags: ["DISABILITY"] }, hh)).toBe("flags");
    expect(checkEligibility({ flags: ["DISABILITY", "ELDERLY"] }, hh)).toBeNull();
  });
  it("checks household size", () => expect(checkEligibility({ minHouseholdSize: 4 }, hh)).toBe("household_size"));
});

describe.skipIf(!TEST_DB)("against Postgres", () => {
  let db: PrismaClient;
  let orgId: string;
  let volunteer: Actor;
  let coordinator: Actor;

  beforeAll(async () => {
    // Enough connections that 20 parallel pickups really run at the same time.
    db = createPrismaClient(TEST_DB, { maxConnections: 30 });
    orgId = (await makeOrganisation(db)).id;
    volunteer = { userId: (await makeUser(db, orgId, "VOLUNTEER")).id, role: "VOLUNTEER" };
    coordinator = { userId: (await makeUser(db, orgId, "COORDINATOR")).id, role: "COORDINATOR" };
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  const household = (opts: Partial<Parameters<typeof makeHousehold>[1]> = {}) =>
    makeHousehold(db, { organisationId: orgId, registeredById: volunteer.userId, ...opts });
  const round = (opts: Partial<Parameters<typeof makeRound>[1]> = {}) =>
    makeRound(db, { organisationId: orgId, createdById: coordinator.userId, ...opts });

  describe("schema (HK-11)", () => {
    it("has the partial unique index on Pickup(roundId, householdId) WHERE voidedAt IS NULL", async () => {
      const rows = await db.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes WHERE indexname = 'Pickup_one_per_household_per_round'`;
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toMatch(/UNIQUE INDEX/);
      expect(rows[0].indexdef).toMatch(/\("roundId", "householdId"\)/);
      expect(rows[0].indexdef).toMatch(/WHERE \("voidedAt" IS NULL\)/);
    });

    it("has pg_trgm enabled for fuzzy name matching", async () => {
      const [{ score }] = await db.$queryRaw<{ score: number }[]>`SELECT similarity('mohammad khalil', 'mohamad khalil') AS score`;
      expect(score).toBeGreaterThan(0.6);
    });

    it("stores consent as its own record linked to the household", async () => {
      const hh = await household();
      const consents = await db.consent.findMany({ where: { householdId: hh.id } });
      expect(consents).toHaveLength(1);
      expect(consents[0].recordedById).toBe(volunteer.userId);
    });
  });

  describe("recordPickup (MR-12)", () => {
    it("records the pickup, the items and one audit row", async () => {
      const r = await round({ items: [{ name: "Food parcel", qty: 1 }, { name: "Blanket", qty: 2 }] });
      const hh = await household();
      const res = await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code });
      expect(res.status).toBe(201);
      if (res.status !== 201) return;

      const pickup = await db.pickup.findUniqueOrThrow({ where: { id: res.pickupId } });
      expect(pickup.itemsGiven).toEqual([
        expect.objectContaining({ name: "Food parcel", quantity: 1 }),
        expect.objectContaining({ name: "Blanket", quantity: 2 }),
      ]);
      expect(await db.auditLog.count({ where: { entityId: res.pickupId, action: "PICKUP_RECORDED" } })).toBe(1);
    });

    it("returns 409 with time, volunteer and point on a second pickup", async () => {
      const r = await round();
      const hh = await household();
      await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code, point: "Table 2" });
      const second = await recordPickup(db, coordinator, { roundId: r.id, householdCode: hh.code });

      expect(second.status).toBe(409);
      if (second.status !== 409) return;
      expect(second.existing.at).toBeInstanceOf(Date);
      expect(second.existing.volunteer).toMatch(/^volunteer-/);
      expect(second.existing.point).toBe("Table 2");
      expect(await db.pickup.count({ where: { roundId: r.id, householdId: hh.id } })).toBe(1);
    });

    it("rejects pickups when the round is Draft or Closed", async () => {
      for (const status of ["DRAFT", "CLOSED"] as const) {
        const r = await round({ status });
        const hh = await household();
        expect(await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code })).toEqual({
          status: 422,
          error: "round_not_open",
        });
      }
    });

    it("applies the round's eligibility rules", async () => {
      const mina = await round({ eligibility: { areas: ["Mina"] } });
      const hh = await household({ area: "Tripoli" });
      expect(await recordPickup(db, volunteer, { roundId: mina.id, householdCode: hh.code })).toEqual({
        status: 422,
        error: "not_eligible",
        reason: "area",
      });

      const bigFamilies = await round({ eligibility: { minHouseholdSize: 4 } });
      const small = await household({ members: 2 });
      const big = await household({ members: 5 });
      expect((await recordPickup(db, volunteer, { roundId: bigFamilies.id, householdCode: small.code })).status).toBe(422);
      expect((await recordPickup(db, volunteer, { roundId: bigFamilies.id, householdCode: big.code })).status).toBe(201);
    });

    it("rejects merged households, unknown codes and households from another organisation", async () => {
      const r = await round();
      const merged = await household({ status: "MERGED" });
      expect((await recordPickup(db, volunteer, { roundId: r.id, householdCode: merged.code })).status).toBe(422);
      expect((await recordPickup(db, volunteer, { roundId: r.id, householdCode: "AL-NOPE" })).status).toBe(404);

      const otherOrg = await makeOrganisation(db);
      const otherUser = await makeUser(db, otherOrg.id, "VOLUNTEER");
      const foreign = await makeHousehold(db, { organisationId: otherOrg.id, registeredById: otherUser.id });
      expect((await recordPickup(db, volunteer, { roundId: r.id, householdCode: foreign.code })).status).toBe(404);
    });

    it("saves a proxy pickup (MR-14) and requires name, relation and ID or note", async () => {
      const r = await round();
      const hh = await household();
      expect(
        (await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code, proxy: { name: "Rana", relation: "", idOrNote: "x" } }))
          .status
      ).toBe(400);

      const proxy = { name: "Rana Haddad", relation: "Neighbour", idOrNote: "ID 1234 shown" };
      expect((await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code, proxy })).status).toBe(201);
      const again = await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code });
      expect(again.status === 409 && again.existing.proxy).toEqual(proxy);
    });
  });

  describe("voidPickup (MR-16)", () => {
    it("lets a coordinator void with a reason; the household can then collect again", async () => {
      const r = await round();
      const hh = await household();
      const first = await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code });
      if (first.status !== 201) throw new Error("setup failed");

      expect(await voidPickup(db, coordinator, { pickupId: first.pickupId, reason: "Scanned the wrong card" })).toEqual({
        status: 200,
      });
      expect((await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code })).status).toBe(201);
      expect(await db.auditLog.count({ where: { entityId: first.pickupId, action: "PICKUP_VOIDED" } })).toBe(1);
    });

    it("requires a reason", async () => {
      const r = await round();
      const hh = await household();
      const first = await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code });
      if (first.status !== 201) throw new Error("setup failed");
      expect((await voidPickup(db, coordinator, { pickupId: first.pickupId, reason: "   " })).status).toBe(400);
    });

    it("does not let volunteers void", async () => {
      const r = await round();
      const hh = await household();
      const first = await recordPickup(db, volunteer, { roundId: r.id, householdCode: hh.code });
      if (first.status !== 201) throw new Error("setup failed");
      expect((await voidPickup(db, volunteer, { pickupId: first.pickupId, reason: "oops" })).status).toBe(403);
    });
  });

  describe("S2 parallel pickup test (online part of MH-19)", () => {
    it(
      "20 volunteers record the same household at once: exactly 1 succeeds, 19 get 'already collected', 100 runs",
      async () => {
        const RUNS = 100;
        const PARALLEL = 20;
        const volunteers = await Promise.all(Array.from({ length: PARALLEL }, () => makeUser(db, orgId, "VOLUNTEER")));
        const r = await round();
        const failures: unknown[] = [];

        for (let run = 1; run <= RUNS; run++) {
          const hh = await household();
          const results = await Promise.all(
            volunteers.map((v) => recordPickup(db, { userId: v.id, role: "VOLUNTEER" }, { roundId: r.id, householdCode: hh.code }))
          );
          const ok = results.filter((x) => x.status === 201).length;
          const conflicts = results.filter((x) => x.status === 409 && x.existing.volunteer.length > 0).length;
          const rows = await db.pickup.count({ where: { roundId: r.id, householdId: hh.id, voidedAt: null } });
          const audits = await db.auditLog.count({
            where: { action: "PICKUP_RECORDED", after: { path: ["householdId"], equals: hh.id } },
          });
          if (ok !== 1 || conflicts !== PARALLEL - 1 || rows !== 1 || audits !== 1) {
            failures.push({ run, ok, conflicts, rows, audits });
          }
        }

        expect(failures).toEqual([]);
      },
      180_000
    );
  });
});
