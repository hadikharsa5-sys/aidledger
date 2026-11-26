import type { PrismaClient, VulnerabilityFlag } from "@/generated/prisma/client";

// Round eligibility rules (MR-10) and the expected list (MR-11).
// recordPickup (MR-12) uses the same checkEligibility, so the expected list and
// what happens at the pickup table can never disagree about who qualifies.

export type Eligibility = {
  areas?: string[]; // household's area must be one of these
  flags?: VulnerabilityFlag[]; // household must have at least one of these
  minHouseholdSize?: number; // counted from household members
};

export const VULNERABILITY_FLAGS: VulnerabilityFlag[] = [
  "ELDERLY",
  "DISABILITY",
  "SINGLE_PARENT",
  "CHRONIC_ILLNESS",
  "DISPLACED",
  "LARGE_FAMILY",
  "OTHER",
];

export type IneligibleReason = "area" | "flags" | "household_size";

/** Returns the first rule the household fails, or null if it is eligible. */
export function checkEligibility(
  rules: Eligibility | null,
  household: { area: string; flags: VulnerabilityFlag[]; size: number }
): IneligibleReason | null {
  if (!rules) return null;
  if (rules.areas?.length && !rules.areas.includes(household.area)) return "area";
  if (rules.flags?.length && !rules.flags.some((f) => household.flags.includes(f))) return "flags";
  if (rules.minHouseholdSize && household.size < rules.minHouseholdSize) return "household_size";
  return null;
}

/**
 * Validates and cleans rules coming from a form. Returns the cleaned rules,
 * or an error message for the first problem found.
 */
export function parseEligibility(input: unknown): { ok: true; rules: Eligibility } | { ok: false; error: string } {
  if (input == null) return { ok: true, rules: {} };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "eligibility must be an object" };
  const raw = input as Record<string, unknown>;
  const rules: Eligibility = {};

  if (raw.areas !== undefined) {
    if (!Array.isArray(raw.areas) || raw.areas.some((a) => typeof a !== "string")) {
      return { ok: false, error: "areas must be a list of area names" };
    }
    const areas = [...new Set((raw.areas as string[]).map((a) => a.trim()).filter(Boolean))];
    if (areas.length) rules.areas = areas;
  }

  if (raw.flags !== undefined) {
    if (!Array.isArray(raw.flags) || raw.flags.some((f) => !VULNERABILITY_FLAGS.includes(f as VulnerabilityFlag))) {
      return { ok: false, error: "flags must be a list of known vulnerability flags" };
    }
    const flags = [...new Set(raw.flags as VulnerabilityFlag[])];
    if (flags.length) rules.flags = flags;
  }

  if (raw.minHouseholdSize !== undefined && raw.minHouseholdSize !== null) {
    const n = raw.minHouseholdSize;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 30) {
      return { ok: false, error: "minHouseholdSize must be a whole number from 1 to 30" };
    }
    if (n > 1) rules.minHouseholdSize = n;
  }

  const unknown = Object.keys(raw).filter((k) => !["areas", "flags", "minHouseholdSize"].includes(k));
  if (unknown.length) return { ok: false, error: `unknown eligibility field: ${unknown[0]}` };

  return { ok: true, rules };
}

export type ExpectedHousehold = {
  id: string;
  code: string;
  headName: string;
  area: string;
  size: number;
  flags: VulnerabilityFlag[];
};

/**
 * MR-11: every household of the organisation that qualifies for the rules.
 *
 * Only ACTIVE households count. When duplicates are merged, the absorbed
 * record becomes MERGED and points at the one that stays ACTIVE, so a merged
 * family is counted once. INACTIVE households are left out.
 *
 * Area and flags are filtered in the database; household size is checked with
 * the same checkEligibility that recordPickup uses.
 */
export async function listEligibleHouseholds(
  db: PrismaClient,
  organisationId: string,
  rules: Eligibility
): Promise<ExpectedHousehold[]> {
  const rows = await db.household.findMany({
    where: {
      organisationId,
      status: "ACTIVE",
      ...(rules.areas?.length ? { area: { in: rules.areas } } : {}),
      ...(rules.flags?.length ? { vulnerabilityFlags: { hasSome: rules.flags } } : {}),
    },
    select: {
      id: true,
      code: true,
      headName: true,
      area: true,
      vulnerabilityFlags: true,
      _count: { select: { members: true } },
    },
    orderBy: [{ area: "asc" }, { headName: "asc" }],
  });

  return rows
    .map((h) => ({
      id: h.id,
      code: h.code,
      headName: h.headName,
      area: h.area,
      size: h._count.members,
      flags: h.vulnerabilityFlags,
    }))
    .filter((h) => checkEligibility(rules, { area: h.area, flags: h.flags, size: h.size }) === null);
}
