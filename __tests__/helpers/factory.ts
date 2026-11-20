import type { PrismaClient, Role, RoundStatus, VulnerabilityFlag } from "@/generated/prisma/client";
import type { Eligibility } from "@/lib/pickups";

// Small helpers that create fake rows for tests. Synthetic data only.

let seq = 0;
const next = () => `${Date.now().toString(36)}-${++seq}`;

export async function makeOrganisation(db: PrismaClient) {
  return db.organisation.create({ data: { name: `Test NGO ${next()}` } });
}

export async function makeUser(db: PrismaClient, organisationId: string, role: Role, name = `${role.toLowerCase()}-${next()}`) {
  return db.user.create({
    data: { organisationId, name, email: `${next()}@test.aidledger`, passwordHash: "x", role },
  });
}

export async function makeRound(
  db: PrismaClient,
  opts: {
    organisationId: string;
    createdById: string;
    status?: RoundStatus;
    eligibility?: Eligibility;
    items?: { name: string; qty: number }[];
  }
) {
  return db.round.create({
    data: {
      organisationId: opts.organisationId,
      createdById: opts.createdById,
      name: "Winter kits, December",
      date: new Date(),
      location: "Tabbaneh hall",
      status: opts.status ?? "OPEN",
      eligibility: opts.eligibility ?? {},
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
  opts: {
    organisationId: string;
    registeredById: string;
    area?: string;
    members?: number;
    flags?: VulnerabilityFlag[];
    status?: "ACTIVE" | "MERGED" | "INACTIVE";
  }
) {
  return db.household.create({
    data: {
      organisationId: opts.organisationId,
      code: `AL-TEST-${next()}`,
      headName: "Test Family",
      headNameNormalized: "test family",
      area: opts.area ?? "Tripoli",
      vulnerabilityFlags: opts.flags ?? [],
      status: opts.status ?? "ACTIVE",
      registeredById: opts.registeredById,
      consents: { create: { textVersion: "v1", recordedById: opts.registeredById } },
      members: {
        create: Array.from({ length: opts.members ?? 1 }, (_, i) => ({
          name: `Member ${i + 1}`,
          relation: i ? "child" : "head",
        })),
      },
    },
  });
}
