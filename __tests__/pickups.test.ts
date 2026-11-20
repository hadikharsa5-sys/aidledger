// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db";
import { checkEligibility, recordPickup, voidPickup, type Actor } from "@/lib/pickups";
import { makeArea, makeHousehold, makeRound, makeUser } from "./helpers/factory";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe("checkEligibility", () => {
  const hh = { areaId: "a1", flags: ["ELDERLY" as const], size: 3 };
  it("passes with no rules", () => expect(checkEligibility({}, hh)).toBeNull());
  it("checks area", () => expect(checkEligibility({ areaIds: ["a2"] }, hh)).toBe("area"));
  it("checks flags (any of)", () => {
    expect(checkEligibility({ flags: ["DISABILITY"] }, hh)).toBe("flags");
    expect(checkEligibility({ flags: ["DISABILITY", "ELDERLY"] }, hh)).toBeNull();
  });
  it("checks household size", () => expect(checkEligibility({ minHouseholdSize: 4 }, hh)).toBe("household_size"));
});

describe.skipIf(!TEST_DB)("pickups against Postgres", () => {
  let db: PrismaClient;
  let volunteer: Actor;
  let coordinator: Actor;
  let areaId: string;

  beforeAll(async () => {
    // Enough connections that 20 parallel pickups really run at the same time.
    db = createPrismaClient(TEST_DB, { maxConnections: 30 });
    volunteer = { userId: (await makeUser(db, "VOLUNTEER")).id, role: "VOLUNTEER" };
    coordinator = { userId: (await makeUser(db, "COORDINATOR")).id, role: "COORDINATOR" };
    areaId = (await makeArea(db)).id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  const household = (opts: Partial<Parameters<typeof makeHousehold>[1]> = {}) =>
    makeHousehold(db, { areaId, registeredById: volunteer.userId, ...opts });

  describe("recordPickup (MR-12)", () => {
    it("records the pickup, the items and one audit row", async () => {
      const round = await makeRound(db, { items: [{ name: "Food parcel", qty: 1 }, { name: "Blanket", qty: 2 }] });
      const hh = await household();
      const res = await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode });
      expect(res.status).toBe(201);
      if (res.status !== 201) return;

      const pickup = await db.distribution.findUniqueOrThrow({ where: { id: res.pickupId } });
      expect(pickup.itemsGiven).toEqual([
        expect.objectContaining({ name: "Food parcel", quantity: 1 }),
        expect.objectContaining({ name: "Blanket", quantity: 2 }),
      ]);
      expect(await db.auditLog.count({ where: { entityId: res.pickupId, action: "PICKUP_RECORDED" } })).toBe(1);
    });

    it("returns 409 with time and volunteer on a second pickup, and writes no extra audit row", async () => {
      const round = await makeRound(db);
      const hh = await household();
      await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode, point: "Table 2" });
      const second = await recordPickup(db, coordinator, { roundId: round.id, cardCode: hh.cardCode });

      expect(second.status).toBe(409);
      if (second.status !== 409) return;
      expect(second.existing.at).toBeInstanceOf(Date);
      expect(second.existing.volunteer).toMatch(/^volunteer-/);
      expect(second.existing.point).toBe("Table 2");
      expect(await db.distribution.count({ where: { roundId: round.id, householdId: hh.id } })).toBe(1);
    });

    it("rejects pickups when the round is Draft or Closed", async () => {
      for (const status of ["DRAFT", "CLOSED"] as const) {
        const round = await makeRound(db, { status });
        const hh = await household();
        expect(await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode })).toEqual({
          status: 422,
          error: "round_not_open",
        });
      }
    });

    it("applies the round's eligibility rules", async () => {
      const otherArea = await makeArea(db);
      const round = await makeRound(db, { rules: { areaIds: [otherArea.id] } });
      const hh = await household();
      expect(await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode })).toEqual({
        status: 422,
        error: "not_eligible",
        reason: "area",
      });

      const bigRound = await makeRound(db, { rules: { minHouseholdSize: 4 } });
      const small = await household({ members: 2 });
      const big = await household({ members: 5 });
      expect((await recordPickup(db, volunteer, { roundId: bigRound.id, cardCode: small.cardCode })).status).toBe(422);
      expect((await recordPickup(db, volunteer, { roundId: bigRound.id, cardCode: big.cardCode })).status).toBe(201);
    });

    it("rejects merged households and unknown cards", async () => {
      const round = await makeRound(db);
      const merged = await household({ status: "MERGED" });
      expect((await recordPickup(db, volunteer, { roundId: round.id, cardCode: merged.cardCode })).status).toBe(422);
      expect((await recordPickup(db, volunteer, { roundId: round.id, cardCode: "AL-NOPE" })).status).toBe(404);
    });

    it("saves the proxy name (MR-14) and shows it on a second scan", async () => {
      const round = await makeRound(db);
      const hh = await household();
      await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode, collectedBy: "Neighbour, Rana" });
      const again = await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode });
      expect(again.status === 409 && again.existing.collectedBy).toBe("Neighbour, Rana");
    });
  });

  describe("voidPickup (MR-16)", () => {
    it("lets a coordinator void with a reason; the household can then collect again", async () => {
      const round = await makeRound(db);
      const hh = await household();
      const first = await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode });
      if (first.status !== 201) throw new Error("setup failed");

      expect(await voidPickup(db, coordinator, { pickupId: first.pickupId, reason: "Scanned the wrong card" })).toEqual({
        status: 200,
      });
      expect((await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode })).status).toBe(201);
      expect(await db.auditLog.count({ where: { entityId: first.pickupId, action: "PICKUP_VOIDED" } })).toBe(1);
    });

    it("requires a reason", async () => {
      const round = await makeRound(db);
      const hh = await household();
      const first = await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode });
      if (first.status !== 201) throw new Error("setup failed");
      expect((await voidPickup(db, coordinator, { pickupId: first.pickupId, reason: "   " })).status).toBe(400);
    });

    it("does not let volunteers void", async () => {
      const round = await makeRound(db);
      const hh = await household();
      const first = await recordPickup(db, volunteer, { roundId: round.id, cardCode: hh.cardCode });
      if (first.status !== 201) throw new Error("setup failed");
      expect((await voidPickup(db, volunteer, { pickupId: first.pickupId, reason: "oops" })).status).toBe(403);
    });
  });

  describe("S2 parallel pickup test (MR-15)", () => {
    it(
      "20 volunteers scan the same card at once: exactly 1 succeeds, 19 get 'already collected', 100 runs",
      async () => {
        const RUNS = 100;
        const PARALLEL = 20;
        const volunteers = await Promise.all(
          Array.from({ length: PARALLEL }, () => makeUser(db, "VOLUNTEER"))
        );
        const round = await makeRound(db);
        const failures: unknown[] = [];

        for (let run = 1; run <= RUNS; run++) {
          const hh = await household();
          const results = await Promise.all(
            volunteers.map((v) =>
              recordPickup(db, { userId: v.id, role: "VOLUNTEER" }, { roundId: round.id, cardCode: hh.cardCode })
            )
          );
          const ok = results.filter((r) => r.status === 201).length;
          const conflicts = results.filter((r) => r.status === 409 && r.existing.volunteer.length > 0).length;
          const rows = await db.distribution.count({ where: { roundId: round.id, householdId: hh.id, voidedAt: null } });
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
