import { describe, expect, it } from "vitest";
import { normalizePhone, toLatinDigits } from "@/lib/normalize";

describe("Phone: one format (+961...)", () => {
  it.each([
    "03 123 456",
    "03-123456",
    "03123456",
    "+961 3 123 456",
    "009613123456",
    "961-3-123-456",
    "(03) 123 456",
    "3123456",
  ])("%s -> +9613123456", (typed) => {
    expect(normalizePhone(typed)).toBe("+9613123456");
  });

  it.each([
    ["70 123 456", "+96170123456"],
    ["71-234567", "+96171234567"],
    ["+961 76 123 456", "+96176123456"],
    ["0096178123456", "+96178123456"],
    ["79123456", "+96179123456"],
    ["81 123 456", "+96181123456"],
  ])("8-digit mobile %s -> %s", (typed, expected) => {
    expect(normalizePhone(typed)).toBe(expected);
  });

  it("handles landlines", () => {
    expect(normalizePhone("01 234 567")).toBe("+9611234567");
    expect(normalizePhone("06 412 345")).toBe("+9616412345");
  });

  it("handles Arabic-Indic digits", () => {
    expect(toLatinDigits("٠٣١٢٣٤٥٦")).toBe("03123456");
    expect(normalizePhone("٠٣ ١٢٣ ٤٥٦")).toBe("+9613123456");
    expect(normalizePhone("۰۷۰۱۲۳۴۵۶")).toBe("+96170123456");
  });

  it("is idempotent", () => {
    expect(normalizePhone("+9613123456")).toBe("+9613123456");
  });

  it.each(["", "abc", "12", "0312345678901", "+33 6 12 34 56 78", "0000000"])("rejects %j", (typed) => {
    expect(normalizePhone(typed)).toBeNull();
  });
});
