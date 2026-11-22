import { describe, expect, it } from "vitest";
import { applyDictionary, buildLookup, normalizeName } from "@/lib/normalize";
import variants from "@/lib/normalize/name-variants.json";

describe("Spelling dictionary", () => {
  it.each(["mohammad", "mohamad", "mhmd", "muhammad", "mohammed", "mohamed"])("%s -> mohammad", (v) => {
    expect(applyDictionary(v)).toBe("mohammad");
  });

  it("replaces each word on its own", () => {
    expect(applyDictionary("mhmd hasan")).toBe("mohammad hassan");
  });

  it("leaves unknown words unchanged", () => {
    expect(applyDictionary("zzz")).toBe("zzz");
  });

  it("can be extended with new data, no code change needed", () => {
    const lookup = buildLookup({ nadim: ["nadeem", "nadime"] });
    expect(applyDictionary("nadeem", lookup)).toBe("nadim");
  });
});

describe("Dictionary data file (name-variants.json)", () => {
  const entries = Object.entries(variants).filter(([key]) => !key.startsWith("_"));

  it("has only lower-case, single-word spellings", () => {
    for (const [canonical, list] of entries) {
      for (const word of [canonical, ...(list as string[])]) {
        expect(word).toBe(word.toLowerCase());
        expect(word).not.toContain(" ");
      }
    }
  });

  it("never lists one spelling under two names", () => {
    const owner = new Map<string, string>();
    for (const [canonical, list] of entries) {
      for (const word of [canonical, ...(list as string[])]) {
        const previous = owner.get(word);
        expect(previous === undefined || previous === canonical, `"${word}" is under "${previous}" and "${canonical}"`).toBe(
          true,
        );
        owner.set(word, canonical);
      }
    }
  });
});

describe("normalizeName: full pipeline", () => {
  it("matches the spellings named in the ticket", () => {
    const expected = normalizeName("Mohammad");
    for (const typed of ["Mohamad", "Mhmd", "Muhammad", "  MOHAMMAD "]) {
      expect(normalizeName(typed)).toBe(expected);
    }
  });

  it("matches Latin spellings of the same full name", () => {
    expect(normalizeName("  MHMD  Hasan ")).toBe(normalizeName("Mohammad Hassan"));
    expect(normalizeName("Fatme El-Masri")).toBe(normalizeName("Fatima Masri"));
    expect(normalizeName("Moustafa Al Halabi")).toBe(normalizeName("Mustafa El Halabi"));
  });

  it("matches Arabic spellings of the same full name", () => {
    expect(normalizeName("مُحَمَّد فَاطِمَة")).toBe(normalizeName("محمد فاطمه"));
    expect(normalizeName("أَحْمَـد عيسى")).toBe(normalizeName("احمد عيسي"));
  });

  it("keeps different people different", () => {
    expect(normalizeName("Ali Haddad")).not.toBe(normalizeName("Hassan Haddad"));
  });

  it("is idempotent", () => {
    const once = normalizeName("Mhmd El-Masri");
    expect(normalizeName(once)).toBe(once);
  });
});
