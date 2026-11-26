import { Prisma, type PrismaClient, type Role } from "@/generated/prisma/client";
import { checkEligibility, type Eligibility, type IneligibleReason } from "@/lib/eligibility";

// Re-exported so existing imports from "@/lib/pickups" keep working.
export { checkEligibility, type Eligibility } from "@/lib/eligibility";

// Recording and voiding pickups (MR-12, MR-14, MR-16).
// These take the acting user explicitly so they can be tested without a
// session; the server actions that call them get the actor from auth.

// organisationId is the caller's own organisation (from their session).
// Every query below is scoped to it, so one NGO can never touch another's data.
export type Actor = { userId: string; role: Role; organisationId: string };

export type Proxy = { name: string; relation: string; idOrNote: string };

export type PickupResult =
  | { status: 201; pickupId: string; householdId: string }
  | {
      status: 409;
      error: "already_collected";
      existing: { at: Date; volunteer: string; point: string | null; proxy: Proxy | null };
    }
  | { status: 400; error: "proxy_incomplete" }
  | { status: 403; error: "forbidden" }
  | { status: 404; error: "household_not_found" | "round_not_found" }
  | { status: 422; error: "round_not_open" | "household_merged" | "household_inactive" }
  | { status: 422; error: "not_eligible"; reason: IneligibleReason };

const PICKUP_ROLES: Role[] = ["ADMIN", "MANAGER", "COORDINATOR", "VOLUNTEER"];
const VOID_ROLES: Role[] = ["ADMIN", "COORDINATOR"];

/**
 * Record that a household collected its items in a round.
 *
 * There is deliberately NO "has this household already collected?" query
 * before the insert. Two volunteers scanning the same card at the same moment
 * would both see "no" and both insert. Instead we insert once and let the
 * partial unique index "Pickup_one_per_household_per_round" reject the second
 * one (Prisma error P2002), which we turn into a 409 with who/when.
 * The audit row is written in the same transaction as the pickup.
 */
export async function recordPickup(
  db: PrismaClient,
  actor: Actor,
  input: { roundId: string; householdCode: string; point?: string | null; proxy?: Proxy | null }
): Promise<PickupResult> {
  if (!PICKUP_ROLES.includes(actor.role)) return { status: 403, error: "forbidden" };

  const proxy = input.proxy ? normaliseProxy(input.proxy) : null;
  if (input.proxy && !proxy) return { status: 400, error: "proxy_incomplete" };

  // Only rounds and households of the caller's own organisation are visible.
  // Another NGO's round or household looks exactly like one that doesn't exist (404),
  // so the response doesn't reveal what other organisations have.
  const round = await db.round.findFirst({
    where: { id: input.roundId, organisationId: actor.organisationId },
    include: { items: true },
  });
  if (!round) return { status: 404, error: "round_not_found" };
  if (round.status !== "OPEN") return { status: 422, error: "round_not_open" };

  const household = await db.household.findFirst({
    where: { code: input.householdCode, organisationId: actor.organisationId },
    include: { _count: { select: { members: true } } },
  });
  if (!household) return { status: 404, error: "household_not_found" };
  if (household.status === "MERGED") return { status: 422, error: "household_merged" };
  if (household.status === "INACTIVE") return { status: 422, error: "household_inactive" };

  const failed = checkEligibility(round.eligibility as Eligibility, {
    area: household.area,
    flags: household.vulnerabilityFlags,
    size: household._count.members,
  });
  if (failed) return { status: 422, error: "not_eligible", reason: failed };

  const itemsGiven = round.items.map((i) => ({ itemId: i.id, name: i.name, quantity: i.quantityPerHousehold }));

  try {
    const pickup = await db.$transaction(async (tx) => {
      const created = await tx.pickup.create({
        data: {
          roundId: round.id,
          householdId: household.id,
          volunteerId: actor.userId,
          itemsGiven,
          point: input.point?.trim() || null,
          proxyName: proxy?.name ?? null,
          proxyRelation: proxy?.relation ?? null,
          proxyIdOrNote: proxy?.idOrNote ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: "PICKUP_RECORDED",
          entity: "Pickup",
          entityId: created.id,
          after: { roundId: round.id, householdId: household.id, itemsGiven, proxy },
        },
      });
      return created;
    });
    return { status: 201, pickupId: pickup.id, householdId: household.id };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
    // Lost the race, or a genuine second visit: say who got there first.
    const existing = await db.pickup.findFirst({
      where: { roundId: round.id, householdId: household.id, voidedAt: null },
      include: { volunteer: { select: { name: true } } },
    });
    if (!existing) throw err; // the winning pickup was voided in the meantime; let the caller retry
    return {
      status: 409,
      error: "already_collected",
      existing: {
        at: existing.recordedAt,
        volunteer: existing.volunteer.name,
        point: existing.point,
        proxy: existing.proxyName
          ? { name: existing.proxyName, relation: existing.proxyRelation ?? "", idOrNote: existing.proxyIdOrNote ?? "" }
          : null,
      },
    };
  }
}

/** MR-14: a proxy needs a name, a relation, and an ID number or a note. */
function normaliseProxy(p: Proxy): Proxy | null {
  const name = p.name?.trim();
  const relation = p.relation?.trim();
  const idOrNote = p.idOrNote?.trim();
  return name && relation && idOrNote ? { name, relation, idOrNote } : null;
}

/**
 * Void a pickup recorded by mistake (MR-16). Coordinator or Admin only,
 * reason required. Voided pickups are ignored by the unique index, so the
 * household can then collect again.
 */
export async function voidPickup(
  db: PrismaClient,
  actor: Actor,
  input: { pickupId: string; reason: string }
): Promise<{ status: 200 } | { status: 400 | 403 | 404; error: string }> {
  if (!VOID_ROLES.includes(actor.role)) return { status: 403, error: "forbidden" };
  const reason = input.reason?.trim();
  if (!reason) return { status: 400, error: "reason_required" };

  return db.$transaction(async (tx) => {
    // Scoped to the caller's organisation: another NGO's pickup is "not found".
    const res = await tx.pickup.updateMany({
      where: { id: input.pickupId, voidedAt: null, round: { organisationId: actor.organisationId } },
      data: { voidedAt: new Date(), voidedById: actor.userId, voidReason: reason },
    });
    if (res.count === 0) return { status: 404 as const, error: "pickup_not_found_or_already_voided" };
    await tx.auditLog.create({
      data: {
        userId: actor.userId,
        action: "PICKUP_VOIDED",
        entity: "Pickup",
        entityId: input.pickupId,
        after: { reason },
      },
    });
    return { status: 200 as const };
  });
}
