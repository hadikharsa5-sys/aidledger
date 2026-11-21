// MH-07: checks on the synthetic household generator. No database needed.
import { describe, expect, it } from "vitest";
import { generateHouseholds, normalizeLebanesePhone } from "@/prisma/seed-data/HouseHolds";

const households = generateHouseholds();
const isArabic = (s: string) => /[؀-ۿ]/.test(s);

describe("synthetic household generator (MH-07)", () => {
  it("creates 500 households by default", () => {
    expect(households).toHaveLength(500);
  });

  it("is deterministic for the same seed", () => {
    const again = generateHouseholds();
    expect(again.map((h) => h.code)).toEqual(households.map((h) => h.code));
    expect(generateHouseholds({ seed: 1 })[0].code).not.toBe(households[0].code);
  });

  it("uses unique card codes and unique phone numbers", () => {
    expect(new Set(households.map((h) => h.code)).size).toBe(500);
    const phones = households.flatMap((h) => (h.phoneNormalized ? [h.phoneNormalized] : []));
    expect(new Set(phones).size).toBe(phones.length);
  });

  it("contains no accidental duplicate head names", () => {
    expect(new Set(households.map((h) => h.headNameNormalized)).size).toBe(500);
  });

  it("mixes Arabic and Latin names", () => {
    const arabic = households.filter((h) => isArabic(h.headName)).length;
    expect(arabic).toBeGreaterThan(150);
    expect(arabic).toBeLessThan(350);
  });

  it("gives every household a head member and valid Lebanese phone format", () => {
    for (const h of households) {
      expect(h.members[0]).toMatchObject({ name: h.headName, relation: "head" });
      if (h.phoneNormalized) expect(h.phoneNormalized).toMatch(/^\+961\d{7,8}$/);
    }
  });

  it("derives flags consistently with the members", () => {
    for (const h of households) {
      if (h.members.length >= 7) expect(h.vulnerabilityFlags).toContain("LARGE_FAMILY");
      if (h.vulnerabilityFlags.includes("SINGLE_PARENT")) {
        expect(h.members.some((m) => m.relation === "spouse")).toBe(false);
      }
    }
  });

  it("normalises Lebanese phone formats to +961", () => {
    for (const typed of ["03 123 456", "03-123456", "+961 3 123 456", "009613123456"]) {
      expect(normalizeLebanesePhone(typed)).toBe("+9613123456");
    }
    expect(normalizeLebanesePhone("70 123 456")).toBe("+96170123456");
  });
});
