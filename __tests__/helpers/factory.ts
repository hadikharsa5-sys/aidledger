import type { FlagType, PrismaClient, Role, RoundStatus } from "@/generated/prisma/client";
import type { EligibilityRules } from "@/lib/pickups";

// Small helpers that create fake rows for tests. Synthetic data only.

let seq = 0;
const next = () => `${Date.now().toString(36)}-${++seq}`;

export async function makeUser(db: PrismaClient, role: Role, name = `${role.toLowerCase()}-${next()}`) {
  return db.user.create({ data: { name, email: `${next()}@test.aidledger`, passwordHash: "x", role } });
}

export async function makeArea(db: PrismaClient, name = `Area ${next()}`) {
  return db.area.create({ data: { name } });
}

export async function makeRound(
  db: PrismaClient,
  opts: { status?: RoundStatus; rules?: EligibilityRules; items?: { name: string; qty: number }[] } = {}
) {
  const program = await db.program.create({ data: { name: "Winter kits", startDate: new Date() } });
  return db.round.create({
    data: {
      programId: program.id,
      name: "Winter kits, December",
      date: new Date(),
      location: "Tabbaneh hall",
      status: opts.status ?? "OPEN",
      eligibilityRules: opts.rules ?? {},
      items: {
        create: (opts.items ?? [{ name: "Food parcel", qty: 1 }]).map((i) => ({
          name: i.name,
          quantityPerHousehold: i.qty,
        })),
      },
    },
  });
}

export async function makeHousehold(
  db: PrismaClient,
  opts: { areaId: string; registeredById: string; members?: number; flags?: FlagType[]; status?: "ACTIVE" | "MERGED" | "INACTIVE" }
) {
  return db.household.create({
    data: {
      headName: "Test Family",
      headNameNormalized: "test family",
      areaId: opts.areaId,
      cardCode: `AL-TEST-${next()}`,
      consentGiven: true,
      consentAt: new Date(),
      status: opts.status ?? "ACTIVE",
      registeredById: opts.registeredById,
      members: { create: Array.from({ length: opts.members ?? 1 }, (_, i) => ({ name: `Member ${i + 1}`, relation: i ? "child" : "head" })) },
      flags: { create: (opts.flags ?? []).map((type) => ({ type })) },
    },
  });
}
