// Demo data only. Never put real beneficiary data here.
// Run with: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import type { Role } from "../generated/prisma/client";
import { createPrismaClient } from "../lib/db";

// The demo users have a known password. Never create them in production.
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed production");
}

const prisma = createPrismaClient();

const DEMO_PASSWORD = "password123";
const DEMO_ORG = "Demo NGO";

const users: { name: string; email: string; role: Role }[] = [
  { name: "Admin Demo", email: "admin@aidledger.test", role: "ADMIN" },
  { name: "Manager Demo", email: "manager@aidledger.test", role: "MANAGER" },
  { name: "Coordinator Demo", email: "coordinator@aidledger.test", role: "COORDINATOR" },
  { name: "Volunteer Demo", email: "volunteer@aidledger.test", role: "VOLUNTEER" },
];

async function main() {
  const org =
    (await prisma.organisation.findFirst({ where: { name: DEMO_ORG } })) ??
    (await prisma.organisation.create({ data: { name: DEMO_ORG } }));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: { ...u, passwordHash, organisationId: org.id },
    });
  }

  console.log(`Seeded "${DEMO_ORG}" with ${users.length} demo users (password: ${DEMO_PASSWORD}).`);
  console.log("Households come from the synthetic seed script (MH-07).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
