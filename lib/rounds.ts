import type { Prisma, PrismaClient, Role, RoundStatus } from "@/generated/prisma/client";
import { listEligibleHouseholds, parseEligibility, type Eligibility, type ExpectedHousehold } from "@/lib/eligibility";
import type { Actor } from "@/lib/pickups";

// Distribution rounds (MR-10) and their expected list (MR-11).
// Like lib/pickups.ts these take the acting user explicitly; the server actions
// that call them get the actor from the session (HK-12) and will switch to the
// shared role check (HK-13) and audit helper (HK-15) once those land.

const EDIT_ROLES: Role[] = ["ADMIN", "COORDINATOR"];
const VIEW_ROLES: Role[] = ["ADMIN", "MANAGER", "COORDINATOR"];

// The only allowed moves. No going back: a closed round stays closed, and an
// open round can't return to draft once pickups may have been recorded.
const TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  DRAFT: ["OPEN"],
  OPEN: ["CLOSED"],
  CLOSED: [],
};

export type RoundItemInput = { name: string; quantityPerHousehold: number };

export type RoundInput = {
  name: string;
  date: Date | string;
  location: string;
  items?: RoundItemInput[];
  eligibility?: unknown; // validated by parseEligibility
};

type Failure =
  | { status: 400; error: string }
  | { status: 403; error: "forbidden" }
  | { status: 404; error: "round_not_found" }
  | { status: 409; error: "round_closed" | "round_open" | "invalid_transition" | "status_changed"; detail?: string }
  | { status: 422; error: "no_items" };

type Valid = {
  name?: string;
  date?: Date;
  location?: string;
  items?: RoundItemInput[];
  eligibility?: Eligibility;
};

/** Checks a full or partial round form. Only fields present in `input` are checked. */
function validate(input: Partial<RoundInput>, partial: boolean): { ok: true; value: Valid } | { ok: false; error: string } {
  const value: Valid = {};

  if (input.name !== undefined || !partial) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 120) return { ok: false, error: "name is required (up to 120 characters)" };
    value.name = name;
  }
  if (input.location !== undefined || !partial) {
    const location = typeof input.location === "string" ? input.location.trim() : "";
    if (!location || location.length > 200) return { ok: false, error: "location is required (up to 200 characters)" };
    value.location = location;
  }
  if (input.date !== undefined || !partial) {
    const date = input.date instanceof Date ? input.date : new Date(String(input.date ?? ""));
    if (Number.isNaN(date.getTime())) return { ok: false, error: "date is not a valid date" };
    value.date = date;
  }
  if (input.items !== undefined) {
    if (!Array.isArray(input.items) || input.items.length > 20) return { ok: false, error: "items must be a list of up to 20 items" };
    const items: RoundItemInput[] = [];
    for (const it of input.items) {
      const name = typeof it?.name === "string" ? it.name.trim() : "";
      const qty = it?.quantityPerHousehold;
      if (!name || name.length > 80) return { ok: false, error: "every item needs a name (up to 80 characters)" };
      if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 100) {
        return { ok: false, error: `quantity for "${name}" must be a whole number from 1 to 100` };
      }
      items.push({ name, quantityPerHousehold: qty });
    }
    value.items = items;
  }
  if (input.eligibility !== undefined) {
    const parsed = parseEligibility(input.eligibility);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    value.eligibility = parsed.rules;
  }
  return { ok: true, value };
}

function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  roundId: string,
  before: Prisma.InputJsonValue | undefined,
  after: Prisma.InputJsonValue
) {
  return tx.auditLog.create({ data: { userId: actor.userId, action, entity: "Round", entityId: roundId, before, after } });
}

/** MR-10: create a round. It always starts as DRAFT. */
export async function createRound(
  db: PrismaClient,
  actor: Actor,
  input: RoundInput
): Promise<{ status: 201; roundId: string } | Failure> {
  if (!EDIT_ROLES.includes(actor.role)) return { status: 403, error: "forbidden" };
  const v = validate(input, false);
  if (!v.ok) return { status: 400, error: v.error };
  const { name, date, location, items = [], eligibility = {} } = v.value;

  const round = await db.$transaction(async (tx) => {
    const created = await tx.round.create({
      data: {
        organisationId: actor.organisationId,
        createdById: actor.userId,
        name: name!,
        date: date!,
        location: location!,
        eligibility,
        items: { create: items },
      },
    });
    await audit(tx, actor, "ROUND_CREATED", created.id, undefined, { name, date: date!.toISOString(), location, items, eligibility });
    return created;
  });
  return { status: 201, roundId: round.id };
}

/**
 * MR-10: edit a round.
 * - DRAFT: everything can change.
 * - OPEN: only name, date and location. Items and eligibility are locked so
 *   the expected list can't change in the middle of a distribution.
 * - CLOSED: nothing can change.
 */
export async function updateRound(
  db: PrismaClient,
  actor: Actor,
  roundId: string,
  input: Partial<RoundInput>
): Promise<{ status: 200 } | Failure> {
  if (!EDIT_ROLES.includes(actor.role)) return { status: 403, error: "forbidden" };
  const v = validate(input, true);
  if (!v.ok) return { status: 400, error: v.error };

  const round = await db.round.findFirst({
    where: { id: roundId, organisationId: actor.organisationId },
    include: { items: true },
  });
  if (!round) return { status: 404, error: "round_not_found" };
  if (round.status === "CLOSED") return { status: 409, error: "round_closed" };
  if (round.status === "OPEN" && (v.value.items !== undefined || v.value.eligibility !== undefined)) {
    return { status: 409, error: "round_open", detail: "items and eligibility can't change once a round is open" };
  }

  const { items, ...fields } = v.value;
  const updated = await db.$transaction(async (tx) => {
    // Re-check the status inside the transaction: someone may have opened the
    // round between our read and this write.
    const res = await tx.round.updateMany({
      where: { id: roundId, organisationId: actor.organisationId, status: round.status },
      data: fields,
    });
    if (res.count === 0) return false;
    if (items) {
      await tx.roundItem.deleteMany({ where: { roundId } });
      await tx.roundItem.createMany({ data: items.map((i) => ({ ...i, roundId })) });
    }
    await audit(
      tx,
      actor,
      "ROUND_UPDATED",
      roundId,
      {
        name: round.name,
        date: round.date.toISOString(),
        location: round.location,
        eligibility: round.eligibility as Prisma.InputJsonValue,
        items: round.items.map((i) => ({ name: i.name, quantityPerHousehold: i.quantityPerHousehold })),
      },
      JSON.parse(JSON.stringify(v.value))
    );
    return true;
  });
  if (!updated) return { status: 409, error: "status_changed" };
  return { status: 200 };
}

/**
 * MR-10: move a round to its next status (DRAFT → OPEN → CLOSED).
 * A round can only open if it has at least one item. The change is applied
 * only if the round is still in the status we read, so two coordinators
 * clicking at once can't both "win"; the loser gets 409 status_changed.
 */
export async function changeRoundStatus(
  db: PrismaClient,
  actor: Actor,
  roundId: string,
  to: RoundStatus
): Promise<{ status: 200; from: RoundStatus; to: RoundStatus } | Failure> {
  if (!EDIT_ROLES.includes(actor.role)) return { status: 403, error: "forbidden" };

  const round = await db.round.findFirst({
    where: { id: roundId, organisationId: actor.organisationId },
    include: { _count: { select: { items: true } } },
  });
  if (!round) return { status: 404, error: "round_not_found" };
  const from = round.status;
  if (!TRANSITIONS[from].includes(to)) {
    return { status: 409, error: "invalid_transition", detail: `${from} → ${to} is not allowed` };
  }
  if (to === "OPEN" && round._count.items === 0) return { status: 422, error: "no_items" };

  const changed = await db.$transaction(async (tx) => {
    const res = await tx.round.updateMany({
      where: { id: roundId, organisationId: actor.organisationId, status: from },
      data: { status: to },
    });
    if (res.count === 0) return false;
    await audit(tx, actor, "ROUND_STATUS_CHANGED", roundId, { status: from }, { status: to });
    return true;
  });
  if (!changed) return { status: 409, error: "status_changed" };
  return { status: 200, from, to };
}

/**
 * MR-11: the households expected at a round, and how many.
 * Coordinators, managers and admins only (it lists names).
 */
export async function getExpectedList(
  db: PrismaClient,
  actor: Actor,
  roundId: string
): Promise<{ status: 200; count: number; households: ExpectedHousehold[] } | Failure> {
  if (!VIEW_ROLES.includes(actor.role)) return { status: 403, error: "forbidden" };
  const round = await db.round.findFirst({
    where: { id: roundId, organisationId: actor.organisationId },
    select: { eligibility: true },
  });
  if (!round) return { status: 404, error: "round_not_found" };
  const parsed = parseEligibility(round.eligibility);
  const rules = parsed.ok ? parsed.rules : {};
  const households = await listEligibleHouseholds(db, actor.organisationId, rules);
  return { status: 200, count: households.length, households };
}
