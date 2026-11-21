// Synthetic household generator (MH-07). Pure functions, no database access,
// so it can be unit-tested and reused by the duplicate injector (MH-08).
//
// The same seed always produces the same households, so every teammate and CI
// get identical data and the MH-08 label file stays valid.

import type { VulnerabilityFlag } from "../../generated/prisma/client";
import {
  AREAS,
  FAMILY_NAMES,
  FEMALE_FIRST_NAMES,
  MALE_FIRST_NAMES,
  MOBILE_PREFIXES,
  type NameEntry,
} from "./names";

export type Script = "ar" | "latin";

export type SeedMember = {
  name: string;
  birthYear: number;
  relation: "head" | "spouse" | "child" | "parent";
};

export type SeedHousehold = {
  code: string;
  headName: string;
  headNameNormalized: string;
  phone: string | null;
  phoneNormalized: string | null;
  area: string;
  address: string | null;
  vulnerabilityFlags: VulnerabilityFlag[];
  createdAt: Date;
  script: Script;
  members: SeedMember[];
};

export const DEFAULT_SEED = 20261122;
const REFERENCE_YEAR = 2026;
export const MIN_PARENT_AGE = 18;
export const MAX_PARENT_AGE = 45;
// Households look registered over the 90 days before this date.
const REGISTRATION_END = new Date("2026-11-15T12:00:00Z");

// --- Deterministic random numbers (mulberry32) ------------------------------

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const chance = (rng: Rng, p: number) => rng() < p;

function weightedPick(rng: Rng, items: { name: string; weight: number }[]): string {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item.name;
  }
  return items[items.length - 1].name;
}

// --- Normalisation placeholder ----------------------------------------------

// TEMPORARY: the real normaliser is AH-07 (Ahmad). Until it is merged, the seed
// fills headNameNormalized with this basic version. Swap the import once
// lib/normalize exists so seeded data matches what registration produces.
export function basicNormalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "") // Arabic diacritics and tatweel
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Any typed Lebanese mobile -> +961XXXXXXXX (leading 0 of "03" dropped).
export function normalizeLebanesePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00961")) digits = digits.slice(5);
  else if (digits.startsWith("961")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `+961${digits}`;
}

// --- Pieces of a household --------------------------------------------------

function spell(rng: Rng, entry: NameEntry, script: Script): string {
  return script === "ar" ? entry.ar : pick(rng, entry.latin);
}

// The same person may type their number in many ways; the stored phone keeps
// that variety while phoneNormalized is always +961XXXXXXXX.
function formatPhone(rng: Rng, prefix: string, rest: string): string {
  const a = rest.slice(0, 3);
  const b = rest.slice(3);
  switch (int(rng, 0, 4)) {
    case 0:
      return `${prefix} ${a} ${b}`;
    case 1:
      return `${prefix}-${rest}`;
    case 2:
      return `+961 ${prefix.replace(/^0/, "")} ${a} ${b}`;
    case 3:
      return `${prefix}${rest}`;
    default:
      return `00961${prefix.replace(/^0/, "")}${rest}`;
  }
}

// Opaque card code: no personal data, no confusable characters (0/O, 1/I).
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function makeCode(rng: Rng): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return `AL-${s}`;
}

function householdSize(rng: Rng): number {
  // Mostly 3 to 6 people, a few singles and a few large families.
  const sizes = [1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 7, 8, 9];
  return pick(rng, sizes);
}

const STREETS = ["Main Road", "Mosque Street", "Church Street", "Old Souk", "Port Road", "School Street", "Highway"];

// --- The generator ----------------------------------------------------------

export type GenerateOptions = { count?: number; seed?: number };

export function generateHouseholds({ count = 500, seed = DEFAULT_SEED }: GenerateOptions = {}): SeedHousehold[] {
  const rng = createRng(seed);
  const households: SeedHousehold[] = [];
  const usedNames = new Set<string>(); // "m|first|family", across both scripts
  const usedPhones = new Set<string>();
  const usedCodes = new Set<string>();

  // Catches SEED_HOUSEHOLDS=abc / 0 / -5, which would otherwise wipe the demo
  // households and silently seed none.
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`household count must be a positive whole number, got ${count}`);
  }
  const maxCombos = (MALE_FIRST_NAMES.length + FEMALE_FIRST_NAMES.length) * FAMILY_NAMES.length;
  if (count > maxCombos / 2) throw new Error(`count ${count} is too high for the name lists`);

  while (households.length < count) {
    const script: Script = chance(rng, 0.45) ? "ar" : "latin";
    const size = householdSize(rng);
    const femaleHead = chance(rng, 0.25);
    const family = pick(rng, FAMILY_NAMES);
    const first = pick(rng, femaleHead ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES);

    // No two households share the same head name (in any spelling or script),
    // so the only duplicates in the data are the ones MH-08 injects on purpose.
    const nameKey = `${femaleHead ? "f" : "m"}|${first.ar}|${family.ar}`;
    if (usedNames.has(nameKey)) continue;
    usedNames.add(nameKey);

    const familyName = spell(rng, family, script);
    const headName = `${spell(rng, first, script)} ${familyName}`;
    const headBirthYear = int(rng, 1950, 2002);
    const headAge = REFERENCE_YEAR - headBirthYear;

    // Members: head, maybe a spouse, maybe an elderly parent, then children.
    const members: SeedMember[] = [{ name: headName, birthYear: headBirthYear, relation: "head" }];
    const hasSpouse = size >= 2 && !femaleHead && chance(rng, 0.85);
    if (hasSpouse) {
      const spouseFirst = spell(rng, pick(rng, FEMALE_FIRST_NAMES), script);
      members.push({
        name: `${spouseFirst} ${familyName}`,
        birthYear: Math.min(headBirthYear + int(rng, 0, 8), 2004),
        relation: "spouse",
      });
    }
    if (members.length < size && headAge < 55 && chance(rng, 0.12)) {
      members.push({
        name: `${spell(rng, pick(rng, FEMALE_FIRST_NAMES), script)} ${familyName}`,
        birthYear: headBirthYear - int(rng, 22, 32),
        relation: "parent",
      });
    }
    // Children are born when the head is 18 to 45. Where possible they are 25 or
    // younger (still living at home); an older head has adult children instead.
    const lastChildYear = Math.min(headBirthYear + MAX_PARENT_AGE, REFERENCE_YEAR - 1);
    const firstChildYear = Math.min(Math.max(headBirthYear + MIN_PARENT_AGE, REFERENCE_YEAR - 25), lastChildYear);
    while (members.length < size) {
      const childList = chance(rng, 0.5) ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
      members.push({
        name: `${spell(rng, pick(rng, childList), script)} ${familyName}`,
        birthYear: int(rng, firstChildYear, lastChildYear),
        relation: "child",
      });
    }

    // Flags: derived ones are consistent with the members, the rest random.
    const flags = new Set<VulnerabilityFlag>();
    const hasChildren = members.some((m) => m.relation === "child");
    if (members.some((m) => REFERENCE_YEAR - m.birthYear >= 65)) flags.add("ELDERLY");
    if (!hasSpouse && hasChildren) flags.add("SINGLE_PARENT");
    if (size >= 7) flags.add("LARGE_FAMILY");
    if (chance(rng, 0.08)) flags.add("DISABILITY");
    if (chance(rng, 0.12)) flags.add("CHRONIC_ILLNESS");
    if (chance(rng, 0.15)) flags.add("DISPLACED");
    if (chance(rng, 0.03)) flags.add("OTHER");

    // Phone: about 8% of households have none. Every number is unique.
    let phone: string | null = null;
    let phoneNormalized: string | null = null;
    if (!chance(rng, 0.08)) {
      let prefix: string, rest: string, normalized: string;
      do {
        prefix = pick(rng, MOBILE_PREFIXES);
        rest = String(int(rng, 100000, 999999));
        normalized = normalizeLebanesePhone(prefix + rest);
      } while (usedPhones.has(normalized));
      usedPhones.add(normalized);
      phone = formatPhone(rng, prefix, rest);
      phoneNormalized = normalized;
    }

    let code: string;
    do code = makeCode(rng);
    while (usedCodes.has(code));
    usedCodes.add(code);

    const address = chance(rng, 0.7) ? `${pick(rng, STREETS)}, Building ${int(rng, 1, 60)}, Floor ${int(rng, 0, 8)}` : null;
    const daysAgo = rng() * 90;
    const createdAt = new Date(REGISTRATION_END.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    households.push({
      code,
      headName,
      headNameNormalized: basicNormalizeName(headName),
      phone,
      phoneNormalized,
      area: weightedPick(rng, AREAS),
      address,
      vulnerabilityFlags: [...flags],
      createdAt,
      script,
      members,
    });
  }

  return households;
}
