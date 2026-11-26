import bcrypt from "bcryptjs";
import type { PrismaClient, Role } from "@/generated/prisma/client";

export type SessionUser = { id: string; name: string; email: string; role: Role; organisationId: string };

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "$2b$10$USe3VFfEoWvR8qEDc1pSo.iDCOjXjvocablGyqOyEN3jcthfJ.vv6";

/** Email and password login (HK-12). Returns null for any failure, without saying which. */
export async function verifyCredentials(db: PrismaClient, email: unknown, password: unknown): Promise<SessionUser | null> {
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return null;

  const user = await db.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
  });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role, organisationId: user.organisationId };
}
