// Demo data only. Never put real beneficiary data here.
// Run with: npx prisma db seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import type { Role } from "../generated/prisma/client";
import { createPrismaClient } from "../lib/db";

const prisma = createPrismaClient();

const DEMO_PASSWORD = "password123";

const users: { name: string; email: string; role: Role }[] = [
  { name: "Admin Demo", email: "admin@aidledger.test", role: "ADMIN" },
  { name: "Coordinator Demo", email: "coordinator@aidledger.test", role: "COORDINATOR" },
  { name: "Volunteer Demo", email: "volunteer@aidledger.test", role: "VOLUNTEER" },
];

// Placeholder list. Replace with the areas the partner NGO actually covers.
const areas = ["Beirut", "Bourj Hammoud", "Tripoli", "Mina", "Akkar", "Baalbek", "Zahle", "Saida", "Tyre"];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: { ...u, passwordHash },
    });
  }

  for (const name of areas) {
    await prisma.area.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log(`Seeded ${users.length} demo users (password: ${DEMO_PASSWORD}) and ${areas.length} areas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
