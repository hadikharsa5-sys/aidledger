// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db";
import { checkEligibility, parseEligibility, type Eligibility } from "@/lib/eligibility";
import type { Actor } from "@/lib/pickups";
import { changeRoundStatus, createRound, getExpectedList, updateRound, type RoundInput } from "@/lib/rounds";
import { generateHouseholds } from "../prisma/seed-data/households";
import { makeHousehold, makeOrganisation, makeUser } from "./helpers/factory";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe("parseEligibility", () => {
  it("accepts empty rules", () => expect(parseEligibility(undefined)).toEqual({ ok: true, rules: {} }));
  it("cleans areas and drops duplicates", () =>
    expect(parseEligibility({ areas: [" Tripoli ", "Tripoli", ""] })).toEqual({ ok: true, rules: { areas: ["Tripoli"] } }));
  it("rejects unknown flags", () => expect(parseEligibility({ flags: ["RICH"] }).ok).toBe(false));
  it("rejects a bad household size", () => {
    expect(parseEligibility({ minHouseholdSize: 0 }).ok).toBe(false);
    expect(parseEligibility({ minHouseholdSize: 2.5 }).ok).toBe(false);
  });
  it("treats a minimum size of 1 as no rule", () => expect(parseEligibility({ minHouseholdSize: 1 })).toEqual({ ok: true, rules: {} }));
  it("rejects unknown fields", () => expect(parseEligibility({ income: 3 }).ok).toBe(false));
});

describe.skipIf(!TEST_DB)("rounds against Postgres", () => {
  let db: PrismaClient;
  let orgId: string;
  let coordinator: Actor;
  let admin: Actor;
  let manager: Actor;
  let volunteer: Actor;

  const form = (over: Partial<RoundInput> = {}): RoundInput => ({
    name: "Winter kits, December",
    date: "2026-12-15",
    location: "Tabbaneh hall",
    items: [{ name: "Food parcel", quantityPerHousehold: 1 }],
    eligibility: {},
    ...over,
  });

  beforeAll(async () => {
    db = createPrismaClient(TEST_DB);
    orgId = (await makeOrganisation(db)).id;
    const actor = async (role: Actor["role"]): Promise<Actor> => ({
      userId: (await makeUser(db, orgId, role)).id,
      role,
      organisationId: orgId,
    });
    coordinator = await actor("COORDINATOR");
    admin = await actor("ADMIN");
    manager = await actor("MANAGER");
    volunteer = await actor("VOLUNTEER");
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  const create = async (over: Partial<RoundInput> = {}) => {
    const res = await createRound(db, coordinator, form(over));
    if (res.status !== 201) throw new Error("setup failed: " + JSON.stringify(res));
    return res.roundId;
  };

  describe("createRound (MR-10)", () => {
    it("creates a Draft round with its items and logs it", async () => {
      const id = await create({ items: [{ name: "Food parcel", quantityPerHousehold: 1 }, { name: "Blanket", quantityPerHousehold: 2 }] });
      const round = await db.round.findUniqueOrThrow({ where: { id }, include: { items: true } });
      expect(round.status).toBe("DRAFT");
      expect(round.organisationId).toBe(orgId);
      expect(round.items.map((i) => [i.name, i.quantityPerHousehold])).toEqual([
        ["Food parcel", 1],
        ["Blanket", 2],
      ]);
      expect(await db.auditLog.count({ where: { entityId: id, action: "ROUND_CREATED" } })).toBe(1);
    });

    it("lets admins create rounds too", async () => {
      expect((await createRound(db, admin, form())).status).toBe(201);
    });

    it("refuses volunteers and managers (server-checked)", async () => {
      expect(await createRound(db, volunteer, form())).toEqual({ status: 403, error: "forbidden" });
      expect(await createRound(db, manager, form())).toEqual({ status: 403, error: "forbidden" });
    });

    it("validates the form", async () => {
      expect((await createRound(db, coordinator, form({ name: "  " }))).status).toBe(400);
      expect((await createRound(db, coordinator, form({ date: "not a date" }))).status).toBe(400);
      expect((await createRound(db, coordinator, form({ items: [{ name: "Rice", quantityPerHousehold: 0 }] }))).status).toBe(400);
      expect((await createRound(db, coordinator, form({ eligibility: { flags: ["RICH"] } }))).status).toBe(400);
    });
  });

  describe("changeRoundStatus (MR-10)", () => {
    it("moves Draft → Open → Closed and logs every change", async () => {
      const id = await create();
      expect(await changeRoundStatus(db, coordinator, id, "OPEN")).toEqual({ status: 200, from: "DRAFT", to: "OPEN" });
      expect(await changeRoundStatus(db, coordinator, id, "CLOSED")).toEqual({ status: 200, from: "OPEN", to: "CLOSED" });

      const log = await db.auditLog.findMany({ where: { entityId: id, action: "ROUND_STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
      expect(log.map((l) => [l.before, l.after])).toEqual([
        [{ status: "DRAFT" }, { status: "OPEN" }],
        [{ status: "OPEN" }, { status: "CLOSED" }],
      ]);
      expect(log.every((l) => l.userId === coordinator.userId)).toBe(true);
    });

    it("refuses any other move", async () => {
      const id = await create();
      expect((await changeRoundStatus(db, coordinator, id, "CLOSED")).status).toBe(409); // skipping Open
      await changeRoundStatus(db, coordinator, id, "OPEN");
      expect((await changeRoundStatus(db, coordinator, id, "DRAFT")).status).toBe(409); // going back
      await changeRoundStatus(db, coordinator, id, "CLOSED");
      expect((await changeRoundStatus(db, coordinator, id, "OPEN")).status).toBe(409); // reopening
    });

    it("won't open a round with no items", async () => {
      const id = await create({ items: [] });
      expect(await changeRoundStatus(db, coordinator, id, "OPEN")).toEqual({ status: 422, error: "no_items" });
    });

    it("refuses volunteers (server-checked)", async () => {
      const id = await create();
      expect(await changeRoundStatus(db, volunteer, id, "OPEN")).toEqual({ status: 403, error: "forbidden" });
      expect((await db.round.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
    });

    it("lets only one of two simultaneous opens win", async () => {
      const id = await create();
      const results = await Promise.all([
        changeRoundStatus(db, coordinator, id, "OPEN"),
        changeRoundStatus(db, admin, id, "OPEN"),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await db.auditLog.count({ where: { entityId: id, action: "ROUND_STATUS_CHANGED" } })).toBe(1);
    });

    it("can't touch another organisation's round", async () => {
      const id = await create();
      const other = await makeOrganisation(db);
      const outsider: Actor = { userId: (await makeUser(db, other.id, "COORDINATOR")).id, role: "COORDINATOR", organisationId: other.id };
      expect(await changeRoundStatus(db, outsider, id, "OPEN")).toEqual({ status: 404, error: "round_not_found" });
      expect(await updateRound(db, outsider, id, { name: "hijacked" })).toEqual({ status: 404, error: "round_not_found" });
    });
  });

  describe("updateRound (MR-10)", () => {
    it("edits everything while Draft, replacing the items, and logs before/after", async () => {
      const id = await create();
      const res = await updateRound(db, coordinator, id, {
        name: "Winter kits, round 2",
        items: [{ name: "Blanket", quantityPerHousehold: 3 }],
        eligibility: { areas: ["Mina"] },
      });
      expect(res).toEqual({ status: 200 });
      const round = await db.round.findUniqueOrThrow({ where: { id }, include: { items: true } });
      expect(round.name).toBe("Winter kits, round 2");
      expect(round.items.map((i) => [i.name, i.quantityPerHousehold])).toEqual([["Blanket", 3]]);
      expect(round.eligibility).toEqual({ areas: ["Mina"] });

      const log = await db.auditLog.findFirstOrThrow({ where: { entityId: id, action: "ROUND_UPDATED" } });
      expect(log.before).toMatchObject({ name: "Winter kits, December" });
      expect(log.after).toMatchObject({ name: "Winter kits, round 2" });
    });

    it("locks items and eligibility once Open, but allows name, date and location", async () => {
      const id = await create();
      await changeRoundStatus(db, coordinator, id, "OPEN");
      expect((await updateRound(db, coordinator, id, { items: [] })).status).toBe(409);
      expect((await updateRound(db, coordinator, id, { eligibility: { areas: ["Mina"] } })).status).toBe(409);
      expect(await updateRound(db, coordinator, id, { location: "Mina centre" })).toEqual({ status: 200 });
    });

    it("refuses any edit once Closed", async () => {
      const id = await create();
      await changeRoundStatus(db, coordinator, id, "OPEN");
      await changeRoundStatus(db, coordinator, id, "CLOSED");
      expect(await updateRound(db, coordinator, id, { name: "late edit" })).toEqual({ status: 409, error: "round_closed" });
    });

    it("refuses volunteers (server-checked)", async () => {
      const id = await create();
      expect(await updateRound(db, volunteer, id, { name: "x" })).toEqual({ status: 403, error: "forbidden" });
    });
  });

  describe("expected list (MR-11)", () => {
    // Mohamad's 500 synthetic households, loaded into their own organisation.
    const seeded = generateHouseholds({ count: 500 });
    let seedOrg: string;
    let seedCoordinator: Actor;

    beforeAll(async () => {
      seedOrg = (await makeOrganisation(db)).id;
      const user = await makeUser(db, seedOrg, "COORDINATOR");
      seedCoordinator = { userId: user.id, role: "COORDINATOR", organisationId: seedOrg };
      const suffix = seedOrg.slice(-6); // card codes are unique across the whole database
      const rows = seeded.map((h) => ({ ...h, id: `${seedOrg}_${h.code}`, code: `${h.code}-${suffix}` }));
      await db.household.createMany({
        data: rows.map((h) => ({
          id: h.id,
          organisationId: seedOrg,
          code: h.code,
          headName: h.headName,
          headNameNormalized: h.headNameNormalized,
          phone: h.phone,
          phoneNormalized: h.phoneNormalized,
          area: h.area,
          address: h.address,
          vulnerabilityFlags: h.vulnerabilityFlags,
          registeredById: user.id,
        })),
      });
      await db.member.createMany({ data: rows.flatMap((h) => h.members.map((m) => ({ ...m, householdId: h.id }))) });
    }, 60_000);

    const roundWith = async (eligibility: Eligibility) => {
      const res = await createRound(db, seedCoordinator, form({ eligibility }));
      if (res.status !== 201) throw new Error("setup failed");
      return res.roundId;
    };

    // The hand check: count straight from the generator's data in plain
    // JavaScript, without the database or the query being tested.
    const handCount = (rules: Eligibility) =>
      seeded.filter((h) => {
        if (rules.areas?.length && !rules.areas.includes(h.area)) return false;
        if (rules.flags?.length && !rules.flags.some((f) => h.vulnerabilityFlags.includes(f))) return false;
        if (rules.minHouseholdSize && h.members.length < rules.minHouseholdSize) return false;
        return true;
      }).length;

    const areas = [...new Set(seeded.map((h) => h.area))].sort();
    const cases: [string, Eligibility][] = [
      ["no rules", {}],
      ["two areas", { areas: areas.slice(0, 2) }],
      ["elderly or disability", { flags: ["ELDERLY", "DISABILITY"] }],
      ["5+ members", { minHouseholdSize: 5 }],
      ["one area, displaced, 4+ members", { areas: [areas[0]], flags: ["DISPLACED"], minHouseholdSize: 4 }],
    ];

    it.each(cases)("count matches a hand check on the 500 seeded households: %s", async (_label, rules) => {
      const id = await roundWith(rules);
      const res = await getExpectedList(db, seedCoordinator, id);
      if (res.status !== 200) throw new Error("unexpected " + res.status);
      expect(res.count).toBe(handCount(rules));
      expect(res.households).toHaveLength(res.count);
    });

    it("agrees household by household with the check recordPickup uses", async () => {
      const rules: Eligibility = { areas: areas.slice(0, 3), minHouseholdSize: 3 };
      const id = await roundWith(rules);
      const res = await getExpectedList(db, seedCoordinator, id);
      if (res.status !== 200) throw new Error("unexpected");
      const listed = new Set(res.households.map((h) => h.code.replace(/-[^-]+$/, "")));
      for (const h of seeded) {
        const eligible = checkEligibility(rules, { area: h.area, flags: h.vulnerabilityFlags, size: h.members.length }) === null;
        expect(listed.has(h.code), h.code).toBe(eligible);
      }
    });

    it("counts a merged household once", async () => {
      const org = (await makeOrganisation(db)).id;
      const user = await makeUser(db, org, "COORDINATOR");
      const actor: Actor = { userId: user.id, role: "COORDINATOR", organisationId: org };
      const a = await makeHousehold(db, { organisationId: org, registeredById: user.id });
      const b = await makeHousehold(db, { organisationId: org, registeredById: user.id });
      await makeHousehold(db, { organisationId: org, registeredById: user.id, status: "INACTIVE" });
      const res = await createRound(db, actor, form());
      if (res.status !== 201) throw new Error("setup failed");

      expect((await getExpectedList(db, actor, res.roundId)) as { count: number }).toMatchObject({ count: 2 });
      // b turns out to be a duplicate of a and is merged into it.
      await db.household.update({ where: { id: b.id }, data: { status: "MERGED", mergedIntoId: a.id } });
      const after = await getExpectedList(db, actor, res.roundId);
      if (after.status !== 200) throw new Error("unexpected");
      expect(after.count).toBe(1);
      expect(after.households.map((h) => h.id)).toEqual([a.id]);
    });

    it("is for coordinators, managers and admins, not volunteers", async () => {
      const id = await create();
      expect((await getExpectedList(db, manager, id)).status).toBe(200);
      expect(await getExpectedList(db, volunteer, id)).toEqual({ status: 403, error: "forbidden" });
    });
  });
});
