import { describe, expect, it } from "vitest";
import { collapseSpaces, dropLatinArticle, normalizeLatin } from "@/lib/normalize";

describe("Latin: lower-case and trim", () => {
  it("lower-cases", () => {
    expect(normalizeLatin("MOHAMMAD")).toBe("mohammad");
  });
  it("trims leading and trailing spaces", () => {
    expect(normalizeLatin("  Ali  ")).toBe("ali");
  });
  it("collapses inner spaces, tabs and newlines", () => {
    expect(collapseSpaces("Ali \t  Hassan\n")).toBe("Ali Hassan");
  });
  it("treats hyphens as spaces", () => {
    expect(normalizeLatin("Al-Masri")).toBe("al masri");
  });
  it("handles empty and blank input", () => {
    expect(normalizeLatin("")).toBe("");
    expect(normalizeLatin("   ")).toBe("");
  });
});

describe("Latin: drop el/al article", () => {
  it.each([
    ["el masri", "masri"],
    ["al masri", "masri"],
    ["ahmad el halabi", "ahmad halabi"],
  ])("%s -> %s", (input, expected) => {
    expect(dropLatinArticle(input)).toBe(expected);
  });
  it("keeps a lone or final 'al' (it could be a name)", () => {
    expect(dropLatinArticle("al")).toBe("al");
    expect(dropLatinArticle("rami al")).toBe("rami al");
  });
  it("does not touch words that only start with al/el", () => {
    expect(dropLatinArticle("ali elie")).toBe("ali elie");
  });
});
