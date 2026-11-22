import { describe, expect, it } from "vitest";
import {
  alefMaqsuraToYeh,
  dropArabicArticle,
  normalizeArabic,
  removeDiacritics,
  removeTatweel,
  tehMarbutaToHeh,
  unifyAlef,
} from "@/lib/normalize";

describe("Arabic: remove diacritics", () => {
  it("removes fatha, damma, kasra, shadda and sukun", () => {
    expect(removeDiacritics("مُحَمَّد")).toBe("محمد");
    expect(removeDiacritics("عِلْم")).toBe("علم");
  });
  it("removes tanween", () => {
    expect(removeDiacritics("كتابًا")).toBe("كتابا");
  });
  it("removes the superscript alef", () => {
    expect(removeDiacritics("رحمٰن")).toBe("رحمن");
  });
  it("leaves undecorated text unchanged", () => {
    expect(removeDiacritics("محمد")).toBe("محمد");
  });
});

describe("Arabic: remove tatweel", () => {
  it("removes one or many tatweel characters", () => {
    expect(removeTatweel("محـمد")).toBe("محمد");
    expect(removeTatweel("محـــــمد")).toBe("محمد");
  });
});

describe("Arabic: unify alef forms", () => {
  it.each([
    ["أحمد", "احمد"],
    ["إبراهيم", "ابراهيم"],
    ["آمنة", "امنة"],
    ["ٱلله", "الله"],
  ])("%s -> %s", (input, expected) => {
    expect(unifyAlef(input)).toBe(expected);
  });
});

describe("Arabic: ى -> ي", () => {
  it("turns alef maqsura into yeh", () => {
    expect(alefMaqsuraToYeh("مصطفى")).toBe("مصطفي");
    expect(alefMaqsuraToYeh("عيسى")).toBe("عيسي");
  });
});

describe("Arabic: ة -> ه", () => {
  it("turns teh marbuta into heh", () => {
    expect(tehMarbutaToHeh("فاطمة")).toBe("فاطمه");
  });
});

describe("Arabic: drop ال on words after the first", () => {
  it.each([
    ["محمد المصري", "محمد مصري"],
    ["احمد الحلبي الايوبي", "احمد حلبي ايوبي"],
  ])("%s -> %s", (input, expected) => {
    expect(dropArabicArticle(input)).toBe(expected);
  });
  it("keeps the first word as typed", () => {
    expect(dropArabicArticle("الياس حداد")).toBe("الياس حداد");
  });
  it("keeps الله", () => {
    expect(dropArabicArticle("عبد الله")).toBe("عبد الله");
  });
  it("does not leave a word shorter than two letters", () => {
    expect(dropArabicArticle("علي الي")).toBe("علي الي");
  });
});

describe("normalizeArabic: all rules together", () => {
  it("makes different spellings of the same name equal", () => {
    expect(normalizeArabic("فَاطِمَة")).toBe(normalizeArabic("فاطمه"));
    expect(normalizeArabic("أَحْمَـــد")).toBe(normalizeArabic("احمد"));
    expect(normalizeArabic("مُصْطَفَى")).toBe(normalizeArabic("مصطفي"));
  });
  it("turns presentation forms (text copied from a PDF) into normal letters", () => {
    expect(normalizeArabic("ﻣﺤﻤﺪ")).toBe("محمد");
  });
  it("is idempotent: running it twice changes nothing", () => {
    const once = normalizeArabic("إِبْرَاهِيـــم مُصْطَفَى");
    expect(normalizeArabic(once)).toBe(once);
  });
  it("leaves Latin text alone", () => {
    expect(normalizeArabic("Mohammad")).toBe("Mohammad");
  });
});
