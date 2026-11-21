// Demo data only. Never put real beneficiary data here.
// Run with: npm run db:seed
// Optional: SEED_HOUSEHOLDS=100 npm run db:seed (default 500)
import "dotenv/config";
import bcrypt from "bcryptjs";
import type { Role } from "../generated/prisma/client";
import { createPrismaClient } from "../lib/db";
import { generateHouseholds } from "./seed-data/HouseHolds";

const prisma = createPrismaClient();

const DEMO_PASSWORD = "password123";
const DEMO_ORG = "Demo NGO";
const CONSENT_TEXT_VERSION = "v1";

const users: { name: string; email: string; role: Role }[] = [
  { name: "Admin Demo", email: "admin@aidledger.test", role: "ADMIN" },
  { name: "Manager Demo", email: "manager@aidledger.test", role: "MANAGER" },
  { name: "Coordinator Demo", email: "coordinator@aidledger.test", role: "COORDINATOR" },
  { name: "Volunteer Demo", email: "volunteer@aidledger.test", role: "VOLUNTEER" },
];

async function seedUsers() {
  const org =
    (await prisma.organisation.findFirst({ where: { name: DEMO_ORG } })) ??
    (await prisma.organisation.create({ data: { name: DEMO_ORG } }));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const created = [];
  for (const u of users) {
    created.push(
      await prisma.user.upsert({
        where: { email: u.email },
        update: { role: u.role },
        create: { ...u, passwordHash, organisationId: org.id },
      })
    );
  }
  return { org, users: created };
}

// MH-07: 500 synthetic households with members, consent and flags.
// Re-running replaces the demo organisation's households, so the result is
// always the same data set.
async function seedHouseholds(organisationId: string, registrarIds: string[]) {
  const count = Number(process.env.SEED_HOUSEHOLDS ?? 500);
  const households = generateHouseholds({ count });

  const existing = { organisationId };
  await prisma.$transaction([
    prisma.pickup.deleteMany({ where: { household: existing } }),
    prisma.duplicateCandidate.deleteMany({
      where: { OR: [{ householdA: existing }, { householdB: existing }] },
    }),
    prisma.household.updateMany({ where: existing, data: { mergedIntoId: null } }),
    prisma.household.deleteMany({ where: existing }), // members and consents cascade
  ]);

  // Ids are derived from the card code so they are stable between runs.
  const rows = households.map((h, i) => ({ ...h, id: `seed_${h.code}`, registeredById: registrarIds[i % registrarIds.length] }));

  await prisma.$transaction([
    prisma.household.createMany({
      data: rows.map((h) => ({
        id: h.id,
        organisationId,
        code: h.code,
        headName: h.headName,
        headNameNormalized: h.headNameNormalized,
        phone: h.phone,
        phoneNormalized: h.phoneNormalized,
        area: h.area,
        address: h.address,
        vulnerabilityFlags: h.vulnerabilityFlags,
        registeredById: h.registeredById,
        createdAt: h.createdAt,
      })),
    }),
    prisma.member.createMany({
      data: rows.flatMap((h) => h.members.map((m) => ({ ...m, householdId: h.id }))),
    }),
    // No household without consent (AH-10).
    prisma.consent.createMany({
      data: rows.map((h) => ({
        householdId: h.id,
        textVersion: CONSENT_TEXT_VERSION,
        givenAt: h.createdAt,
        recordedById: h.registeredById,
      })),
    }),
  ]);

  return rows;
}

async function main() {
  const started = Date.now();
  const { org, users: seededUsers } = await seedUsers();

  // Households are registered by volunteers and coordinators, like in the field.
  const registrarIds = seededUsers.filter((u) => u.role === "VOLUNTEER" || u.role === "COORDINATOR").map((u) => u.id);
  const households = await seedHouseholds(org.id, registrarIds);

  const members = households.reduce((s, h) => s + h.members.length, 0);
  const arabic = households.filter((h) => h.script === "ar").length;
  console.log(`Seeded "${DEMO_ORG}" with ${users.length} demo users (password: ${DEMO_PASSWORD}).`);
  console.log(
    `Seeded ${households.length} households (${arabic} Arabic, ${households.length - arabic} Latin names), ` +
      `${members} members and ${households.length} consents in ${((Date.now() - started) / 1000).toFixed(1)}s.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
