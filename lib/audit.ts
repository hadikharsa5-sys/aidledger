import type { Prisma, PrismaClient, Role } from "@/generated/prisma/client";

// Audit log service (HK-15).
// Always pass the transaction client of the action being recorded, so the
// audit row and the change commit or roll back together.

export type AuditAction =
  | "HOUSEHOLD_CREATED"
  | "HOUSEHOLD_UPDATED"
  | "CONSENT_WITHDRAWN"
  | "DUPLICATE_MERGED"
  | "DUPLICATE_DISMISSED"
  | "ROUND_CREATED"
  | "ROUND_UPDATED"
  | "ROUND_STATUS_CHANGED"
  | "PICKUP_RECORDED"
  | "PICKUP_VOIDED"
  | "PICKUP_SYNC_CONFLICT"
  | "USER_CREATED"
  | "USER_DEACTIVATED"
  | "ROLE_CHANGED";

export type AuditEntity = "Household" | "DuplicateCandidate" | "Round" | "Pickup" | "User";

export type AuditEntry = {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

export function writeAudit(tx: Prisma.TransactionClient, actor: { userId: string }, entry: AuditEntry) {
  return tx.auditLog.create({
    data: {
      userId: actor.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
    },
  });
}

/**
 * Change a user's role (Admin only). The change and its ROLE_CHANGED entry
 * are written in the same transaction.
 */
export async function changeUserRole(
  db: PrismaClient,
  actor: { userId: string; role: Role; organisationId: string },
  input: { userId: string; role: Role }
): Promise<{ status: 200; role: Role } | { status: 403 | 404; error: string }> {
  if (actor.role !== "ADMIN") return { status: 403, error: "forbidden" };

  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: input.userId, organisationId: actor.organisationId } });
    if (!user) return { status: 404 as const, error: "user_not_found" };
    if (user.role !== input.role) {
      await tx.user.update({ where: { id: user.id }, data: { role: input.role } });
      await writeAudit(tx, actor, {
        action: "ROLE_CHANGED",
        entity: "User",
        entityId: user.id,
        before: { role: user.role },
        after: { role: input.role },
      });
    }
    return { status: 200 as const, role: input.role };
  });
}
